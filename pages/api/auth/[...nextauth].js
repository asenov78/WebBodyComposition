import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/prisma';
import { checkRateLimit, getClientIp } from '../../../lib/rateLimit';

// Per-email: stops one account being brute-forced regardless of source IP.
// Per-IP: stops one source spraying many accounts. Checked before the (expensive)
// bcrypt compare so a rate-limited attempt doesn't even pay that cost.
const LOGIN_EMAIL_MAX_ATTEMPTS = 5;
const LOGIN_EMAIL_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_IP_MAX_ATTEMPTS = 15;
const LOGIN_IP_WINDOW_MS = 15 * 60 * 1000;

export const authOptions = {
    // next-auth v4 looks for NEXTAUTH_SECRET by default; we provision AUTH_SECRET
    // (the Auth.js/v5 name) via the Vercel bootstrap flow, so wire it explicitly
    // here and in middleware.js — otherwise each serverless instance falls back to
    // a different auto-generated secret and JWTs from login can't be verified later.
    secret: process.env.AUTH_SECRET,
    // No adapter on purpose: we do our own prisma.user lookups in authorize() below
    // and there are no OAuth providers needing account linking. Mixing an adapter
    // with pure-Credentials + JWT sessions is a known NextAuth footgun that caused
    // the session cookie to intermittently not be recognized right after login
    // (confirmed via logs: authorize() succeeded every time, but middleware kept
    // seeing hasToken:false for several requests afterward).
    session: {
        strategy: 'jwt',
    },
    pages: {
        signIn: '/login',
    },
    providers: [
        CredentialsProvider({
            name: 'Credentials',
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(credentials, req) {
                if (!credentials?.email || !credentials?.password) {
                    return null;
                }

                const email = credentials.email.toLowerCase().trim();

                const ipCheck = await checkRateLimit(`login-ip:${getClientIp(req)}`, { maxAttempts: LOGIN_IP_MAX_ATTEMPTS, windowMs: LOGIN_IP_WINDOW_MS });
                if (!ipCheck.allowed) {
                    return null;
                }
                const emailCheck = await checkRateLimit(`login-email:${email}`, { maxAttempts: LOGIN_EMAIL_MAX_ATTEMPTS, windowMs: LOGIN_EMAIL_WINDOW_MS });
                if (!emailCheck.allowed) {
                    return null;
                }

                const user = await prisma.user.findUnique({ where: { email } });
                if (!user) {
                    return null;
                }

                const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
                if (!isValid) {
                    return null;
                }

                return { id: user.id, email: user.email };
            },
        }),
    ],
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                token.userId = user.id;
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.id = token.userId;
            }
            return session;
        },
    },
};

export default NextAuth(authOptions);
