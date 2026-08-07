import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import { checkRateLimit, getClientIp } from '../../lib/rateLimit';

// Per-IP only (not per-email — the whole point of this endpoint is that we don't
// know the email is real/theirs yet). 10 registrations/hour is generous for a real
// user, tight enough to blunt bulk account-creation spam.
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 60 * 1000;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { allowed } = await checkRateLimit(`register:${getClientIp(req)}`, { maxAttempts: MAX_ATTEMPTS, windowMs: WINDOW_MS });
    if (!allowed) {
        return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
    }

    const { email, password } = req.body ?? {};
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
        data: { email: normalizedEmail, passwordHash },
    });

    return res.status(201).json({ id: user.id, email: user.email });
}
