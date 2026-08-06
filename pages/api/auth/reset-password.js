import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/prisma';
import { findValidResetToken, consumeResetToken } from '../../../lib/passwordReset';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { token, password } = req.body ?? {};
    if (!token || !password) {
        return res.status(400).json({ error: 'Token and password are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const record = await findValidResetToken(token);
    if (!record) {
        return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
    });
    await consumeResetToken(record.id);

    return res.status(200).json({ message: 'Password updated.' });
}
