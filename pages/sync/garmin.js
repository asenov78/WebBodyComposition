import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react';
import { useBodyCompositionContext } from '../../contexts/bodycomposition.context';

export default function Garmin() {
    const { status: authStatus } = useSession();
    const { bodyComposition } = useBodyCompositionContext();
    const [weight, setWeight] = useState(bodyComposition.weight ?? 0);
    const [bmi, setBmi] = useState(bodyComposition.bmi ?? 0);
    const [fat, setFat] = useState(bodyComposition.fat ?? 0);
    const [muscleMass, setMuscleMass] = useState(bodyComposition.muscleMass ?? 0);
    const [waterPercentage, setWaterPercentage] = useState(bodyComposition.waterPercentage ?? 0);
    const [boneMass, setBoneMass] = useState(bodyComposition.boneMass ?? 0);
    const [visceralFat, setVisceralFat] = useState(bodyComposition.visceralFat ?? 0);
    const [metabolicAge, setMetabolicAge] = useState(bodyComposition.metabolicAge ?? 0);
    const [bodyType, setBodyType] = useState(bodyComposition.bodyType ?? 0);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showMFACode, setShowMFACode] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [clientId, setClientId] = useState('');
    const [rememberCredentials, setRememberCredentials] = useState(true);

    // Whether the server already has Garmin creds on file for this account.
    const [connection, setConnection] = useState({ loading: true, connected: false, email: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (authStatus !== 'authenticated') return;
        fetch('/api/sync/garmin')
            .then((r) => r.json())
            .then((data) => setConnection({ loading: false, ...data }))
            .catch(() => setConnection({ loading: false, connected: false }));
    }, [authStatus]);

    const disconnect = async () => {
        await fetch('/api/sync/garmin', { method: 'DELETE' });
        setConnection({ loading: false, connected: false });
    };

    const submitGarminForm = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);

        const payload = {
            weight: parseFloat(weight), bmi: parseFloat(bmi), fat: parseFloat(fat ?? 0),
            muscleMass: parseFloat(muscleMass ?? 0), waterPercentage: parseFloat(waterPercentage ?? 0),
            boneMass: parseFloat(boneMass ?? 0), visceralFat: parseFloat(visceralFat ?? 0),
            metabolicAge: parseFloat(metabolicAge ?? 0), bodyType: parseFloat(bodyType ?? 0),
            email, password, mfaCode, clientId, rememberCredentials,
        };

        try {
            const res = await fetch('/api/sync/garmin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (res.status === 201) {
                alert('Success. Uploaded to Garmin Connect.');
                setShowMFACode(false);
                setPassword('');
                if (rememberCredentials) {
                    setConnection({ loading: false, connected: true, email, hasToken: true });
                }
            } else if (res.status === 200 && data.clientId) {
                setShowMFACode(true);
                setClientId(data.clientId);
                alert('MFA/2FA code required. Please provide it.');
            } else if (res.status === 401) {
                alert('Garmin login rejected. Please re-enter your credentials.');
                setConnection({ loading: false, connected: false });
            } else {
                alert(data.error || `Response Status: ${res.status}`);
            }
        } catch (err) {
            console.log(err);
            alert('Error, check console');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (authStatus === 'unauthenticated') {
        return (
            <div className='flex flex-wrap'>
                <div className='w-full max-w-sm ml-auto mr-auto text-center'>
                    <h1 className='text-2xl font-bold mb-5'>Log in required</h1>
                    <p className="mb-5">Create an account or log in to save your Garmin connection and sync automatically next time.</p>
                    <Link href="/login" className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'>Log In</Link>
                </div>
            </div>
        );
    }

    const measurementFields = [
        ['Weight (Kg)', weight, setWeight, 'weight'],
        ['BMI', bmi, setBmi, 'bmi'],
        ['Body Fat (%)', fat, setFat, 'fat'],
        ['Muscle Mass (kg)', muscleMass, setMuscleMass, 'muscleMass'],
        ['Body Water (%)', waterPercentage, setWaterPercentage, 'waterPercentage'],
        ['Bone Mass (Kg)', boneMass, setBoneMass, 'boneMass'],
        ['Visceral Fat', visceralFat, setVisceralFat, 'visceralFat'],
        ['Metabolic Age (years)', metabolicAge, setMetabolicAge, 'metabolicAge'],
    ];

    return (
        <div className='flex flex-wrap'>
            <div className='w-full max-w-sm ml-auto mr-auto'>
                <h1 className='text-2xl font-bold text-center mb-5'>Garmin Body Composition Form</h1>
                <form onSubmit={submitGarminForm}>
                    <div className='grid grid-cols-2 gap-2'>
                        {measurementFields.map(([label, value, setter, name]) => (
                            <label className="block" key={name}>
                                <span className="text-gray-700">{label}</span>
                                <input
                                    type="number" name={name} step="0.01" min={0} value={value}
                                    onChange={(e) => setter(e.target.value)}
                                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                                />
                            </label>
                        ))}
                    </div>
                    <label className="block mt-2">
                        <span className="text-gray-700">Physique Rating</span>
                        <input
                            type="number" name="bodyType" min={0} value={bodyType}
                            onChange={(e) => setBodyType(e.target.value)}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                        />
                    </label>

                    {connection.loading && <p className="text-center mt-6 text-gray-500">Checking Garmin connection…</p>}

                    {!connection.loading && connection.connected && (
                        <div className="mt-6 text-center">
                            <p>✅ Garmin connected as <strong>{connection.email}</strong></p>
                            <a href="#" className="underline text-sm" onClick={(e) => { e.preventDefault(); disconnect(); }}>
                                Disconnect / use a different account
                            </a>
                        </div>
                    )}

                    {!connection.loading && !connection.connected && (
                        <>
                            <label className="block mt-6">
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
                            <div className="mt-2">
                                <input type="checkbox" id="rememberCredentials" checked={rememberCredentials}
                                    onChange={(e) => setRememberCredentials(e.target.checked)} />
                                <label htmlFor="rememberCredentials" className="ml-2">
                                    Remember this connection (auto-sync next time, only the scale scan needed)
                                </label>
                            </div>
                        </>
                    )}

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

                    <div className='flex flex-wrap'>
                        <Link href="/" passHref>
                            <button type="button" className='bg-red-600 hover:bg-red-800 text-white font-bold py-2 px-4 rounded mt-5 mr-auto'>
                                &lt; Back
                            </button>
                        </Link>
                        <button type="submit" disabled={isSubmitting || connection.loading}
                            className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-5 ml-auto disabled:opacity-50'>
                            {isSubmitting ? 'Sending…' : 'Send to Garmin Connect'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
