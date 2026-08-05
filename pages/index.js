import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function Home() {
  const { data: session } = useSession();

  const [xiaomi, setXiaomi] = useState({ loading: true, connected: false, xiaomiUserId: '' });
  const [garmin, setGarmin] = useState({ loading: true, connected: false, email: '' });
  const [measurements, setMeasurements] = useState({ loading: true, items: [] });

  useEffect(() => {
    // Server-side now (see pages/api/xiaomi/credentials.js) — tied to the account,
    // not this one browser's localStorage, so it shows correctly regardless of
    // which device/browser you're looking at the dashboard from.
    fetch('/api/xiaomi/credentials')
      .then((r) => r.json())
      .then((data) => setXiaomi({ loading: false, ...data }))
      .catch(() => setXiaomi({ loading: false, connected: false }));

    fetch('/api/sync/garmin')
      .then((r) => r.json())
      .then((data) => setGarmin({ loading: false, ...data }))
      .catch(() => setGarmin({ loading: false, connected: false }));

    fetch('/api/measurements')
      .then((r) => r.json())
      .then((data) => setMeasurements({ loading: false, items: data.measurements ?? [] }))
      .catch(() => setMeasurements({ loading: false, items: [] }));
  }, []);

  const formatDate = (value) => new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

  return (
    <div className='max-w-xl mx-auto'>
      <h1 className='text-3xl font-bold text-center mt-4'>
        Hello, {session?.user?.email ?? 'there'}! 👋
      </h1>

      <div className='mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4'>
        <div className='rounded-xl border border-gray-200 p-4'>
          <h2 className='font-semibold text-gray-700'>Xiaomi Cloud (S400)</h2>
          {xiaomi.loading ? (
            <p className='mt-2 text-gray-500'>Checking…</p>
          ) : xiaomi.connected ? (
            <p className='mt-2'>✅ Connected (account-wide, any device)</p>
          ) : (
            <p className='mt-2'>⚪ Not connected yet</p>
          )}
        </div>

        <div className='rounded-xl border border-gray-200 p-4'>
          <h2 className='font-semibold text-gray-700'>Garmin Connect</h2>
          {garmin.loading ? (
            <p className='mt-2 text-gray-500'>Checking…</p>
          ) : garmin.connected ? (
            <p className='mt-2'>✅ Connected as <strong>{garmin.email}</strong></p>
          ) : (
            <p className='mt-2'>⚪ Not connected yet</p>
          )}
        </div>
      </div>

      <div className='mt-6'>
        <Link href="/cloud/xiaomiCloud" passHref className='block w-full'>
          <button
            type="button"
            className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full'
          >  Mi Cloud Connector (S400)
          </button>
        </Link>
      </div>

      <div className='mt-8'>
        <h2 className='font-semibold text-gray-700 mb-2'>Recent syncs</h2>
        {measurements.loading && <p className='text-gray-500'>Loading…</p>}
        {!measurements.loading && measurements.items.length === 0 && (
          <p className='text-gray-500 text-sm'>Nothing synced to Garmin yet.</p>
        )}
        {!measurements.loading && measurements.items.length > 0 && (
          <div className='overflow-x-auto rounded-xl border border-gray-200'>
            <table className='min-w-full text-sm'>
              <thead className='bg-gray-50'>
                <tr>
                  <th className='px-3 py-2 text-left'>When</th>
                  <th className='px-3 py-2 text-left'>Weight (kg)</th>
                  <th className='px-3 py-2 text-left'>Status</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {measurements.items.map((m) => (
                  <tr key={m.id}>
                    <td className='px-3 py-2 whitespace-nowrap'>{formatDate(m.sourceDate ?? m.createdAt)}</td>
                    <td className='px-3 py-2'>{m.weight}</td>
                    <td className='px-3 py-2'>{m.syncedToGarmin ? '✅ Sent to Garmin' : '—'}</td>
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
