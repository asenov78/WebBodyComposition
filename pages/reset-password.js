import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ResetPassword() {
    const router = useRouter();
    const { token } = router.query;

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDone, setIsDone] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Could not reset password.');
                return;
            }

            setIsDone(true);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className='columns is-centered'>
            <div className='column is-narrow' style={{ width: '24rem' }}>
                <h1 className='title is-4 has-text-centered'>Reset Password</h1>
                <div className='box'>
                    {isDone ? (
                        <div className='has-text-centered'>
                            <p className='mb-4'>✅ Password updated. You can log in now.</p>
                            <Link href="/login" className='button is-primary is-fullwidth'>Log In</Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className='field'>
                                <label className='label'>New password</label>
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
                                <label className='label'>Confirm new password</label>
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
                                    disabled={isSubmitting || !token}
                                    className='button is-primary is-fullwidth'
                                >
                                    {isSubmitting ? 'Saving…' : 'Set new password'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
