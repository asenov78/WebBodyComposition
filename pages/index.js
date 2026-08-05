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
    <div className='max-w-3xl mx-auto px-4'>
      <div className='text-center mt-6 mb-8'>
        <h1 className='text-3xl font-bold'>
          Hello, {session?.user?.email?.split('@')[0] ?? 'there'}! 👋
        </h1>
        <p className='text-gray-500 mt-1'>Here&apos;s where your body composition tracking stands.</p>
      </div>

      {/* Stat tiles */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6'>
        <StatTile label='Current weight' value={lastWeight ? `${lastWeight.toFixed(1)} kg` : '—'} accent='blue' />
        <StatTile label='Synced to Garmin' value={progress.loading ? '…' : `${progress.synced}/${progress.totalMeasurements}`} accent='emerald' />
        <StatTile label='Still pending' value={progress.loading ? '…' : progress.remaining} accent={progress.remaining > 0 ? 'amber' : 'emerald'} />
        <StatTile label='Xiaomi' value={xiaomi.loading ? '…' : xiaomi.connected ? 'Connected' : 'Not connected'} accent={xiaomi.connected ? 'emerald' : 'gray'} />
      </div>

      {/* Weight trend chart */}
      <div className='rounded-2xl border border-gray-200 shadow-sm p-5 mb-6 bg-white'>
        <h2 className='font-semibold text-gray-700 mb-3'>Weight trend</h2>
        {series.loading ? (
          <p className='text-gray-500 text-sm'>Loading…</p>
        ) : (
          <WeightChart series={series.items} />
        )}
      </div>

      {/* Connection cards */}
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6'>
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
        <div className='rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 mb-6 text-sm text-blue-800 flex items-center justify-between flex-wrap gap-2'>
          <span>⏳ Auto-syncing in the background — {progress.remaining} measurement{progress.remaining === 1 ? '' : 's'} still pending.</span>
          <Link href='/sync/garmin-bulk' className='underline font-semibold whitespace-nowrap'>Sync now →</Link>
        </div>
      )}

      {/* Recent syncs */}
      <div className='mb-10'>
        <h2 className='font-semibold text-gray-700 mb-2'>Recent syncs</h2>
        {measurements.loading && <p className='text-gray-500 text-sm'>Loading…</p>}
        {!measurements.loading && measurements.items.length === 0 && (
          <p className='text-gray-500 text-sm'>Nothing synced to Garmin yet.</p>
        )}
        {!measurements.loading && measurements.items.length > 0 && (
          <div className='overflow-x-auto rounded-2xl border border-gray-200 shadow-sm bg-white'>
            <table className='min-w-full text-sm'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-4 py-2.5 text-left text-gray-500 font-medium'>When</th>
                  <th className='px-4 py-2.5 text-left text-gray-500 font-medium'>Weight (kg)</th>
                  <th className='px-4 py-2.5 text-left text-gray-500 font-medium'>Status</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {measurements.items.map((m) => (
                  <tr key={m.id} className='hover:bg-gray-50'>
                    <td className='px-4 py-2.5 whitespace-nowrap'>{formatDate(m.sourceDate ?? m.createdAt)}</td>
                    <td className='px-4 py-2.5'>{m.weight}</td>
                    <td className='px-4 py-2.5'>
                      {m.syncedToGarmin
                        ? <span className='text-emerald-600'>✅ Sent to Garmin</span>
                        : <span className='text-red-500' title={m.syncError}>⚠️ Failed</span>}
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

function StatTile({ label, value, accent }) {
  const accentClasses = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    gray: 'bg-gray-50 text-gray-600',
  };
  return (
    <div className={`rounded-2xl p-4 ${accentClasses[accent] || accentClasses.gray}`}>
      <div className='text-xs font-medium opacity-75 mb-1'>{label}</div>
      <div className='text-xl font-bold'>{value}</div>
    </div>
  );
}

function ConnectionCard({ title, loading, connected, subtitle, href, cta }) {
  return (
    <div className='rounded-2xl border border-gray-200 shadow-sm p-4 bg-white flex items-center justify-between'>
      <div>
        <h3 className='font-semibold text-gray-700'>{title}</h3>
        {loading ? (
          <p className='text-sm text-gray-400 mt-1'>Checking…</p>
        ) : (
          <p className={`text-sm mt-1 ${connected ? 'text-emerald-600' : 'text-gray-400'}`}>
            {connected ? `✅ ${subtitle || 'Connected'}` : '⚪ Not connected'}
          </p>
        )}
      </div>
      <Link href={href} className='text-sm font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap ml-3'>
        {cta} →
      </Link>
    </div>
  );
}
