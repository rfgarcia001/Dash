import React from 'react';

interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

function EmptyStateBody({ title, subtitle }: EmptyStateProps) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-medium text-[var(--text-muted)]">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-[var(--text-subtle)]">{subtitle}</p>}
    </div>
  );
}

export function EmptyState(props: EmptyStateProps) {
  return <EmptyStateBody {...props} />;
}

export function EmptyTableRow({ colSpan, ...props }: EmptyStateProps & { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <EmptyStateBody {...props} />
      </td>
    </tr>
  );
}
