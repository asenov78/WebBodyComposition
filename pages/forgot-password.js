import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setMessage('');

        try {
            const res = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const data = await res.json();
            setMessage(data.message || 'If an account exists for that email, a reset link has been sent.');
        } catch {
            setMessage('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className='columns is-centered'>
            <div className='column is-narrow' style={{ width: '24rem' }}>
                <h1 className='title is-4 has-text-centered'>Forgot Password</h1>
                <div className='box'>
                    <form onSubmit={handleSubmit}>
                        <p className='is-size-7 has-text-grey mb-4'>
                            Enter your account email — we&apos;ll send a link to set a new password.
                        </p>

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

                        {message && <p className="help">{message}</p>}

                        <div className='field mt-5'>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className='button is-primary is-fullwidth'
                            >
                                {isSubmitting ? 'Sending…' : 'Send reset link'}
                            </button>
                        </div>

                        <p className="has-text-centered is-size-7">
                            <Link href="/login">Back to log in</Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
