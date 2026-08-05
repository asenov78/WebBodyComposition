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
        where: { userId: session.user.id },
        // Most recent *weigh-in*, not most recent DB-save time — a bulk import creates
        // a batch of rows at nearly the same createdAt, which made this list useless
        // for "what did I actually measure recently".
        orderBy: { sourceDate: 'desc' },
        take: 10,
    });

    return res.status(200).json({ measurements });
}
