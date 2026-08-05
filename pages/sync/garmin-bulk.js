import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function GarminBulkSync() {
    const { status: authStatus } = useSession();

    const [connection, setConnection] = useState({ loading: true, connected: false, email: '' });
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [clientId, setClientId] = useState('');
    const [showMFACode, setShowMFACode] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [result, setResult] = useState(null);
    const [totals, setTotals] = useState({ synced: 0, failed: 0 });
    // Small on purpose: sync a couple, confirm they land on Garmin with the right
    // dates, then bump this up and keep going — instead of firing hundreds of
    // requests in one go (which used to time out with no useful error).
    const [batchSize, setBatchSize] = useState(2);

    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        fetch('/api/sync/garmin')
            .then((r) => r.json())
            .then((data) => setConnection({ loading: false, ...data }))
            .catch(() => setConnection({ loading: false, connected: false }));
    }, [authStatus]);

    const runSync = async (event) => {
        event.preventDefault();
        setIsSyncing(true);

        try {
            const res = await fetch('/api/sync/garmin/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, mfaCode, clientId, limit: batchSize }),
            });

            if (!res.ok) {
                setResult({ error: `Server error (HTTP ${res.status}). Try a smaller batch size.` });
                return;
            }

            const data = await res.json();

            if (data.mfaRequired) {
                setShowMFACode(true);
                setClientId(data.clientId);
                setResult({ ...data, message: 'MFA/2FA code required — enter it below and continue.' });
                return;
            }

            setShowMFACode(false);
            setPassword('');
            setResult(data);
            setTotals((t) => ({ synced: t.synced + (data.synced || 0), failed: t.failed + (data.failed || 0) }));
            if (data.synced > 0) {
                setConnection((c) => ({ ...c, connected: true, email: email || c.email }));
            }
        } catch (err) {
            console.log(err);
            setResult({ error: `Network/client error: ${err?.message || err}` });
        } finally {
            setIsSyncing(false);
        }
    };

    if (authStatus === 'unauthenticated') {
        return (
            <div className='flex flex-wrap'>
                <div className='w-full max-w-sm ml-auto mr-auto text-center'>
                    <h1 className='text-2xl font-bold mb-5'>Log in required</h1>
                    <Link href="/login" className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'>Log In</Link>
                </div>
            </div>
        );
    }

    const remaining = result?.remaining ?? result?.totalPending ?? null;

    return (
        <div className='flex flex-wrap'>
            <div className='w-full max-w-sm ml-auto mr-auto'>
                <h1 className='text-2xl font-bold text-center mb-5'>Connect to Garmin Connect</h1>
                <p className='text-center text-gray-600 mb-6'>
                    Pushes measurements imported from Xiaomi Cloud, a small batch at a time, using each one&apos;s real weigh-in date.
                </p>

                <form onSubmit={runSync}>
                    {connection.loading && <p className='text-center text-gray-500'>Checking Garmin connection…</p>}

                    {!connection.loading && connection.connected && (
                        <div className='text-center mb-4'>
                            <p>✅ Garmin connected as <strong>{connection.email}</strong></p>
                        </div>
                    )}

                    {!connection.loading && !connection.connected && (
                        <>
                            <label className="block">
                                <span className="text-gray-700">Garmin Email address</span>
                                <input
                                    type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                    placeholder="john@example.com"
                                />
                            </label>
                            <label className="block mt-2">
                                <span className="text-gray-700">Garmin Password</span>
                                <input
                                    type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                    placeholder="********"
                                />
                            </label>
                            <p className="text-xs text-gray-500 mt-1">Garmin&apos;s API does not support 2FA — disable it on your Garmin account first.</p>
                        </>
                    )}

                    <label className="block mt-4">
                        <span className="text-gray-700">Batch size (how many to sync this click)</span>
                        <input
                            type="number" min={1} max={50} value={batchSize}
                            onChange={(e) => setBatchSize(Math.max(1, parseInt(e.target.value, 10) || 1))}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        />
                        <span className="text-xs text-gray-500">Start small (2), check Garmin Connect, then raise it once you trust the dates are right.</span>
                    </label>

                    {showMFACode && (
                        <label className="block mt-4">
                            <span className="text-gray-700">MFA Code</span>
                            <input
                                type="text" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required
                                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                placeholder="123456"
                            />
                        </label>
                    )}

                    {result && (
                        <div className="mt-4 text-center text-sm">
                            {result.error && <p className="text-red-600">{result.error}</p>}
                            {result.firstError && <p className="text-red-600">❌ {result.firstError}</p>}
                            {result.message && !result.error && !result.firstError && <p className="text-gray-700">{result.message}</p>}
                            {typeof result.synced === 'number' && (
                                <p className="mt-1">
                                    ✅ {result.synced} synced this batch
                                    {result.failed > 0 && <span className="text-red-600"> · ⚠️ {result.failed} failed</span>}
                                </p>
                            )}
                            {(totals.synced > 0 || totals.failed > 0) && (
                                <p className="text-xs text-gray-500 mt-1">Session total: {totals.synced} synced, {totals.failed} failed</p>
                            )}
                            {remaining !== null && (
                                <p className="mt-1 font-semibold">{remaining} still pending</p>
                            )}
                        </div>
                    )}

                    <div className='flex flex-wrap'>
                        <Link href="/cloud/xiaomiCloud" passHref>
                            <button type="button" className='bg-red-600 hover:bg-red-800 text-white font-bold py-2 px-4 rounded mt-5 mr-auto'>
                                &lt; Back
                            </button>
                        </Link>
                        <button type="submit" disabled={isSyncing || connection.loading}
                            className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-5 ml-auto disabled:opacity-50'>
                            {isSyncing ? 'Syncing…' : remaining === 0 ? 'All synced' : 'Sync Next Batch'}
                        </button>
                    </div>
                </form>

                <div className="text-center mt-6">
                    <Link href="/" className="underline text-sm">Back to dashboard</Link>
                </div>
            </div>
        </div>
    );
}
