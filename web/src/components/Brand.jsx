import { useId } from 'react';

// The product mark: a white cross with a pulse line on a teal-to-indigo tile.
export default function Brand({ size = 30 }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#ffffff" />
      <path d="M3 17h7l2-4 3 8 2-4h12" fill="none" stroke="#0f766e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
