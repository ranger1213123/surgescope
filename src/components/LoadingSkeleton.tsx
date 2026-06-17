interface SkeletonProps {
  /** Render a full-card skeleton (360px) */
  variant?: 'card' | 'kpi' | 'text';
  /** Number of text skeleton lines (only when variant="text") */
  lines?: number;
}

export function LoadingSkeleton({ variant = 'text', lines = 3 }: SkeletonProps) {
  if (variant === 'card') {
    return <div className="skeleton skeleton-card" />;
  }
  if (variant === 'kpi') {
    return <div className="skeleton skeleton-kpi" />;
  }
  return (
    <>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton skeleton-text" style={{ width: `${60 + Math.random() * 35}%` }} />
      ))}
    </>
  );
}

export function LoadingView({ text = '正在加载数据…' }: { text?: string }) {
  return (
    <div className="loading-state">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}
