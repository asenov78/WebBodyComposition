import { Resend } from 'resend';

// process.env.RESEND_API_KEY isn't set until the Resend integration is wired up —
// constructing Resend(undefined) doesn't throw until you actually try to send, so this
// stays lazy rather than crashing the whole module on import.
const resend = new Resend(process.env.RESEND_API_KEY);

// No custom domain verified with Resend for this project (see TODO.md) — resend.dev
// is Resend's own shared sending domain, usable without DNS setup. Fine for a
// personal-scale password-reset email; revisit if this ever needs real branding.
const FROM = 'Web Body Composition <onboarding@resend.dev>';

export async function sendPasswordResetEmail(toEmail, resetUrl) {
    if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured.');
    }

    const { error } = await resend.emails.send({
        from: FROM,
        to: [toEmail],
        subject: 'Reset your password',
        html: `
            <p>Someone requested a password reset for this account.</p>
            <p><a href="${resetUrl}">Click here to set a new password</a></p>
            <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
        `,
    });

    if (error) {
        throw new Error(`Resend error: ${error.message || JSON.stringify(error)}`);
    }
}
