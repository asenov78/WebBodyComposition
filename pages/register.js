import { useState } from 'react';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

export default function Register() {
    const router = useRouter();
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
                router.push('/login');
                return;
            }

            router.push('/');
        } catch (err) {
            console.log(err);
            setError('Something went wrong. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className='flex flex-wrap'>
            <div className='w-full max-w-sm ml-auto mr-auto'>
                <h1 className='text-2xl font-bold text-center mb-5'>Create Account</h1>
                <form onSubmit={handleSubmit}>
                    <label className="block">
                        <span className="text-gray-700">Email address</span>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            placeholder="john@example.com"
                        />
                    </label>
                    <label className="block mt-4">
                        <span className="text-gray-700">Password</span>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            placeholder="At least 8 characters"
                        />
                    </label>
                    <label className="block mt-4">
                        <span className="text-gray-700">Confirm Password</span>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            placeholder="********"
                        />
                    </label>

                    {error && <p className="text-red-600 mt-3">{error}</p>}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-5 w-full disabled:opacity-50'
                    >
                        {isSubmitting ? 'Creating account…' : 'Register'}
                    </button>

                    <p className="text-center mt-4">
                        Already have an account? <Link href="/login" className="underline">Log in</Link>
                    </p>
                </form>
            </div>
        </div>
    );
}
