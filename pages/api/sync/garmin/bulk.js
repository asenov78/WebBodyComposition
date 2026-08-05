import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { prisma } from '../../../../lib/prisma';
import { pushMeasurementToGarmin } from '../../../../lib/garminSync';

// Vercel serverless functions have a hard execution time limit (10s on Hobby by
// default). Each Garmin proxy call can take a second or more, so looping through
// dozens/hundreds of measurements in one request either times out mid-batch (the
// client sees a bare network failure, no useful error) or — worse — silently drops
// the tail of the batch. We process at most `limit` per call and tell the client how
// many are still pending so it can call again ("Sync next batch") instead.
const MAX_TIME_BUDGET_MS = 8000;

// Pushes up to `limit` not-yet-synced Measurement rows for this user to Garmin, one at
// a time (the proxy is a single-account login per request, so this can't be parallelized).
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

    const { email, password, mfaCode, clientId, limit } = req.body ?? {};
    const batchSize = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 5;

    const totalPending = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
    if (totalPending === 0) {
        return res.status(200).json({ synced: 0, failed: 0, totalPending: 0, remaining: 0, message: 'Nothing to sync.' });
    }

    const batch = await prisma.measurement.findMany({
        where: { userId, syncedToGarmin: false },
        orderBy: { sourceDate: 'asc' },
        take: batchSize,
    });

    let synced = 0;
    const failures = [];
    const startedAt = Date.now();

    for (let i = 0; i < batch.length; i += 1) {
        if (Date.now() - startedAt > MAX_TIME_BUDGET_MS) {
            // Ran out of time budget mid-batch — stop cleanly rather than risk the
            // platform killing the function outright. Whatever's left is still
            // "pending" in the DB, so the client can just call again.
            break;
        }

        const measurement = batch[i];

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
            const remaining = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
            return res.status(200).json({
                synced, failed: failures.length, totalPending, remaining,
                mfaRequired: true, clientId: data.clientId,
            });
        } else {
            const errorMessage = extractErrorMessage(data, status);
            await prisma.measurement.update({
                where: { id: measurement.id },
                data: { syncError: errorMessage },
            });
            failures.push({ id: measurement.id, error: errorMessage });

            // Any non-success status on the very first item means the connection itself
            // didn't establish (bad credentials, proxy down, etc) — every later item would
            // fail the exact same way with no stored token to fall back on, so stop instead
            // of burning through the whole batch for nothing.
            if (i === 0) {
                const remaining = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
                return res.status(200).json({
                    synced, failed: failures.length, totalPending, remaining,
                    firstError: errorMessage, stoppedEarly: true, failures,
                });
            }
        }
    }

    const remaining = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
    return res.status(200).json({ synced, failed: failures.length, totalPending, remaining, failures });
}

// The proxy doesn't always return {"error": "..."} — sometimes it's a bare string body,
// sometimes an object with a different shape. Try to pull something readable out of
// whatever we got instead of always falling back to a bare "HTTP 401".
function extractErrorMessage(data, status) {
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data?.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    if (data?.message) return data.message;
    if (data && typeof data === 'object' && Object.keys(data).length > 0) return JSON.stringify(data);
    if (status === 401) return 'Garmin rejected the email/password (401 Unauthorized).';
    return `HTTP ${status}`;
}
