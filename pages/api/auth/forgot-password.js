import { prisma } from '../../../lib/prisma';
import { createResetToken } from '../../../lib/passwordReset';
import { sendPasswordResetEmail } from '../../../lib/email';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';

// Always responds with the same generic message regardless of whether the email
// exists — otherwise this endpoint would let anyone check which addresses have an
// account here (user enumeration).
const GENERIC_RESPONSE = { message: 'If an account exists for that email, a reset link has been sent.' };

// Both checks run before the user-existence lookup, and identically regardless of
// whether the account exists — so the rate limit itself doesn't become a second
// enumeration channel. Per-email: stops one address from being email-bombed with
// reset links. Per-IP: stops one source from spamming many different addresses.
const EMAIL_MAX_ATTEMPTS = 3;
const EMAIL_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX_ATTEMPTS = 10;
const IP_WINDOW_MS = 60 * 60 * 1000;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const email = (req.body?.email || '').toLowerCase().trim();
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    const ipCheck = await checkRateLimit(`forgot-password-ip:${getClientIp(req)}`, { maxAttempts: IP_MAX_ATTEMPTS, windowMs: IP_WINDOW_MS });
    if (!ipCheck.allowed) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    const emailCheck = await checkRateLimit(`forgot-password-email:${email}`, { maxAttempts: EMAIL_MAX_ATTEMPTS, windowMs: EMAIL_WINDOW_MS });
    if (!emailCheck.allowed) {
        return res.status(429).json({ error: 'Too many requests for this email. Please try again later.' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (user) {
            const rawToken = await createResetToken(user.id);
            const baseUrl = process.env.NEXTAUTH_URL || `https://${req.headers.host}`;
            const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
            await sendPasswordResetEmail(user.email, resetUrl);
        }
        // If no user matches, do nothing — but still return the generic response
        // below so the response timing/shape doesn't leak whether the email exists.

        return res.status(200).json(GENERIC_RESPONSE);
    } catch (err) {
        console.log(JSON.stringify({ scope: 'forgotPassword.error', message: err?.message }));
        // Still generic on the outside — the real error is in the logs for us to check
        // (e.g. RESEND_API_KEY not configured yet).
        return res.status(200).json(GENERIC_RESPONSE);
    }
}
