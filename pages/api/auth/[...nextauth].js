import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../lib/prisma';

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
            async authorize(credentials) {
                // Temporary diagnostics for the "takes several tries to log in" report —
                // pull these with `vercel logs`. Remove once the cause is confirmed.
                const attemptId = Math.random().toString(36).slice(2, 8);
                const startedAt = Date.now();
                const log = (event, extra = {}) => console.log(JSON.stringify({
                    scope: 'auth.authorize', attemptId, event, ms: Date.now() - startedAt, ...extra,
                }));

                log('start', { email: credentials?.email });

                if (!credentials?.email || !credentials?.password) {
                    log('reject.missing_credentials');
                    return null;
                }

                let user;
                try {
                    user = await prisma.user.findUnique({
                        where: { email: credentials.email.toLowerCase().trim() },
                    });
                } catch (err) {
                    log('error.db_lookup', { message: err?.message });
                    throw err;
                }

                if (!user) {
                    log('reject.no_such_user');
                    return null;
                }

                let isValid;
                try {
                    isValid = await bcrypt.compare(credentials.password, user.passwordHash);
                } catch (err) {
                    log('error.bcrypt', { message: err?.message });
                    throw err;
                }

                if (!isValid) {
                    log('reject.bad_password');
                    return null;
                }

                log('success', { userId: user.id });
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
