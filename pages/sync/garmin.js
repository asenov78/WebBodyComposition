import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react';

// Used to read initial values from BodyCompositionContext, populated by the
// (since-removed) Bluetooth scanner flow — nothing ever wrote to that context
// in this fork, so every field always defaulted to 0 anyway. Plain useState(0)
// is the same behavior with one less dependency.
export default function Garmin() {
    const { status: authStatus } = useSession();
    const [weight, setWeight] = useState(0);
    const [bmi, setBmi] = useState(0);
    const [fat, setFat] = useState(0);
    const [muscleMass, setMuscleMass] = useState(0);
    const [waterPercentage, setWaterPercentage] = useState(0);
    const [boneMass, setBoneMass] = useState(0);
    const [visceralFat, setVisceralFat] = useState(0);
    const [metabolicAge, setMetabolicAge] = useState(0);
    const [bodyType, setBodyType] = useState(0);

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
            <div className='columns is-centered'>
                <div className='column is-narrow has-text-centered' style={{ width: '24rem' }}>
                    <h1 className='title is-4'>Log in required</h1>
                    <p className='mb-4'>Create an account or log in to save your Garmin connection and sync automatically next time.</p>
                    <Link href="/login" className='button is-link'>Log In</Link>
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
        <div className='columns is-centered'>
            <div className='column is-narrow' style={{ width: '28rem' }}>
                <h1 className='title is-4 has-text-centered'>Garmin Body Composition Form</h1>
                <div className='box'>
                    <form onSubmit={submitGarminForm}>
                        <div className='columns is-multiline is-mobile'>
                            {measurementFields.map(([label, value, setter, name]) => (
                                <div className='column is-half' key={name}>
                                    <div className='field'>
                                        <label className='label is-small'>{label}</label>
                                        <div className='control'>
                                            <input
                                                type="number" name={name} step="0.01" min={0} value={value}
                                                onChange={(e) => setter(e.target.value)}
                                                className="input"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className='field'>
                            <label className='label is-small'>Physique Rating</label>
                            <div className='control'>
                                <input
                                    type="number" name="bodyType" min={0} value={bodyType}
                                    onChange={(e) => setBodyType(e.target.value)}
                                    className="input"
                                />
                            </div>
                        </div>

                        {connection.loading && <p className="has-text-centered has-text-grey mt-4">Checking Garmin connection…</p>}

                        {!connection.loading && connection.connected && (
                            <div className="level is-mobile mt-4">
                                <div className="level-left">
                                    <div className="level-item">
                                        {/* Bulma's Delete element instead of a plain text link. */}
                                        <button
                                            type="button"
                                            className="delete mr-2"
                                            aria-label="Disconnect Garmin"
                                            title="Disconnect / use a different account"
                                            onClick={(e) => { e.preventDefault(); disconnect(); }}
                                        />
                                        <p>✅ Garmin connected as <strong>{connection.email}</strong></p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!connection.loading && !connection.connected && (
                            <>
                                <div className='field mt-4'>
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
                                <div className='field mt-2'>
                                    <div className='control'>
                                        <label className='checkbox is-size-7'>
                                            <input type="checkbox" checked={rememberCredentials}
                                                onChange={(e) => setRememberCredentials(e.target.checked)} />
                                            {' '}Remember this connection (auto-sync next time, only the scale scan needed)
                                        </label>
                                    </div>
                                </div>
                            </>
                        )}

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

                        <div className='level is-mobile mt-5'>
                            <div className='level-left'>
                                <div className='level-item'>
                                    <Link href="/" passHref>
                                        <button type="button" className='button is-light'>
                                            &lt; Back
                                        </button>
                                    </Link>
                                </div>
                            </div>
                            <div className='level-right'>
                                <div className='level-item'>
                                    <button type="submit" disabled={isSubmitting || connection.loading}
                                        className='button is-link'>
                                        {isSubmitting ? 'Sending…' : 'Send to Garmin Connect'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
