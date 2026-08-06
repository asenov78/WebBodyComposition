import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import WeightChart from '../components/weightChart';

const POLL_INTERVAL_MS = 15000;

export default function Home() {
  const { data: session } = useSession();

  const [xiaomi, setXiaomi] = useState({ loading: true, connected: false });
  const [garmin, setGarmin] = useState({ loading: true, connected: false, email: '' });
  const [measurements, setMeasurements] = useState({ loading: true, items: [] });
  const [series, setSeries] = useState({ loading: true, items: [] });
  const [progress, setProgress] = useState({ loading: true, totalMeasurements: 0, synced: 0, remaining: 0 });
  const pollRef = useRef(null);

  const loadAll = () => {
    fetch('/api/xiaomi/credentials')
      .then((r) => r.json())
      .then((data) => setXiaomi({ loading: false, ...data }))
      .catch(() => setXiaomi({ loading: false, connected: false }));

    fetch('/api/sync/garmin')
      .then((r) => r.json())
      .then((data) => setGarmin({ loading: false, ...data }))
      .catch(() => setGarmin({ loading: false, connected: false }));

    fetch('/api/sync/garmin/bulk')
      .then((r) => r.json())
      .then((data) => setProgress({ loading: false, ...data }))
      .catch(() => setProgress((p) => ({ ...p, loading: false })));

    fetch('/api/measurements')
      .then((r) => r.json())
      .then((data) => setMeasurements({ loading: false, items: data.measurements ?? [] }))
      .catch(() => setMeasurements({ loading: false, items: [] }));

    fetch('/api/measurements?mode=series')
      .then((r) => r.json())
      .then((data) => setSeries({ loading: false, items: data.series ?? [] }))
      .catch(() => setSeries({ loading: false, items: [] }));
  };

  useEffect(() => {
    loadAll();
    // Background auto-sync runs server-side regardless of this page being open — this
    // polling just keeps what's on screen current instead of needing a manual refresh.
    pollRef.current = setInterval(loadAll, POLL_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  const formatDate = (value) => new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

  const lastWeight = series.items.length > 0 ? series.items[series.items.length - 1].weight : null;

  return (
    <div className='container' style={{ maxWidth: '48rem' }}>
      <div className='has-text-centered mb-5'>
        <h1 className='title is-3'>
          Hello, {session?.user?.email?.split('@')[0] ?? 'there'}! 👋
        </h1>
        <p className='subtitle is-6 has-text-grey'>Here&apos;s where your body composition tracking stands.</p>
      </div>

      {/* Stat tiles */}
      <div className='columns is-mobile is-multiline mb-2'>
        <StatTile label='Current weight' value={lastWeight ? `${lastWeight.toFixed(1)} kg` : '—'} color='link' />
        <StatTile label='Synced to Garmin' value={progress.loading ? '…' : `${progress.synced}/${progress.totalMeasurements}`} color='success' />
        <StatTile label='Still pending' value={progress.loading ? '…' : progress.remaining} color={progress.remaining > 0 ? 'warning' : 'success'} />
        <StatTile label='Xiaomi' value={xiaomi.loading ? '…' : xiaomi.connected ? 'Connected' : 'Not connected'} color={xiaomi.connected ? 'success' : 'light'} />
      </div>

      {/* Weight trend chart */}
      <div className='box mb-5'>
        <h2 className='title is-6 has-text-grey-dark mb-3'>Weight trend</h2>
        {series.loading ? (
          <p className='has-text-grey is-size-7'>Loading…</p>
        ) : (
          <WeightChart series={series.items} />
        )}
      </div>

      {/* Connection cards */}
      <div className='columns is-mobile mb-2'>
        <ConnectionCard
          title='Xiaomi Cloud (S400)'
          loading={xiaomi.loading}
          connected={xiaomi.connected}
          subtitle={xiaomi.connected ? 'Account-wide — works on any device' : undefined}
          href='/cloud/xiaomiCloud'
          cta={xiaomi.connected ? 'Manage' : 'Connect'}
        />
        <ConnectionCard
          title='Garmin Connect'
          loading={garmin.loading}
          connected={garmin.connected}
          subtitle={garmin.connected ? garmin.email : undefined}
          href='/sync/garmin-bulk'
          cta={garmin.connected ? 'Manage' : 'Connect'}
        />
      </div>

      {progress.remaining > 0 && !progress.loading && (
        <div className='notification is-info is-light is-flex is-justify-content-space-between is-align-items-center is-flex-wrap-wrap mb-5'>
          <span>⏳ Auto-syncing in the background — {progress.remaining} measurement{progress.remaining === 1 ? '' : 's'} still pending.</span>
          <Link href='/sync/garmin-bulk' className='has-text-weight-semibold'>Sync now →</Link>
        </div>
      )}

      {/* Recent syncs */}
      <div className='mb-6'>
        <h2 className='title is-6 has-text-grey-dark mb-2'>Recent syncs</h2>
        {measurements.loading && <p className='has-text-grey is-size-7'>Loading…</p>}
        {!measurements.loading && measurements.items.length === 0 && (
          <p className='has-text-grey is-size-7'>Nothing synced to Garmin yet.</p>
        )}
        {!measurements.loading && measurements.items.length > 0 && (
          <div className='box p-0' style={{ overflowX: 'auto' }}>
            <table className='table is-fullwidth is-hoverable mb-0'>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Weight (kg)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {measurements.items.map((m) => (
                  <tr key={m.id}>
                    <td className='is-vcentered'>{formatDate(m.sourceDate ?? m.createdAt)}</td>
                    <td className='is-vcentered'>{m.weight}</td>
                    <td className='is-vcentered'>
                      {m.syncedToGarmin
                        ? <span className='tag is-success is-light'>✅ Sent to Garmin</span>
                        : <span className='tag is-danger is-light' title={m.syncError}>⚠️ Failed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatTile({ label, value, color }) {
  return (
    <div className='column'>
      <div className={`box has-text-centered py-3 has-background-${color}-light`}>
        <p className='is-size-7 has-text-weight-medium has-text-grey-dark mb-1'>{label}</p>
        <p className='title is-5 mb-0'>{value}</p>
      </div>
    </div>
  );
}

function ConnectionCard({ title, loading, connected, subtitle, href, cta }) {
  return (
    <div className='column'>
      <div className='box'>
        <div className='level is-mobile mb-0'>
          <div className='level-left'>
            <div className='level-item'>
              <div>
                <p className='has-text-weight-semibold'>{title}</p>
                {loading ? (
                  <p className='is-size-7 has-text-grey mt-1'>Checking…</p>
                ) : (
                  <p className={`is-size-7 mt-1 ${connected ? 'has-text-success' : 'has-text-grey'}`}>
                    {connected ? `✅ ${subtitle || 'Connected'}` : '⚪ Not connected'}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className='level-right'>
            <div className='level-item'>
              <Link href={href} className='has-text-weight-semibold is-size-7' style={{ whiteSpace: 'nowrap' }}>
                {cta} →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
