import nodemailer from 'nodemailer';

// Resend was tried first (see TODO.md) but this account needs a verified custom
// domain even for its own onboarding@resend.dev sender, and this project has no
// domain of its own. Gmail SMTP sidesteps that entirely — no domain to verify,
// and unlike "verify gmail.com as a sender identity" in a third-party service
// (which fails DMARC — you're spoofing Google's domain from someone else's
// servers), this genuinely authenticates through Google's own SMTP servers, so
// SPF/DKIM alignment is natural. GMAIL_USER/GMAIL_APP_PASSWORD — an App Password
// (myaccount.google.com → Security → 2-Step Verification → App Passwords), not
// the account's real login password.
function getTransport() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD are not configured.');
    }

    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD,
        },
    });
}

export async function sendPasswordResetEmail(toEmail, resetUrl) {
    const transport = getTransport();

    // Awaited fully before the caller responds — a serverless function's
    // background work can get frozen right after the response is sent, so this
    // must not be fire-and-forget.
    await transport.sendMail({
        from: `Web Body Composition <${process.env.GMAIL_USER}>`,
        to: toEmail,
        subject: 'Reset your password',
        html: `
            <p>Someone requested a password reset for this account.</p>
            <p><a href="${resetUrl}">Click here to set a new password</a></p>
            <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
        `,
    });
}
