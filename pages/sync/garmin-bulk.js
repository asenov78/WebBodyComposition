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
            <div className='columns is-centered'>
                <div className='column is-narrow has-text-centered' style={{ width: '24rem' }}>
                    <h1 className='title is-4'>Log in required</h1>
                    <Link href="/login" className='button is-link'>Log In</Link>
                </div>
            </div>
        );
    }

    return (
        <div className='columns is-centered'>
            <div className='column is-narrow' style={{ width: '24rem' }}>
                <h1 className='title is-4 has-text-centered'>Garmin Connect</h1>

                {progress.loading ? (
                    <p className='has-text-centered has-text-grey mb-4'>Loading progress…</p>
                ) : (
                    <div className='box has-text-centered mb-5'>
                        <p className='has-text-weight-semibold'>{progress.synced} / {progress.totalMeasurements} synced to Garmin</p>
                        <p className='is-size-7 has-text-grey'>{progress.remaining} still pending</p>
                        {progress.remaining > 0 && (
                            <p className='is-size-7 has-text-grey-light mt-1'>
                                Auto-syncing in the background every ~10 minutes — this page updates itself, no need to keep it open.
                            </p>
                        )}
                    </div>
                )}

                {!connection.loading && connection.connected && (
                    <p className='has-text-centered mb-4'>
                        ✅ Garmin connected as <strong>{connection.email}</strong>
                    </p>
                )}

                {!connection.loading && !connection.connected && (
                    <div className='box'>
                        <form onSubmit={runSync}>
                            <p className='has-text-centered has-text-grey is-size-7 mb-4'>
                                Connect once — after that, new Xiaomi measurements sync to Garmin automatically.
                            </p>
                            <div className='field'>
                                <label className='label is-small'>Garmin Email address</label>
                                <div className='control'>
                                    <input
                                        type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                        className="input"
                                        placeholder="john@example.com"
                                    />
                                </div>
                            </div>
                            <div className='field'>
                                <label className='label is-small'>Garmin Password</label>
                                <div className='control'>
                                    <input
                                        type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                                        className="input"
                                        placeholder="********"
                                    />
                                </div>
                            </div>
                            <p className="help">Garmin&apos;s API does not support 2FA — disable it on your Garmin account first.</p>

                            {showMFACode && (
                                <div className='field mt-4'>
                                    <label className='label is-small'>MFA Code</label>
                                    <div className='control'>
                                        <input
                                            type="text" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required
                                            className="input"
                                            placeholder="123456"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className='field mt-5'>
                                <button type="submit" disabled={isSyncing} className='button is-link is-fullwidth'>
                                    {isSyncing ? 'Connecting…' : 'Connect & Sync'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {!connection.loading && connection.connected && progress.remaining > 0 && (
                    <button type="button" onClick={runSync} disabled={isSyncing}
                        className='button is-link is-fullwidth mb-4'>
                        {isSyncing ? 'Syncing…' : 'Sync Now (don’t wait for the next auto-run)'}
                    </button>
                )}

                {result && (
                    <div className="has-text-centered is-size-7 mb-4">
                        {result.error && <p className="has-text-danger">{result.error}</p>}
                        {result.firstError && <p className="has-text-danger">❌ {result.firstError}</p>}
                        {result.message && !result.error && !result.firstError && <p className="has-text-grey-dark">{result.message}</p>}
                        {typeof result.synced === 'number' && (
                            <p className="mt-1">
                                ✅ {result.synced} synced just now
                                {result.failed > 0 && <span className="has-text-danger"> · ⚠️ {result.failed} failed</span>}
                            </p>
                        )}
                    </div>
                )}

                <div className='is-flex mb-4'>
                    <Link href="/cloud/xiaomiCloud" passHref>
                        <button type="button" className='button is-light mr-auto'>
                            &lt; Back
                        </button>
                    </Link>
                </div>

                <p className="has-text-centered is-size-7">
                    <Link href="/">Back to dashboard</Link>
                </p>
            </div>
        </div>
    );
}
