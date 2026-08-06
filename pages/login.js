import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import WeightChart from '../components/weightChart';

// Illustrative only — nobody's logged in yet, so there's no real series to show.
// A believable-looking trend communicates "this is what your tracking will look
// like" faster than another paragraph of text. Deterministic (no Math.random()
// per render) so it doesn't jump around on re-render/hydration.
const SAMPLE_SERIES = [
    82.4, 82.1, 81.9, 82.2, 81.6, 81.3, 81.5, 80.9, 80.6, 80.8,
    80.2, 79.9, 79.7, 80.0, 79.4, 79.1, 78.8, 79.0, 78.5, 78.2,
].map((weight, i) => ({
    sourceDate: new Date(Date.UTC(2026, 0, 1 + i * 2)).toISOString(),
    weight,
}));

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
                    </div>
                </section>

                {/* Same box+chart the real dashboard uses (pages/index.js), fed sample
                    data — a plausible trend line explains "what this tracks" faster
                    than another paragraph, before there's any real data to show. */}
                <div className='box block'>
                    <div className='level is-mobile mb-2'>
                        <div className='level-left'>
                            <div className='level-item'>
                                <p className='has-text-weight-semibold is-size-7'>Your weight, synced automatically</p>
                            </div>
                        </div>
                        <div className='level-right'>
                            <div className='level-item'>
                                <span className='tag is-light is-small'>Sample data</span>
                            </div>
                        </div>
                    </div>
                    <WeightChart series={SAMPLE_SERIES} />
                    <div className='content is-size-7 mt-3 mb-0'>
                        <ul>
                            <li>Connect once — Xiaomi Cloud and Garmin stay linked to your account.</li>
                            <li>New weigh-ins sync in the background, with the real date — not &quot;today&quot;.</li>
                            <li>Credentials are encrypted and stored server-side, not in your browser.</li>
                        </ul>
                    </div>
                </div>

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
