import React from 'react';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 20, padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13, boxShadow: 'var(--card-shadow)' }}>
      {label}
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 20, padding: '20px 22px', color: 'var(--rust)', fontSize: 13, boxShadow: 'var(--card-shadow)' }}>
      {message}
    </div>
  );
}

export function EmptyState({ label }) {
  return (
    <div style={{ padding: '24px 4px', textAlign: 'center', color: 'var(--ink-soft)', fontSize: 13 }}>
      {label}
    </div>
  );
}
