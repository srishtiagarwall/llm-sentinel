import { useMemo, useState } from 'react';

export interface TrendPoint {
  hour: string;
  avgScore: string | number;
}

interface Props {
  data: TrendPoint[];
}

const WIDTH = 640;
const HEIGHT = 160;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

function formatHour(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString([], { hour: 'numeric' });
}

export function HallucinationTrendChart({ data }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points = useMemo(
    () =>
      data
        .map((d) => ({ hour: d.hour, score: Number(d.avgScore) }))
        .filter((d) => Number.isFinite(d.score)),
    [data],
  );

  if (points.length === 0) {
    return <p className="empty-state">Not enough scored traces yet to show a trend.</p>;
  }

  const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (i: number) => PAD_LEFT + (points.length === 1 ? innerWidth / 2 : (i / (points.length - 1)) * innerWidth);
  const yFor = (score: number) => PAD_TOP + (1 - score) * innerHeight;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(p.score)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(points.length - 1)} ${PAD_TOP + innerHeight} L ${xFor(0)} ${PAD_TOP + innerHeight} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="trend-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Average hallucination score by hour, last 24 hours"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={yFor(t)}
              y2={yFor(t)}
              className="trend-chart__gridline"
            />
            <text x={PAD_LEFT - 8} y={yFor(t)} className="trend-chart__tick" textAnchor="end" dominantBaseline="middle">
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        <path d={areaPath} className="trend-chart__area" />
        <path d={linePath} className="trend-chart__line" fill="none" />

        {hovered && (
          <line
            x1={xFor(hoverIndex!)}
            x2={xFor(hoverIndex!)}
            y1={PAD_TOP}
            y2={PAD_TOP + innerHeight}
            className="trend-chart__crosshair"
          />
        )}

        {points.map((p, i) => (
          <circle
            key={p.hour}
            cx={xFor(i)}
            cy={yFor(p.score)}
            r={hoverIndex === i ? 5 : 3}
            className="trend-chart__dot"
          />
        ))}

        {/* Transparent hit targets — wider than the visible marks so hover is easy to land */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.hour}`}
            x={xFor(i) - innerWidth / Math.max(points.length, 1) / 2}
            y={PAD_TOP}
            width={innerWidth / Math.max(points.length, 1)}
            height={innerHeight}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
            onFocus={() => setHoverIndex(i)}
            tabIndex={0}
          />
        ))}
      </svg>

      {hovered && (
        <div className="trend-chart__tooltip">
          <span className="trend-chart__tooltip-time">{formatHour(hovered.hour)}</span>
          <span className="trend-chart__tooltip-value">{hovered.score.toFixed(3)}</span>
        </div>
      )}
    </div>
  );
}
