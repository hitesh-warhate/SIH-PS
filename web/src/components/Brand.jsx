// The product mark: a cross with a pulse line, in the accent green.
export default function Brand({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill="#8cc63f" />
      <path d="M13 6h6v7h7v6h-7v7h-6v-7H6v-6h7z" fill="#10240a" />
      <path d="M3 17h7l2-4 3 8 2-4h12" fill="none" stroke="#8cc63f" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
