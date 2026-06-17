interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down';
  trendLabel?: string;
}

export function KpiCard({ label, value, sub, trend, trendLabel }: KpiCardProps) {
  return (
    <div className="kpi-card">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <div className="kpi-sub">{sub}</div>}
      {trend && trendLabel && (
        <div className={`kpi-trend ${trend}`}>
          {trend === 'up' ? '↑' : '↓'} {trendLabel}
        </div>
      )}
    </div>
  );
}
