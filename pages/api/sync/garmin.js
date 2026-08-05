import axios from 'axios';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '../../../lib/prisma';
import { encrypt, decrypt } from '../../../lib/encryption';

const GARMIN_PROXY_URL = 'https://frog01-20364.wykr.es/upload';

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

    const stored = await prisma.garminCredential.findUnique({ where: { userId } });

    // Prefer freshly-typed credentials (first run / user is changing them);
    // otherwise fall back to what's stored encrypted from a previous sync.
    const resolvedEmail = email || (stored ? decrypt(stored.emailEnc) : undefined);
    const resolvedPassword = password || (stored ? decrypt(stored.passwordEnc) : undefined);
    const accessToken = stored?.accessTokenEnc ? decrypt(stored.accessTokenEnc) : undefined;
    const tokenSecret = stored?.tokenSecretEnc ? decrypt(stored.tokenSecretEnc) : undefined;

    if (!resolvedEmail || !resolvedPassword) {
        return res.status(400).json({ error: 'Garmin email and password are required for the first sync.' });
    }

    const payload = {
        timeStamp: -1,
        weight: parseFloat(weight),
        percentFat: parseFloat(fat ?? 0),
        percentHydration: parseFloat(waterPercentage ?? 0),
        boneMass: parseFloat(boneMass ?? 0),
        muscleMass: parseFloat(muscleMass ?? 0),
        visceralFatRating: parseFloat(visceralFat ?? 0),
        physiqueRating: parseFloat(bodyType ?? 0),
        metabolicAge: parseFloat(metabolicAge ?? 0),
        bodyMassIndex: parseFloat(bmi ?? 0),
        email: resolvedEmail,
        password: resolvedPassword,
        mfaCode,
        clientId,
        accessToken,
        tokenSecret,
    };

    try {
        const proxyResponse = await axios.post(GARMIN_PROXY_URL, payload, {
            headers: { accept: 'application/json', 'Content-Type': 'application/json' },
            validateStatus: () => true, // we want to inspect 200/201/401 ourselves, not throw
        });

        const { status, data } = proxyResponse;

        // 201 = uploaded. Persist creds (+ any new OAuth token) if the user opted in,
        // so future syncs need nothing but the Bluetooth scan.
        if (status === 201 && rememberCredentials) {
            await prisma.garminCredential.upsert({
                where: { userId },
                create: {
                    userId,
                    emailEnc: encrypt(resolvedEmail),
                    passwordEnc: encrypt(resolvedPassword),
                    accessTokenEnc: encrypt(data?.uploadResult?.accessToken),
                    tokenSecretEnc: encrypt(data?.uploadResult?.tokenSecret),
                },
                update: {
                    emailEnc: encrypt(resolvedEmail),
                    passwordEnc: encrypt(resolvedPassword),
                    ...(data?.uploadResult?.accessToken && { accessTokenEnc: encrypt(data.uploadResult.accessToken) }),
                    ...(data?.uploadResult?.tokenSecret && { tokenSecretEnc: encrypt(data.uploadResult.tokenSecret) }),
                },
            });

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

        // Stored access token was rejected — clear it so the next attempt asks for a fresh login.
        if (status === 401 && stored) {
            await prisma.garminCredential.update({
                where: { userId },
                data: { accessTokenEnc: null, tokenSecretEnc: null },
            });
        }

        return res.status(status).json(data);
    } catch (err) {
        console.log(err);
        return res.status(502).json({ error: 'Could not reach the Garmin upload proxy.' });
    }
}
