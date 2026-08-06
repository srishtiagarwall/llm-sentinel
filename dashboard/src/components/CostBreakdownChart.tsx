import { useMemo, useState } from 'react';
import type { CostBreakdownItem } from '../lib/api';

interface Props {
  data: CostBreakdownItem[];
}

const BAR_HEIGHT = 22;
const BAR_GAP = 10;
const LABEL_WIDTH = 130;
const CHART_WIDTH = 640;
const VALUE_WIDTH = 90;

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

export function CostBreakdownChart({ data }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rows = useMemo(
    () =>
      data
        .map((d) => ({
          model: d.model,
          cost: Number(d.totalCost),
          requests: Number(d.requestCount),
        }))
        .filter((d) => Number.isFinite(d.cost))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 8),
    [data],
  );

  if (rows.length === 0) {
    return <p className="empty-state">No cost data yet.</p>;
  }

  const maxCost = Math.max(...rows.map((r) => r.cost), 0.0001);
  const barAreaWidth = CHART_WIDTH - LABEL_WIDTH - VALUE_WIDTH;
  const height = rows.length * (BAR_HEIGHT + BAR_GAP);

  return (
    <div className="cost-chart">
      <svg viewBox={`0 0 ${CHART_WIDTH} ${height}`} role="img" aria-label="Total cost by model">
        {rows.map((row, i) => {
          const y = i * (BAR_HEIGHT + BAR_GAP);
          const barWidth = Math.max((row.cost / maxCost) * barAreaWidth, 3);
          const isHovered = hoverIndex === i;

          return (
            <g
              key={row.model}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              tabIndex={0}
              className="cost-chart__row"
            >
              <text
                x={LABEL_WIDTH - 10}
                y={y + BAR_HEIGHT / 2}
                textAnchor="end"
                dominantBaseline="middle"
                className="cost-chart__label"
              >
                {row.model}
              </text>
              <rect
                x={LABEL_WIDTH}
                y={y}
                width={barWidth}
                height={BAR_HEIGHT}
                rx={4}
                className={`cost-chart__bar ${isHovered ? 'cost-chart__bar--hover' : ''}`}
              />
              <text
                x={LABEL_WIDTH + barWidth + 8}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                className="cost-chart__value"
              >
                {formatCost(row.cost)}
              </text>
              {/* Wider transparent hit target for easier hover/focus */}
              <rect
                x={0}
                y={y - BAR_GAP / 2}
                width={CHART_WIDTH}
                height={BAR_HEIGHT + BAR_GAP}
                fill="transparent"
              />
            </g>
          );
        })}
      </svg>

      {hoverIndex !== null && (
        <div className="cost-chart__tooltip">
          <span className="cost-chart__tooltip-model">{rows[hoverIndex].model}</span>
          <span className="cost-chart__tooltip-value">
            {formatCost(rows[hoverIndex].cost)} · {rows[hoverIndex].requests} requests
          </span>
        </div>
      )}
    </div>
  );
}
