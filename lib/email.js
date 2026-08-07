import { Resend } from 'resend';

// Second attempt at Resend (see TODO.md/memory for the first) — that time this
// account had no verified domain, so even its own onboarding@resend.dev sender
// failed with "Domain is not verified". Now that karolev.org is owned and
// verified in Resend, sending from it directly works — no subdomain needed.
// Dedicated deliverability tracking, no personal-Gmail sending caps/ToS exposure
// for automated app mail (the tradeoffs that made Gmail SMTP the interim fix).
const FROM = 'Web Body Composition <noreply@karolev.org>';

function getClient() {
    if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY is not configured.');
    }
    return new Resend(process.env.RESEND_API_KEY);
}

export async function sendPasswordResetEmail(toEmail, resetUrl) {
    const resend = getClient();

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
