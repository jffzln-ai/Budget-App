import React from 'react';

// Circular progress ring - value/max drawn as an arc. Used for the hero
// "available out of X" style stats, matching the reference direction.
export function ProgressRing({ value, max, size = 140, strokeWidth = 12, color = '#1F4D3D', trackColor = '#E3DECF', children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0;
  const offset = circumference * (1 - pct);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

const iconProps = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

export function IconHome({ color = 'currentColor' }) {
  return (
    <svg {...iconProps} stroke={color}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

export function IconList({ color = 'currentColor' }) {
  return (
    <svg {...iconProps} stroke={color}>
      <circle cx="4.5" cy="6" r="1" fill={color} stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill={color} stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill={color} stroke="none" />
      <path d="M9 6h11M9 12h11M9 18h11" />
    </svg>
  );
}

export function IconClock({ color = 'currentColor' }) {
  return (
    <svg {...iconProps} stroke={color}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function IconMore({ color = 'currentColor' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round">
      <circle cx="5" cy="12" r="1.4" fill={color} stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill={color} stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill={color} stroke="none" />
    </svg>
  );
}

export function IconLayers({ color = 'currentColor' }) {
  return (
    <svg {...iconProps} stroke={color}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </svg>
  );
}

export function IconUpload({ color = 'currentColor' }) {
  return (
    <svg {...iconProps} stroke={color}>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}
