import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useLocalStorageState from 'use-local-storage-state';

const regionOptions = [
    { value: 'cn', label: 'China' },
    { value: 'de', label: 'Europe' },
    { value: 'ru', label: 'Russia' },
    { value: 'sg', label: 'Singapur' },
    { value: 'us', label: 'USA' },
    { value: 'i2', label: 'India' },
];

const modelOptions = [
    { value: 'yunmai.scales.ms104', label: 'S400 - yunmai.scales.ms104' },
    { value: 'yunmai.scales.ms103', label: 'S400 - yunmai.scales.ms103' },
    { value: 'yunmai.scales.ms107', label: 'S400 - yunmai.scales.ms107' },
    { value: 'yunmai.scales.ms106', label: 'S200 - yunmai.scales.ms106' },
    { value: 'xiaomi.scales.ms116', label: 'S800 - xiaomi.scales.ms116' },


];

const defaultModel = modelOptions[0].value;

//const serverUrl = 'https://localhost:7046';
const serverUrl = 'https://grzegorz366-20366.wykr.es';
const weightEndpoint = `${serverUrl}/weights`;
const loginEndpoint = `${serverUrl}/login`;

export default function XiaomiCloud() {
    const [userId, setUserId] = useLocalStorageState('xiaomiCloud.userId', {
        defaultValue: '',
    });
    const [passToken, setPassToken] = useLocalStorageState('xiaomiCloud.passToken', {
        defaultValue: '',
    });
    const [region, setRegion] = useLocalStorageState('xiaomiCloud.region', {
        defaultValue: 'de',
    });
    const [model, setModel] = useLocalStorageState('xiaomiCloud.model', {
        defaultValue: defaultModel,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isGettingPassToken, setIsGettingPassToken] = useState(false);
    const [isPollingPassToken, setIsPollingPassToken] = useState(false);
    const [message, setMessage] = useState('');
    const [loginSessionId, setLoginSessionId] = useState('');
    const [loginUrl, setLoginUrl] = useState('');
    const [qrCodeBase64, setQrCodeBase64] = useState('');
    const [pollingEndpoint, setPollingEndpoint] = useState('');
    const [weightRecords, setWeightRecords] = useState([]);
    const [fetchSummary, setFetchSummary] = useState(null);
    const [isLoadingConnection, setIsLoadingConnection] = useState(true);
    const [isSavedServerSide, setIsSavedServerSide] = useState(false);
    // Once connected, the userId/passToken/region/model fields are irrelevant day-to-day
    // (they're saved server-side already) — tucked behind this toggle instead of always
    // taking up the top of the page.
    const [showConnectionDetails, setShowConnectionDetails] = useState(false);
    const loginPollingControllerRef = useRef(null);

    const isGetMeasurementsEnabled = userId.trim() !== '' && passToken.trim() !== '';

    // Load the server-saved connection once on mount so logging in from a different
    // browser/device (or after clearing localStorage) doesn't lose it — previously this
    // only ever lived in this one browser's localStorage.
    useEffect(() => {
        fetch('/api/xiaomi/credentials')
            .then((r) => r.json())
            .then((data) => {
                if (data.connected) {
                    setUserId(String(data.xiaomiUserId));
                    setPassToken(data.passToken);
                    if (data.region) setRegion(data.region);
                    if (data.model) setModel(data.model);
                    setIsSavedServerSide(true);
                }
            })
            .catch(() => { })
            .finally(() => setIsLoadingConnection(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const saveCredentialsToServer = async (xiaomiUserId, token, currentRegion, currentModel) => {
        try {
            const res = await fetch('/api/xiaomi/credentials', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ xiaomiUserId, passToken: token, region: currentRegion, model: currentModel }),
            });
            setIsSavedServerSide(res.ok);
        } catch {
            setIsSavedServerSide(false);
        }
    };

    const disconnectXiaomi = async () => {
        await fetch('/api/xiaomi/credentials', { method: 'DELETE' });
        setUserId('');
        setPassToken('');
        setIsSavedServerSide(false);
        setShowConnectionDetails(false);
    };

    const sleep = (delayMs, signal) => new Promise((resolve, reject) => {
        if (signal?.aborted) {
            const abortError = new Error('Login polling cancelled.');
            abortError.name = 'AbortError';
            reject(abortError);
            return;
        }

        const timeoutId = setTimeout(() => {
            signal?.removeEventListener('abort', handleAbort);
            resolve();
        }, delayMs);

        const handleAbort = () => {
            clearTimeout(timeoutId);
            const abortError = new Error('Login polling cancelled.');
            abortError.name = 'AbortError';
            reject(abortError);
        };

        signal?.addEventListener('abort', handleAbort, { once: true });
    });

    const clearLoginChallenge = () => {
        setLoginSessionId('');
        setLoginUrl('');
        setQrCodeBase64('');
        setPollingEndpoint('');
    };

    const cancelPassTokenPolling = () => {
        loginPollingControllerRef.current?.abort();
    };

    const readJsonResponse = async (response) => {
        const responseText = await response.text();

        if (!responseText) {
            return {};
        }

        try {
            return JSON.parse(responseText);
        } catch {
            return responseText;
        }
    };

    const parseWeightRecords = (responseValue) => {
        if (typeof responseValue !== 'string') {
            return Array.isArray(responseValue) ? responseValue : [];
        }

        const trimmedValue = responseValue.trim();

        if (!trimmedValue) {
            return [];
        }

        const normalizedValue = trimmedValue.startsWith("'") && trimmedValue.endsWith("'")
            ? trimmedValue.slice(1, -1)
            : trimmedValue;

        try {
            const parsedValue = JSON.parse(normalizedValue);
            return Array.isArray(parsedValue) ? parsedValue : [];
        } catch {
            return [];
        }
    };

    const submitMeasurements = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setMessage('');
        setWeightRecords([]);
        setFetchSummary(null);

        try {
            const response = await fetch(weightEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    UserId: Number(userId),
                    PassToken: passToken,
                    Region: region,
                    Model: model,
                }),
            });
            const responseText = await response.text();
            if (!response.ok) {
                throw new Error(responseText || `Request failed with status ${response.status}`);
            }

            const parsedRecords = parseWeightRecords(responseText);
            const allRecords = parsedRecords
                .slice()
                .sort((left, right) => new Date(right.date) - new Date(left.date));

            if (allRecords.length > 0) {
                const importRes = await fetch('/api/measurements/import', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ records: allRecords }),
                });
                const importData = await importRes.json();

                if (importRes.ok) {
                    // Show only what's actually new — Xiaomi Cloud always returns the
                    // full history, and re-listing rows already saved from a previous
                    // fetch was just noise.
                    const newRecords = (importData.newRecords || [])
                        .slice()
                        .sort((left, right) => new Date(right.date) - new Date(left.date));
                    setWeightRecords(newRecords);
                    setFetchSummary({ total: allRecords.length, imported: importData.imported, duplicates: importData.duplicates });
                    setMessage('');
                } else {
                    setMessage(`Fetched ${allRecords.length} record${allRecords.length === 1 ? '' : 's'} from Xiaomi Cloud, but saving them failed.`);
                }
            } else {
                setMessage(responseText || 'Measurements request sent successfully.');
            }
        } catch (error) {
            setMessage(error.message || 'Unable to get measurements.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const normalizeLoginChallenge = (loginResponse) => ({
        sessionId: loginResponse?.sessionid ?? loginResponse?.sessionId ?? '',
        loginUrl: loginResponse?.loginUrl ?? '',
        qrCodeBase64: loginResponse?.qrCodeBase64 ?? loginResponse?.qrCode ?? '',
        pollingEndpoint: loginResponse?.pollingEndpoint ?? '',
    });

    const pollForPassToken = async (endpoint, signal) => {
        for (let attempt = 1; attempt <= 10; attempt += 1) {
            if (signal?.aborted) {
                const abortError = new Error('Login polling cancelled.');
                abortError.name = 'AbortError';
                throw abortError;
            }

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    Accept: 'application/json',
                },
                signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Polling failed with status ${response.status}`);
            }

            const pollResponse = await readJsonResponse(response);
            const pollStatus = pollResponse?.status ?? '';

            if (pollStatus && pollStatus !== 'pending') {
                return pollResponse;
            }

            if (attempt < 10) {
                await sleep(2000, signal);
            }
        }

        throw new Error('Timed out waiting for Xiaomi login to complete.');
    };

    const getPassToken = async () => {
        const controller = new AbortController();

        loginPollingControllerRef.current?.abort();
        loginPollingControllerRef.current = controller;

        setIsGettingPassToken(true);
        setIsPollingPassToken(true);
        setMessage('');
        clearLoginChallenge();

        try {
            const response = await fetch(loginEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    UserId: Number(userId),
                    Region: region,
                    Model: model,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Request failed with status ${response.status}`);
            }

            const loginResponse = normalizeLoginChallenge(await readJsonResponse(response));
            setLoginSessionId(loginResponse.sessionId);
            setLoginUrl(loginResponse.loginUrl);
            setQrCodeBase64(loginResponse.qrCodeBase64);
            setPollingEndpoint(loginResponse.pollingEndpoint);

            const pollResponse = await pollForPassToken(`${serverUrl}${loginResponse.pollingEndpoint}`, controller.signal);

            if (pollResponse?.status === 'completed') {
                // pollResponse.userId is the numeric Xiaomi account id the weights
                // endpoint expects (confirmed live: {"userId":238807326,...}).
                // pollResponse.cUserId is a *different* string identifier the proxy
                // also returns — it is NOT a substitute, so it's intentionally not
                // used here (an earlier version of this fix wrongly preferred it).
                const resolvedUserId = pollResponse.userId ?? pollResponse.UserId
                    ?? pollResponse.userID ?? pollResponse.uid ?? pollResponse.miAccountId
                    ?? pollResponse.accountId;
                const resolvedPassToken = pollResponse.passToken ?? pollResponse.PassToken;

                if (resolvedUserId !== undefined && resolvedUserId !== null && resolvedUserId !== '') {
                    setUserId(String(resolvedUserId));
                }

                if (resolvedPassToken !== undefined && resolvedPassToken !== null) {
                    setPassToken(String(resolvedPassToken));
                }

                if (resolvedUserId && resolvedPassToken) {
                    // Persist to the account, not just this browser, so it's there
                    // next time regardless of device/incognito/logout.
                    await saveCredentialsToServer(String(resolvedUserId), String(resolvedPassToken), region, model);
                }

                if (resolvedUserId === undefined || resolvedUserId === null || resolvedUserId === '') {
                    setMessage(`Pass token retrieved, but no User ID field was found in the response. Raw keys: ${Object.keys(pollResponse).join(', ')}`);
                } else {
                    setMessage('Pass token retrieved successfully.');
                }
            } else {
                setMessage(`Login finished with status: ${pollResponse?.status ?? 'unknown'}`);
            }
        } catch (error) {
            setMessage(error?.name === 'AbortError'
                ? 'Login polling cancelled.'
                : error.message || 'Unable to get pass token.');
        } finally {
            clearLoginChallenge();
            setIsGettingPassToken(false);
            setIsPollingPassToken(false);
            if (loginPollingControllerRef.current === controller) {
                loginPollingControllerRef.current = null;
            }
        }
    };

    const formatDate = (value) => {
        if (!value) {
            return '-';
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat('en-GB', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(date);
    };

    const formatValue = (value) => {
        if (value === null || value === undefined || value === '') {
            return '-';
        }

        return typeof value === 'number' ? value.toLocaleString('en-US') : value;
    };

    const metricFields = [
        { key: 'weightKg', label: 'Weight (kg)' },

        { key: 'bmi', label: 'BMI' },
        { key: 'bodyFat', label: 'Body Fat %' },
        { key: 'bodyWater', label: 'Body Water %' },
        { key: 'boneMass', label: 'Bone Mass' },
        { key: 'metabolicAge', label: 'Metabolic Age' },
        { key: 'muscleMass', label: 'Muscle Mass' },
        { key: 'proteinMass', label: 'Protein Mass' },
        { key: 'visceralFat', label: 'Visceral Fat' },
        { key: 'basalMetabolism', label: 'Basal Metabolism' },
        { key: 'bodyScore', label: 'Body Score' },
        { key: 'heartRate', label: 'Heart Rate' },
        { key: 'skeletalMuscleMass', label: 'Skeletal Muscle Mass' },
        { key: 'source', label: 'Source' },
        { key: 'user', label: 'User' },
        { key: 'height', label: 'Height (cm)' },
    ];

    const showDetailFields = !isSavedServerSide || showConnectionDetails;

    return (
        <div className='container' style={{ maxWidth: '48rem' }}>
            <div className='has-text-centered mb-5'>
                <h1 className='title is-3'>Mi Cloud Connector</h1>
                <p className='subtitle is-6 has-text-grey'>S400 scale → Xiaomi Cloud → this app.</p>
            </div>

            {isLoadingConnection && (
                <p className='has-text-centered has-text-grey'>Checking saved connection…</p>
            )}

            {/* One form for the whole connect/fetch flow — the "Get Measurements" button
                stays inside it (not a detached form= reference) so it keeps working
                whether or not the detail fields below are expanded. */}
            {!isLoadingConnection && !isPollingPassToken && (
                <form onSubmit={submitMeasurements} className='box mb-5'>
                    {isSavedServerSide && (
                        <div className='is-flex is-justify-content-space-between is-align-items-center is-flex-wrap-wrap mb-3'>
                            <div>
                                <p className='has-text-weight-semibold'>✅ Connected to Xiaomi Cloud</p>
                                <p className='is-size-7 has-text-grey mt-1'>Account-wide — works from any device, no need to reconnect.</p>
                            </div>
                            <button
                                type='submit'
                                disabled={!isGetMeasurementsEnabled || isSubmitting}
                                className='button is-link'
                            >
                                {isSubmitting ? 'Checking…' : 'Get Measurements'}
                            </button>
                        </div>
                    )}

                    {isSavedServerSide && (
                        <div className='is-flex is-align-items-center mb-3' style={{ gap: '1rem' }}>
                            <button
                                type='button'
                                onClick={() => setShowConnectionDetails((v) => !v)}
                                className='button is-text is-small p-0'
                            >
                                {showConnectionDetails ? 'Hide' : 'Show'} connection details
                            </button>
                            {!showConnectionDetails && (
                                <a href='#' className='is-size-7 has-text-danger' onClick={(e) => { e.preventDefault(); disconnectXiaomi(); }}>
                                    Disconnect
                                </a>
                            )}
                        </div>
                    )}

                    {showDetailFields && (
                    <div className={isSavedServerSide ? 'pt-4' : ''} style={isSavedServerSide ? { borderTop: '1px solid #f0f0f0' } : undefined}>
                    {!isSavedServerSide && (
                        <p className='is-size-7 has-text-grey mb-4'>Connect once — scan the QR code below, and it&apos;s remembered on your account from then on.</p>
                    )}

                    <div className='field'>
                        <label className='label is-small'>User ID</label>
                        <div className='control'>
                            <input
                                type='number'
                                name='userId'
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                className='input'
                                placeholder='123456789'
                            />
                        </div>
                    </div>

                    <div className='field'>
                        <label className='label is-small'>Pass Token</label>
                        <div className='control'>
                            <textarea
                                name='passToken'
                                rows={3}
                                value={passToken}
                                onChange={(e) => setPassToken(e.target.value)}
                                className='textarea'
                                placeholder='Paste pass token here'
                            />
                        </div>
                    </div>

                    <div className='field is-grouped is-align-items-center mb-4'>
                        <div className='control'>
                            <button
                                type='button'
                                onClick={getPassToken}
                                disabled={isGettingPassToken || isSubmitting}
                                className='button is-success'
                            >
                                {isGettingPassToken ? 'Getting pass token...' : 'Get Pass Token (QR login)'}
                            </button>
                        </div>
                        {isSavedServerSide && (
                            <div className='control'>
                                <a href='#' className='is-size-7 has-text-danger' onClick={(e) => { e.preventDefault(); disconnectXiaomi(); }}>
                                    Disconnect / use a different account
                                </a>
                            </div>
                        )}
                    </div>

                    <div className='columns'>
                        <div className='column'>
                            <div className='field'>
                                <label className='label is-small'>Account region</label>
                                <div className='control'>
                                    <div className='select is-fullwidth'>
                                        <select
                                            name='region'
                                            value={region}
                                            onChange={(e) => setRegion(e.target.value)}
                                        >
                                            {regionOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.value} - {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className='column'>
                            <div className='field'>
                                <label className='label is-small'>Scale model</label>
                                <div className='control'>
                                    <div className='select is-fullwidth'>
                                        <select
                                            name='model'
                                            value={model}
                                            onChange={(e) => setModel(e.target.value)}
                                        >
                                            {!modelOptions.some((option) => option.value === model) && model && (
                                                <option value={model}>
                                                    {model} (saved)
                                                </option>
                                            )}
                                            {modelOptions.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {!isSavedServerSide && (
                        <div className='field'>
                            <button
                                type='submit'
                                disabled={!isGetMeasurementsEnabled || isSubmitting || isGettingPassToken}
                                className='button is-link'
                            >
                                {isSubmitting ? 'Getting measurements...' : 'Get Measurements'}
                            </button>
                        </div>
                    )}
                    </div>
                    )}

                    {message && (
                        <p className='is-size-7 has-text-grey-dark mt-3' style={{ whiteSpace: 'pre-wrap' }}>
                            {message}
                        </p>
                    )}
                </form>
            )}

            {isPollingPassToken && (
                <div className='box mb-5 has-text-centered'>
                    <div className='has-text-left mb-3'>
                        <p className='has-text-weight-semibold'>Waiting for Xiaomi login</p>
                        <p className='is-size-7 has-text-grey mt-1'>Scan the QR code or open the login link, then wait for polling to finish.</p>
                    </div>

                    {loginSessionId && (
                        <p className='is-size-7 has-text-grey mb-3'>Session ID: {loginSessionId}</p>
                    )}
                    {qrCodeBase64 && (
                        <figure className='image is-inline-block mb-3'>
                            <img
                                src={`data:image/png;base64,${qrCodeBase64}`}
                                alt='Xiaomi login QR code'
                                style={{ maxWidth: '220px', border: '1px solid #f0f0f0', borderRadius: '6px', padding: '0.5rem' }}
                            />
                        </figure>
                    )}
                    {loginUrl && (
                        <p className='is-size-7 mb-3' style={{ wordBreak: 'break-all' }}>
                            <a href={loginUrl} target='_blank' rel='noreferrer' className='has-text-weight-semibold'>
                                {loginUrl}
                            </a>
                        </p>
                    )}
                    {pollingEndpoint && (
                        <p className='is-size-7 has-text-grey mb-3'>Polling endpoint: {pollingEndpoint}</p>
                    )}
                    <p className='is-size-7 mb-4' style={{ whiteSpace: 'pre-wrap' }}>
                        {message || 'Polling for pass token...'}
                    </p>
                    <button
                        type='button'
                        onClick={cancelPassTokenPolling}
                        className='button is-danger'
                    >
                        Cancel Login
                    </button>
                </div>
            )}

            {fetchSummary && weightRecords.length === 0 && (
                <div className='notification is-success is-light has-text-centered'>
                    ✅ You&apos;re all caught up — no new measurements ({fetchSummary.duplicates} of {fetchSummary.total} fetched were already saved).
                </div>
            )}

            {weightRecords.length > 0 && (
                <div className='mb-5'>
                    <p className='has-text-weight-semibold mb-2'>
                        🎉 {weightRecords.length} new measurement{weightRecords.length === 1 ? '' : 's'}
                        {fetchSummary && (
                            <span className='has-text-weight-normal has-text-grey is-size-7 ml-2'>
                                ({fetchSummary.duplicates} of {fetchSummary.total} fetched were already saved)
                            </span>
                        )}
                    </p>
                    <div className='box p-0' style={{ overflowX: 'auto' }}>
                        <table className='table is-fullwidth is-hoverable is-narrow mb-0'>
                            <thead>
                                <tr>
                                    <th style={{ whiteSpace: 'nowrap' }}>Date</th>
                                    {metricFields.map((field) => (
                                        <th key={field.key} style={{ whiteSpace: 'nowrap' }}>
                                            {field.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {weightRecords.map((record, index) => (
                                    <tr key={`${record.date || 'record'}-${index}`}>
                                        <td style={{ whiteSpace: 'nowrap' }} className='has-text-weight-medium'>
                                            {formatDate(record.date)}
                                        </td>
                                        {metricFields.map((field) => (
                                            <td key={field.key} style={{ whiteSpace: 'nowrap' }}>
                                                {formatValue(record[field.key])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className='is-flex is-align-items-center is-flex-wrap-wrap mb-6' style={{ gap: '0.75rem' }}>
                <Link href='/' passHref>
                    <button type='button' className='button is-light'>
                        &lt; Back
                    </button>
                </Link>

                {fetchSummary && !isPollingPassToken && (
                    <Link href='/sync/garmin-bulk' passHref className='ml-auto'>
                        <button type='button' className='button is-success'>
                            Continue → Connect to Garmin
                        </button>
                    </Link>
                )}
            </div>
        </div>
    )
}