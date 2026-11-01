import { ICONS } from './iconRegistry.js';

// Distinct shapes per state, never colour alone: off = slash, active = ring, disabled = dashed.
export default function Icon({ name, state = 'default', size = 32 }) {
  return (
    <svg className={`icon icon-${state}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {state === 'active' && <circle cx="12" cy="12" r="11.5" strokeWidth="1.5" />}
      <g strokeDasharray={state === 'disabled' ? '2 2.5' : undefined}>
        {ICONS[name].map((d) => <path key={d} d={d} />)}
      </g>
      {state === 'off' && <path d="M3 3l18 18" strokeWidth="2.5" />}
    </svg>
  );
}
