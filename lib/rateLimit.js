import { prisma } from './prisma';

const PRUNE_PROBABILITY = 0.01; // ~1 in 100 calls
const PRUNE_AGE_MS = 24 * 60 * 60 * 1000; // rows older than this are useless to any window we use

// DB-backed instead of an in-memory counter — Vercel functions are stateless per
// invocation (a new instance can pick up any request), so an in-memory Map would
// just silently not rate-limit most of the time. No new infra (Upstash/Redis)
// needed at this app's traffic level; Neon Postgres we already have is enough.
export async function checkRateLimit(key, { maxAttempts, windowMs }) {
    // Self-cleaning: no dedicated cron entry for this table, just a low-probability
    // prune on the normal request path. Rows older than 24h are outside every
    // window this app actually uses, so they're pure dead weight.
    if (Math.random() < PRUNE_PROBABILITY) {
        await prisma.rateLimitAttempt.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - PRUNE_AGE_MS) } },
        });
    }

    const windowStart = new Date(Date.now() - windowMs);
    const count = await prisma.rateLimitAttempt.count({
        where: { key, createdAt: { gte: windowStart } },
    });

    if (count >= maxAttempts) {
        return { allowed: false };
    }

    await prisma.rateLimitAttempt.create({ data: { key } });
    return { allowed: true };
}

// Vercel puts the real client IP first in x-forwarded-for (it terminates TLS and
// proxies the request, so req.socket.remoteAddress would just be Vercel's own edge).
export function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
}
