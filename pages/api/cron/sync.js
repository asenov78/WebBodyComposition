import { prisma } from '../../../lib/prisma';
import { fetchAndImportXiaomiWeights } from '../../../lib/xiaomiSync';
import { syncPendingMeasurementsBatch } from '../../../lib/garminSync';

// Runs unattended (triggered by an external scheduler — see .github/workflows/sync-cron.yml
// and TODO.md for why not Vercel's own Cron: Hobby plan caps it at once/day, too coarse).
//
// For every user that has both a saved Xiaomi Cloud connection and a saved Garmin
// connection: pull the latest Xiaomi weights (dedup'd on import), then push a batch of
// whatever's still pending to Garmin. No browser needs to be open for this to run.
const TIME_BUDGET_MS = 25000;
const GARMIN_BATCH_PER_USER = 10;

export default async function handler(req, res) {
    const providedSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Not authorized.' });
    }

    const eligibleUsers = await prisma.user.findMany({
        where: { garminCredential: { isNot: null } },
        select: { id: true, email: true, xiaomiCredential: { select: { id: true } } },
    });

    const results = [];
    const startedAt = Date.now();

    for (const user of eligibleUsers) {
        if (Date.now() - startedAt > TIME_BUDGET_MS) {
            results.push({ userId: user.id, skipped: true, reason: 'ran out of time budget for this invocation' });
            continue;
        }

        const userResult = { userId: user.id, email: user.email };

        if (user.xiaomiCredential) {
            userResult.xiaomi = await fetchAndImportXiaomiWeights(user.id);
        } else {
            userResult.xiaomi = { skipped: true, reason: 'no Xiaomi Cloud connection saved' };
        }

        const remainingBudget = TIME_BUDGET_MS - (Date.now() - startedAt);
        userResult.garmin = await syncPendingMeasurementsBatch({
            userId: user.id,
            limit: GARMIN_BATCH_PER_USER,
            timeBudgetMs: Math.max(3000, remainingBudget - 2000), // leave headroom for the response itself
        });

        results.push(userResult);
    }

    console.log(JSON.stringify({ scope: 'cron.sync', userCount: eligibleUsers.length, results }));

    return res.status(200).json({ processedUsers: eligibleUsers.length, results });
}
