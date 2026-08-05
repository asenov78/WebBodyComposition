import { useState } from 'react';
import { useRouter } from 'next/router';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

export default function LoginPage() {
    const router = useRouter();
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

        router.push('/');
    };

    return (
        <div className='flex flex-wrap'>
            <div className='w-full max-w-sm ml-auto mr-auto'>
                <h1 className='text-2xl font-bold text-center mb-5'>Log In</h1>
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
                        {isSubmitting ? 'Logging in…' : 'Log In'}
                    </button>

                    <p className="text-center mt-4">
                        No account yet? <Link href="/register" className="underline">Register</Link>
                    </p>
                </form>
            </div>
        </div>
    );
}
