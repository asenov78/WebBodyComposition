import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

// Auto-poll interval — background sync (GitHub Actions -> /api/cron/sync) runs every
// ~10 minutes independently of this page being open, so we just need to periodically
// check in and refresh the numbers, not drive the syncing ourselves.
const POLL_INTERVAL_MS = 15000;

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
    const [progress, setProgress] = useState({ loading: true, totalMeasurements: 0, synced: 0, remaining: 0 });
    const pollRef = useRef(null);

    const loadProgress = () => fetch('/api/sync/garmin/bulk')
        .then((r) => r.json())
        .then((data) => setProgress({ loading: false, ...data }))
        .catch(() => setProgress((p) => ({ ...p, loading: false })));

    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        fetch('/api/sync/garmin')
            .then((r) => r.json())
            .then((data) => setConnection({ loading: false, ...data }))
            .catch(() => setConnection({ loading: false, connected: false }));
        loadProgress();

        // Background sync keeps running server-side even if this tab closes — this
        // polling is only so the page reflects that progress while it's open.
        pollRef.current = setInterval(loadProgress, POLL_INTERVAL_MS);
        return () => clearInterval(pollRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authStatus]);

    const runSync = async (event) => {
        event.preventDefault();
        setIsSyncing(true);

        try {
            const res = await fetch('/api/sync/garmin/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, mfaCode, clientId, limit: 10 }),
            });

            if (!res.ok) {
                setResult({ error: `Server error (HTTP ${res.status}).` });
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
            if (data.synced > 0) {
                setConnection((c) => ({ ...c, connected: true, email: email || c.email }));
            }
            loadProgress();
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

    return (
        <div className='flex flex-wrap'>
            <div className='w-full max-w-sm ml-auto mr-auto'>
                <h1 className='text-2xl font-bold text-center mb-5'>Garmin Connect</h1>

                {progress.loading ? (
                    <p className='text-center text-gray-500 mb-4'>Loading progress…</p>
                ) : (
                    <div className='text-center mb-6 rounded-xl border border-gray-200 bg-gray-50 p-3'>
                        <p className='font-semibold'>{progress.synced} / {progress.totalMeasurements} synced to Garmin</p>
                        <p className='text-sm text-gray-600'>{progress.remaining} still pending</p>
                        {progress.remaining > 0 && (
                            <p className='text-xs text-gray-500 mt-1'>
                                Auto-syncing in the background every ~10 minutes — this page updates itself, no need to keep it open.
                            </p>
                        )}
                    </div>
                )}

                {!connection.loading && connection.connected && (
                    <div className='text-center mb-4'>
                        <p>✅ Garmin connected as <strong>{connection.email}</strong></p>
                    </div>
                )}

                {!connection.loading && !connection.connected && (
                    <form onSubmit={runSync}>
                        <p className='text-center text-gray-600 mb-4 text-sm'>
                            Connect once — after that, new Xiaomi measurements sync to Garmin automatically.
                        </p>
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

                        <button type="submit" disabled={isSyncing}
                            className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-5 w-full disabled:opacity-50'>
                            {isSyncing ? 'Connecting…' : 'Connect & Sync'}
                        </button>
                    </form>
                )}

                {!connection.loading && connection.connected && progress.remaining > 0 && (
                    <button type="button" onClick={runSync} disabled={isSyncing}
                        className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full disabled:opacity-50'>
                        {isSyncing ? 'Syncing…' : 'Sync Now (don’t wait for the next auto-run)'}
                    </button>
                )}

                {result && (
                    <div className="mt-4 text-center text-sm">
                        {result.error && <p className="text-red-600">{result.error}</p>}
                        {result.firstError && <p className="text-red-600">❌ {result.firstError}</p>}
                        {result.message && !result.error && !result.firstError && <p className="text-gray-700">{result.message}</p>}
                        {typeof result.synced === 'number' && (
                            <p className="mt-1">
                                ✅ {result.synced} synced just now
                                {result.failed > 0 && <span className="text-red-600"> · ⚠️ {result.failed} failed</span>}
                            </p>
                        )}
                    </div>
                )}

                <div className='flex flex-wrap mt-6'>
                    <Link href="/cloud/xiaomiCloud" passHref>
                        <button type="button" className='bg-red-600 hover:bg-red-800 text-white font-bold py-2 px-4 rounded mr-auto'>
                            &lt; Back
                        </button>
                    </Link>
                </div>

                <div className="text-center mt-6">
                    <Link href="/" className="underline text-sm">Back to dashboard</Link>
                </div>
            </div>
        </div>
    );
}
