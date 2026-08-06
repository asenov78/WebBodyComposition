// Lightweight inline SVG line chart — no chart library dependency for one graph.
// Renders weight-over-time from the synced measurement history.
export default function WeightChart({ series }) {
    if (!series || series.length < 2) {
        return (
            <div className="has-text-centered has-text-grey is-size-7 py-6" style={{ border: '1px dashed #dbdbdb', borderRadius: '6px' }}>
                Not enough synced data yet for a trend line (need at least 2 points).
            </div>
        );
    }

    const width = 600;
    const height = 220;
    const padding = { top: 16, right: 16, bottom: 28, left: 40 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const points = series.map((m) => ({ date: new Date(m.sourceDate), weight: m.weight }));
    const minDate = points[0].date.getTime();
    const maxDate = points[points.length - 1].date.getTime();
    const dateSpan = Math.max(1, maxDate - minDate);

    const weights = points.map((p) => p.weight);
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    // A little vertical breathing room so the line doesn't touch the top/bottom edges.
    const weightPad = Math.max(0.5, (maxWeight - minWeight) * 0.15);
    const yMin = minWeight - weightPad;
    const yMax = maxWeight + weightPad;
    const weightSpan = Math.max(0.1, yMax - yMin);

    const xFor = (date) => padding.left + ((date.getTime() - minDate) / dateSpan) * innerWidth;
    const yFor = (weight) => padding.top + innerHeight - ((weight - yMin) / weightSpan) * innerHeight;

    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.date).toFixed(1)} ${yFor(p.weight).toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${xFor(points[points.length - 1].date).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} `
        + `L ${xFor(points[0].date).toFixed(1)} ${(padding.top + innerHeight).toFixed(1)} Z`;

    const first = points[0];
    const last = points[points.length - 1];
    const delta = last.weight - first.weight;
    const gridLines = 4;

    const formatShortDate = (date) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(date);

    const lineColor = '#485fc7'; // Bulma $link
    const deltaColor = delta > 0 ? 'has-text-danger' : delta < 0 ? 'has-text-success' : 'has-text-grey';

    return (
        <div>
            <div className="is-flex is-align-items-baseline is-justify-content-space-between mb-2">
                <div>
                    <span className="title is-4 mb-0">{last.weight.toFixed(1)}</span>
                    <span className="has-text-grey is-size-7 ml-1">kg</span>
                </div>
                <div className={`is-size-7 has-text-weight-semibold ${deltaColor}`}>
                    {delta === 0 ? '—' : `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} kg`}
                    <span className="has-text-grey-light has-text-weight-normal ml-1">since {formatShortDate(first.date)}</span>
                </div>
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }} preserveAspectRatio="xMidYMid meet">
                <defs>
                    <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {Array.from({ length: gridLines + 1 }).map((_, i) => {
                    const y = padding.top + (innerHeight / gridLines) * i;
                    const value = yMax - (weightSpan / gridLines) * i;
                    return (
                        <g key={i}>
                            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                            <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#9ca3af">{value.toFixed(0)}</text>
                        </g>
                    );
                })}

                <path d={areaPath} fill="url(#weightFill)" stroke="none" />
                <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

                {points.map((p, i) => (
                    <circle key={i} cx={xFor(p.date)} cy={yFor(p.weight)} r={i === points.length - 1 ? 4 : 2.5}
                        fill={lineColor} stroke="white" strokeWidth={i === points.length - 1 ? 1.5 : 0} />
                ))}

                <text x={padding.left} y={height - 8} fontSize="10" fill="#9ca3af">{formatShortDate(first.date)}</text>
                <text x={width - padding.right} y={height - 8} textAnchor="end" fontSize="10" fill="#9ca3af">{formatShortDate(last.date)}</text>
            </svg>
        </div>
    );
}
