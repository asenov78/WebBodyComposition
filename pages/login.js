import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setIsSubmitting(true);

        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
        });

        setIsSubmitting(false);

        if (result?.error) {
            setError('Invalid email or password.');
            return;
        }

        // Full page load, not router.push: guarantees the browser sends the
        // just-set session cookie on a fresh top-level request instead of racing
        // a client-side navigation against it (see [...nextauth].js for context).
        window.location.href = result?.url || '/';
    };

    return (
        <div className='columns is-centered'>
            <div className='column is-narrow' style={{ width: '24rem' }}>
                {/* Bulma's Hero component — what the app actually does, for anyone
                    landing here without context. */}
                <section className='hero is-primary is-small is-radiusless block' style={{ borderRadius: '6px' }}>
                    <div className='hero-body'>
                        <p className='title is-5'>Web Body Composition</p>
                        <p className='subtitle is-6'>Your Xiaomi/Yunmai scale → Garmin Connect, automatically.</p>
                        <div className='content is-size-7 mt-3 mb-0'>
                            <ul>
                                <li>Connect once — Xiaomi Cloud and Garmin stay linked to your account.</li>
                                <li>New weigh-ins sync in the background, with the real date — not &quot;today&quot;.</li>
                                <li>Credentials are encrypted and stored server-side, not in your browser.</li>
                            </ul>
                        </div>
                    </div>
                </section>

                <h1 className='title is-4 has-text-centered'>Log In</h1>
                <div className='box'>
                    <form onSubmit={handleSubmit}>
                        <div className='field'>
                            <label className='label'>Email address</label>
                            <div className='control'>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="input"
                                    placeholder="john@example.com"
                                />
                            </div>
                        </div>

                        <div className='field'>
                            <label className='label'>Password</label>
                            <div className='control'>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    className="input"
                                    placeholder="********"
                                />
                            </div>
                        </div>

                        {error && <p className="help is-danger">{error}</p>}

                        <div className='field mt-5'>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className='button is-primary is-fullwidth'
                            >
                                {isSubmitting ? 'Logging in…' : 'Log In'}
                            </button>
                        </div>

                        <p className="has-text-centered is-size-7">
                            No account yet? <Link href="/register">Register</Link>
                        </p>
                        <p className="has-text-centered is-size-7 mt-1">
                            <Link href="/forgot-password">Forgot password?</Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
