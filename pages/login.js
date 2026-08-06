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
                    </form>
                </div>
            </div>
        </div>
    );
}
