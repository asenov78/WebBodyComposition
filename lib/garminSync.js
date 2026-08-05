import axios from 'axios';
import { prisma } from './prisma';
import { encrypt, decrypt } from './encryption';

const GARMIN_PROXY_URL = 'https://frog01-20364.wykr.es/upload';

// Shared by pages/api/sync/garmin.js (single, form-driven) and
// pages/api/sync/garmin/bulk.js (loops this over every unsynced Measurement).
// `measurement` uses the same field names as the Measurement Prisma model.
export async function pushMeasurementToGarmin({ userId, measurement, email, password, mfaCode, clientId, rememberCredentials }) {
    const stored = await prisma.garminCredential.findUnique({ where: { userId } });

    const resolvedEmail = email || (stored ? decrypt(stored.emailEnc) : undefined);
    const resolvedPassword = password || (stored ? decrypt(stored.passwordEnc) : undefined);
    const accessToken = stored?.accessTokenEnc ? decrypt(stored.accessTokenEnc) : undefined;
    const tokenSecret = stored?.tokenSecretEnc ? decrypt(stored.tokenSecretEnc) : undefined;

    if (!resolvedEmail || !resolvedPassword) {
        return { status: 400, data: { error: 'Garmin email and password are required for the first sync.' } };
    }

    // -1 tells the proxy "use right now" — fine for the manual single-entry form (you're
    // weighing yourself as you submit), but wrong for bulk/historical imports where every
    // record was landing on today's date instead of when it was actually recorded.
    // sourceDate (set on import from Xiaomi Cloud) carries the real weigh-in time.
    //
    // Unit is genuinely unconfirmed: unix seconds silently fell back to "now" (no error);
    // unix milliseconds threw "Value to add was out of range" (a .NET DateTime.AddX
    // overflow — consistent with the server treating our ms value as seconds and blowing
    // past year 9999). Back on seconds for this round since ms provably crashes; logging
    // the full raw proxy response now (not just an extracted message) so the next attempt
    // is evidence-based instead of another guess.
    const timeStamp = measurement.sourceDate
        ? Math.floor(new Date(measurement.sourceDate).getTime() / 1000)
        : -1;

    if (measurement.sourceDate) {
        console.log(JSON.stringify({
            scope: 'garminSync.timeStamp', sourceDate: measurement.sourceDate, timeStamp,
        }));
    }

    const payload = {
        timeStamp,
        weight: parseFloat(measurement.weight),
        percentFat: parseFloat(measurement.fat ?? 0),
        percentHydration: parseFloat(measurement.waterPercentage ?? 0),
        boneMass: parseFloat(measurement.boneMass ?? 0),
        muscleMass: parseFloat(measurement.muscleMass ?? 0),
        visceralFatRating: parseFloat(measurement.visceralFat ?? 0),
        physiqueRating: parseFloat(measurement.bodyType ?? 0),
        metabolicAge: parseFloat(measurement.metabolicAge ?? 0),
        bodyMassIndex: parseFloat(measurement.bmi ?? 0),
        email: resolvedEmail,
        password: resolvedPassword,
        mfaCode,
        clientId,
        accessToken,
        tokenSecret,
    };

    let proxyResponse;
    try {
        // Without an explicit timeout, a hung/rate-limited proxy call blocks forever —
        // in a bulk loop that means the whole serverless function eventually gets killed
        // by the platform with zero progress recorded (confirmed via logs: several batches
        // logged "about to call the proxy" for 2-4 items and then nothing — no response,
        // no error, no DB write — right after a fast burst of successful uploads, which
        // smells like the proxy/Garmin started throttling us). Fail fast instead so the
        // loop can record a clean error and move on / stop.
        proxyResponse = await axios.post(GARMIN_PROXY_URL, payload, {
            headers: { accept: 'application/json', 'Content-Type': 'application/json' },
            validateStatus: () => true,
            timeout: 6000,
        });
    } catch (err) {
        console.log(JSON.stringify({ scope: 'garminSync.proxyError', message: err?.message, code: err?.code }));
        return { status: 502, data: { error: `Could not reach the Garmin upload proxy (${err?.code || err?.message || 'unknown error'}).` } };
    }

    const { status, data } = proxyResponse;

    console.log(JSON.stringify({
        scope: 'garminSync.proxyResponse', status,
        data: typeof data === 'string' ? data.slice(0, 2000) : data,
    }));

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
    }

    if (status === 401 && stored) {
        await prisma.garminCredential.update({
            where: { userId },
            data: { accessTokenEnc: null, tokenSecretEnc: null },
        });
    }

    return { status, data };
}
