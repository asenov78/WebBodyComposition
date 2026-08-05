import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { prisma } from '../../../../lib/prisma';
import { pushMeasurementToGarmin } from '../../../../lib/garminSync';

// Pushes every not-yet-synced Measurement row for this user to Garmin, one at a time
// (the proxy is a single-account login per request, so this can't be parallelized).
// First call must include email/password (to establish/refresh the connection); once
// GarminCredential has a saved OAuth token, later calls need nothing else.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    const userId = session.user.id;

    const { email, password, mfaCode, clientId } = req.body ?? {};

    const pending = await prisma.measurement.findMany({
        where: { userId, syncedToGarmin: false },
        orderBy: { sourceDate: 'asc' },
    });

    if (pending.length === 0) {
        return res.status(200).json({ synced: 0, failed: 0, total: 0, message: 'Nothing to sync.' });
    }

    let synced = 0;
    const failures = [];

    for (let i = 0; i < pending.length; i += 1) {
        const measurement = pending[i];

        const { status, data } = await pushMeasurementToGarmin({
            userId,
            measurement,
            // Credentials/MFA only apply to the first request in the batch — every
            // request after that reuses the OAuth token pushMeasurementToGarmin just saved.
            email: i === 0 ? email : undefined,
            password: i === 0 ? password : undefined,
            mfaCode: i === 0 ? mfaCode : undefined,
            clientId: i === 0 ? clientId : undefined,
            rememberCredentials: true,
        });

        if (status === 201) {
            await prisma.measurement.update({
                where: { id: measurement.id },
                data: { syncedToGarmin: true, syncError: null },
            });
            synced += 1;
        } else if (status === 200 && data?.clientId) {
            // MFA required — stop the batch here and hand control back to the client
            // so it can prompt for the code and resume (the rest are still pending).
            return res.status(200).json({
                synced, failed: failures.length, total: pending.length,
                mfaRequired: true, clientId: data.clientId,
            });
        } else {
            await prisma.measurement.update({
                where: { id: measurement.id },
                data: { syncError: data?.error || `HTTP ${status}` },
            });
            failures.push({ id: measurement.id, error: data?.error || `HTTP ${status}` });
            // A 401 on the very first item means bad credentials — no point burning
            // through the rest of the batch with the same failure.
            if (status === 401 && i === 0) break;
        }
    }

    return res.status(200).json({ synced, failed: failures.length, total: pending.length, failures });
}
