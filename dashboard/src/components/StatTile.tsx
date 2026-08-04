interface StatTileProps {
  label: string;
  value: string | number;
  tone?: 'default' | 'warning';
}

export function StatTile({ label, value, tone = 'default' }: StatTileProps) {
  return (
    <div className={`stat-tile stat-tile--${tone}`}>
      <div className="stat-tile__value">{value}</div>
      <div className="stat-tile__label">{label}</div>
    </div>
  );
}
