import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
  accent?: boolean;
  noPadding?: boolean;
}

export function GlassCard({ children, interactive, accent, noPadding, className = '', ...rest }: CardProps) {
  const cls = [
    'card',
    interactive && 'interactive',
    accent && 'accent',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} {...rest}>
      {noPadding ? children : <div className="card-body">{children}</div>}
    </div>
  );
}
