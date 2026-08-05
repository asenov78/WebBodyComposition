import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]';
import { prisma } from '../../../../lib/prisma';
import { syncPendingMeasurementsBatch } from '../../../../lib/garminSync';

// This route has vercel.json maxDuration=30 (see there). 25s time budget leaves a 5s
// margin under that hard cutoff.
const MAX_TIME_BUDGET_MS = 25000;

// Pushes up to `limit` not-yet-synced Measurement rows for this user to Garmin. Kept as
// a manual/interactive fallback — the background cron (pages/api/cron/sync.js) now does
// this automatically, but this stays available for "sync right now" / recovering from
// an MFA prompt / troubleshooting.
export default async function handler(req, res) {
    if (!['GET', 'POST'].includes(req.method)) {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    const userId = session.user.id;

    // Read-only status check — no side effects — so the page can show progress
    // immediately on load/refresh instead of only after clicking "Sync Next Batch".
    if (req.method === 'GET') {
        const [totalMeasurements, syncedCount, remaining] = await Promise.all([
            prisma.measurement.count({ where: { userId } }),
            prisma.measurement.count({ where: { userId, syncedToGarmin: true } }),
            prisma.measurement.count({ where: { userId, syncedToGarmin: false } }),
        ]);
        return res.status(200).json({ totalMeasurements, synced: syncedCount, remaining });
    }

    const { email, password, mfaCode, clientId, limit } = req.body ?? {};
    const batchSize = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 5;

    const result = await syncPendingMeasurementsBatch({
        userId, limit: batchSize, email, password, mfaCode, clientId, timeBudgetMs: MAX_TIME_BUDGET_MS,
    });

    return res.status(200).json(result);
}
