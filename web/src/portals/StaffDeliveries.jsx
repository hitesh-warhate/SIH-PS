import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';

const MARK = { delivered: '✔', failed: '✖', pending: '…', not_sent: '–', cancelled: '–' };
const REASONS = new Set(['no_consent', 'no_abha_identifier', 'invalid_bundle', 'consent_withdrawn']);

// Delivery of confirmed summaries to the hospital system and ABHA: a failure is shown plainly, first, with a way to try again (Phase 8).
export default function StaffDeliveries() {
  const { t } = useI18n();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api('/staff/deliveries').then((r) => { if (r.ok) setRows(r.body.deliveries); }).catch(() => {}), []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);
  const retry = async (id) => { await api(`/staff/deliveries/${id}/retry`, { method: 'POST' }); load(); };

  return (
    <section className="alerts-page">
      <div className="alerts-head"><h2>{t('deliveries.title')}</h2></div>
      {rows && rows.length === 0 && <p>{t('deliveries.none')}</p>}
      {rows && rows.length > 0 && (
        <table className="queue-table">
          <thead><tr><th>{t('queue.token')}</th><th>{t('deliveries.patient')}</th><th>{t('deliveries.target')}</th><th>{t('deliveries.status')}</th><th>{t('deliveries.detail')}</th><th /></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className={d.status === 'failed' ? 'row-alert' : ''}>
                <td>{d.token ?? '–'}</td>
                <td>{d.patientName}</td>
                <td>{t(`deliveries.target.${d.target}`)}</td>
                <td><strong>{MARK[d.status]} {t(`deliveries.status.${d.status}`)}</strong></td>
                <td>
                  {d.reason && REASONS.has(d.reason) && t(`deliveries.reason.${d.reason}`)}
                  {d.status !== 'not_sent' && d.attempts > 0 && <> {t('deliveries.attempts', { n: d.attempts })}</>}
                  {d.lastError && d.status !== 'delivered' && <div className="muted small">{d.lastError}</div>}
                  {d.ack?.id && <div className="muted small">{t('deliveries.ack', { id: d.ack.id })}</div>}
                </td>
                <td>{d.status === 'failed' && d.reason !== 'invalid_bundle' && <button type="button" onClick={() => retry(d.id)}>{t('deliveries.retry')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
