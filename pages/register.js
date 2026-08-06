import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Registration failed.');
                return;
            }

            const signInResult = await signIn('credentials', {
                email,
                password,
                redirect: false,
            });

            if (signInResult?.error) {
                setError('Registered, but automatic sign-in failed. Please log in manually.');
                window.location.href = '/login';
                return;
            }

            // Full page load, not router.push — see pages/login.js for why.
            window.location.href = signInResult?.url || '/';
        } catch (err) {
            console.log(err);
            setError('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className='columns is-centered'>
            <div className='column is-narrow' style={{ width: '24rem' }}>
                <h1 className='title is-4 has-text-centered'>Create Account</h1>
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
                                    minLength={8}
                                    className="input"
                                    placeholder="At least 8 characters"
                                />
                            </div>
                        </div>

                        <div className='field'>
                            <label className='label'>Confirm Password</label>
                            <div className='control'>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                                {isSubmitting ? 'Creating account…' : 'Register'}
                            </button>
                        </div>

                        <p className="has-text-centered is-size-7">
                            Already have an account? <Link href="/login">Log in</Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
