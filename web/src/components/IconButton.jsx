import Icon from './Icon.jsx';
import { useI18n } from '../i18n/index.jsx';

// Patient-screen button: icon plus text label, 64 px minimum touch target (CSS .touch), audio cue hook added in Phase 2.
export default function IconButton({ name, state = 'default', onClick, label }) {
  const { t } = useI18n();
  return (
    <button type="button" className={`touch icon-button icon-button-${state}`} onClick={onClick}
      disabled={state === 'disabled'} aria-pressed={state === 'active' ? true : undefined}>
      <Icon name={name} state={state} />
      <span>{label ?? t(`icon.${name}`)}</span>
    </button>
  );
}
