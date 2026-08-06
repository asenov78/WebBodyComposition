import axios from 'axios';
import { prisma } from './prisma';
import { encrypt, decrypt } from './encryption';

// Defaults to the original author's hosted proxy; set GARMIN_PROXY_URL to point at a
// self-hosted instance instead (see TODO.md — we run lswiderski/yet-another-garmin-
// connect-client-api on linux-bot, exposed via Tailscale Funnel). Request/response
// shape confirmed identical from that project's source (src/Api/Contracts/
// BodyCompositionRequest.cs, src/Api/Endpoints/UploadEndpoints.cs) — same field names,
// same /upload route, same unix-seconds timeStamp handling.
const GARMIN_PROXY_URL = process.env.GARMIN_PROXY_URL || 'https://frog01-20364.wykr.es/upload';

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
    const timeStamp = computeGarminTimeStamp(measurement.sourceDate);

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
        //
        // 20s, not 6s: a *fresh* login (first-time connect, no cached OAuth token) does
        // a full Garmin SSO round-trip and now regularly takes 7s+ — confirmed by timing
        // a real request against the proxy directly (7.4s for a rejected login). 6s was
        // aborting every first-time connect attempt before the proxy could even respond.
        // Still comfortably under this function's 30s Vercel maxDuration (vercel.json).
        proxyResponse = await axios.post(GARMIN_PROXY_URL, payload, {
            headers: { accept: 'application/json', 'Content-Type': 'application/json' },
            validateStatus: () => true,
            timeout: 20000,
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

// Shared by pages/api/sync/garmin/bulk.js (interactive) and pages/api/cron/sync.js
// (background/scheduled). Processes up to `limit` not-yet-synced measurements for one
// user, respecting a time budget so a single call can't run forever, with a pacing
// delay between requests (see pushMeasurementToGarmin's timeout comment for why).
export async function syncPendingMeasurementsBatch({ userId, limit, email, password, mfaCode, clientId, timeBudgetMs = 25000 }) {
    const totalPending = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
    if (totalPending === 0) {
        return { synced: 0, failed: 0, totalPending: 0, remaining: 0, message: 'Nothing to sync.' };
    }

    const batch = await prisma.measurement.findMany({
        where: { userId, syncedToGarmin: false },
        orderBy: { sourceDate: 'asc' },
        take: limit,
    });

    let synced = 0;
    const failures = [];
    const startedAt = Date.now();

    for (let i = 0; i < batch.length; i += 1) {
        if (Date.now() - startedAt > timeBudgetMs) break;
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 400));

        const measurement = batch[i];

        const { status, data } = await pushMeasurementToGarmin({
            userId,
            measurement,
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
            const remaining = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
            return { synced, failed: failures.length, totalPending, remaining, mfaRequired: true, clientId: data.clientId };
        } else {
            const errorMessage = extractErrorMessage(data, status);
            await prisma.measurement.update({
                where: { id: measurement.id },
                data: { syncError: errorMessage },
            });
            failures.push({ id: measurement.id, error: errorMessage });

            if (i === 0) {
                const remaining = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
                return {
                    synced, failed: failures.length, totalPending, remaining,
                    firstError: errorMessage, stoppedEarly: true, failures,
                };
            }
        }
    }

    const remaining = await prisma.measurement.count({ where: { userId, syncedToGarmin: false } });
    return { synced, failed: failures.length, totalPending, remaining, failures };
}

// -1 tells the proxy "use right now". Unix *seconds* is the confirmed-correct unit
// (see the comment on the call site) — pulled out as a pure function so the unit
// choice has a regression test instead of just a comment.
export function computeGarminTimeStamp(sourceDate) {
    if (!sourceDate) return -1;
    return Math.floor(new Date(sourceDate).getTime() / 1000);
}

// The proxy doesn't always return {"error": "..."} — sometimes it's a bare string body,
// sometimes an object with a different shape. Try to pull something readable out of
// whatever we got instead of always falling back to a bare "HTTP 401".
export function extractErrorMessage(data, status) {
    if (typeof data === 'string' && data.trim()) return data.trim();
    if (data?.error) return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    if (data?.message) return data.message;
    if (data && typeof data === 'object' && Object.keys(data).length > 0) return JSON.stringify(data);
    if (status === 401) return 'Garmin rejected the email/password (401 Unauthorized).';
    return `HTTP ${status}`;
}
