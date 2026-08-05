import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { prisma } from '../../../lib/prisma';
import { encrypt, decrypt } from '../../../lib/encryption';

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

    if (req.method === 'GET') {
        const cred = await prisma.xiaomiCredential.findUnique({ where: { userId } });
        if (!cred) {
            return res.status(200).json({ connected: false });
        }
        // passToken is returned decrypted on purpose — the Xiaomi Cloud fetch happens
        // client-side (browser calls the proxy directly), so the client needs it to work.
        // Same trust boundary as the rest of this single-tenant-per-login app.
        return res.status(200).json({
            connected: true,
            xiaomiUserId: decrypt(cred.xiaomiUserIdEnc),
            passToken: decrypt(cred.passTokenEnc),
            region: cred.region,
            model: cred.model,
        });
    }

    if (req.method === 'DELETE') {
        await prisma.xiaomiCredential.deleteMany({ where: { userId } });
        return res.status(200).json({ connected: false });
    }

    const { xiaomiUserId, passToken, region, model } = req.body ?? {};
    if (!xiaomiUserId || !passToken) {
        return res.status(400).json({ error: 'xiaomiUserId and passToken are required.' });
    }

    await prisma.xiaomiCredential.upsert({
        where: { userId },
        create: {
            userId,
            xiaomiUserIdEnc: encrypt(String(xiaomiUserId)),
            passTokenEnc: encrypt(String(passToken)),
            region: region || 'de',
            model: model || 'yunmai.scales.ms104',
        },
        update: {
            xiaomiUserIdEnc: encrypt(String(xiaomiUserId)),
            passTokenEnc: encrypt(String(passToken)),
            ...(region && { region }),
            ...(model && { model }),
        },
    });

    return res.status(200).json({ connected: true });
}
