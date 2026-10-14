import React from 'react';

// Skeleton blocks shaped roughly like a page: a heading, a hero, two cards.
// Shown on first load only - refreshes keep the current content on screen.
export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="skeleton" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="skel" style={{ height: 180, borderRadius: 6 }} />
      <div className="skel" style={{ height: 220, borderRadius: 6 }} />
      <div className="skel" style={{ height: 160, borderRadius: 6 }} />
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div className="card" role="alert" style={{ color: 'var(--neg)' }}>
      {message}
    </div>
  );
}

export function EmptyState({ label }) {
  return (
    <div className="t-14 muted" style={{ padding: '24px 4px', textAlign: 'center' }}>
      {label}
    </div>
  );
}
