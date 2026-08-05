import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { prisma } from '../../lib/prisma';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
        return res.status(401).json({ error: 'Not authenticated.' });
    }

    const measurements = await prisma.measurement.findMany({
        where: {
            userId: session.user.id,
            // "Recent syncs" should mean rows a sync attempt actually touched (success
            // or failure), not just recently-imported-but-still-pending rows — otherwise
            // it fills up with '—' status for whatever has the newest weigh-in date,
            // which after a big Xiaomi import is usually stuff that hasn't synced yet.
            OR: [{ syncedToGarmin: true }, { syncError: { not: null } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
    });

    return res.status(200).json({ measurements });
}
