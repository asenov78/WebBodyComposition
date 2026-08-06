import { prisma } from '../../../lib/prisma';
import { createResetToken } from '../../../lib/passwordReset';
import { sendPasswordResetEmail } from '../../../lib/email';

// Always responds with the same generic message regardless of whether the email
// exists — otherwise this endpoint would let anyone check which addresses have an
// account here (user enumeration).
const GENERIC_RESPONSE = { message: 'If an account exists for that email, a reset link has been sent.' };

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const email = (req.body?.email || '').toLowerCase().trim();
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
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
