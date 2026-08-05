import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '../../../lib/prisma';
import { decrypt } from '../../../lib/encryption';
import { pushMeasurementToGarmin } from '../../../lib/garminSync';

export default async function handler(req, res) {
    if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    const userId = session.user.id;

    // Status check: does this user already have Garmin credentials on file?
    // Never returns the decrypted secrets themselves.
    if (req.method === 'GET') {
        const cred = await prisma.garminCredential.findUnique({ where: { userId } });
        if (!cred) {
            return res.status(200).json({ connected: false });
        }
        return res.status(200).json({
            connected: true,
            email: decrypt(cred.emailEnc),
            hasToken: Boolean(cred.accessTokenEnc && cred.tokenSecretEnc),
        });
    }

    if (req.method === 'DELETE') {
        await prisma.garminCredential.deleteMany({ where: { userId } });
        return res.status(200).json({ connected: false });
    }

    const {
        weight, bmi, fat, muscleMass, waterPercentage, boneMass,
        visceralFat, metabolicAge, bodyType,
        email, password, mfaCode, clientId,
        rememberCredentials,
    } = req.body ?? {};

    const { status, data } = await pushMeasurementToGarmin({
        userId,
        measurement: { weight, bmi, fat, muscleMass, waterPercentage, boneMass, visceralFat, metabolicAge, bodyType },
        email, password, mfaCode, clientId, rememberCredentials,
    });

    if (status === 201 && rememberCredentials) {
        await prisma.measurement.create({
            data: {
                userId, weight: parseFloat(weight) || 0, bmi: parseFloat(bmi) || null,
                fat: parseFloat(fat) || null, muscleMass: parseFloat(muscleMass) || null,
                waterPercentage: parseFloat(waterPercentage) || null, boneMass: parseFloat(boneMass) || null,
                visceralFat: parseFloat(visceralFat) || null, metabolicAge: parseFloat(metabolicAge) || null,
                bodyType: parseFloat(bodyType) || null, syncedToGarmin: true,
            },
        });
    }

    return res.status(status).json(data);
}
