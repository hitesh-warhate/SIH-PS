import { useCallback, useEffect, useState } from 'react';
import { SERVER_OFFLINE, SERVER_ONLINE, checkHealth } from '../api.js';
import { useI18n } from '../i18n/index.jsx';

// A banner on every page while the API or its database cannot be reached. It checks once at start-up, again whenever a
// request fails to reach the server, and every few seconds while down; it says so briefly when the connection is back.
export default function ConnectionBanner() {
  const { t } = useI18n();
  const [state, setState] = useState('up'); // 'up' | 'api-down' | 'db-down' | 'back'

  const probe = useCallback(async () => {
    const s = await checkHealth();
    setState((prev) => (s === 'up' ? (prev === 'up' || prev === 'back' ? prev : 'back') : s));
  }, []);

  useEffect(() => {
    probe();
    const down = () => probe();
    const up = () => setState((prev) => (prev === 'up' ? prev : 'back'));
    window.addEventListener(SERVER_OFFLINE, down);
    window.addEventListener(SERVER_ONLINE, up);
    return () => { window.removeEventListener(SERVER_OFFLINE, down); window.removeEventListener(SERVER_ONLINE, up); };
  }, [probe]);

  useEffect(() => {
    if (state === 'back') { const id = setTimeout(() => setState('up'), 2500); return () => clearTimeout(id); }
    if (state === 'up') return undefined;
    const id = setInterval(probe, 4000);
    return () => clearInterval(id);
  }, [state, probe]);

  if (state === 'up') return null;
  const down = state !== 'back';
  return (
    <div className={`conn-banner ${down ? 'is-down' : 'is-back'}`} role={down ? 'alert' : 'status'}>
      <span className="conn-dot" aria-hidden="true" />
      <span className="conn-text">
        <strong>{t(state === 'db-down' ? 'conn.dbDown' : state === 'back' ? 'conn.back' : 'conn.apiDown')}</strong>
        {down && <small>{t('conn.hint')}</small>}
      </span>
      {down && <button type="button" onClick={probe}>{t('conn.retry')}</button>}
    </div>
  );
}
