import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { openAlerts } from '../alertState.js';
import { useI18n } from '../i18n/index.jsx';
import Icon from '../components/Icon.jsx';
import { Hero } from '../components/Hero.jsx';
import { useAlertStream } from '../useAlertStream.js';

const IDX = { en: 0, hi: 1, mr: 2 };

function LiveBadge({ live }) {
  const { t } = useI18n();
  return <span className={`live-badge${live ? ' is-live' : ''}`} role="status">{live ? `● ${t('alerts.live')}` : `○ ${t('alerts.offline')}`}</span>;
}

// Level is shown with an icon and words, never colour alone.
function LevelTag({ level }) {
  const { t } = useI18n();
  return <span className={`level level-${level}`}><Icon name={level === 'emergency' ? 'help' : 'followup'} size={20} /> {t(`alerts.level.${level}`)}</span>;
}

function AlertCard({ a, onAck, onOpen }) {
  const { t, lang } = useI18n();
  const i = IDX[lang];
  return (
    <article className={`alert-card level-${a.level}${a.acknowledgedAt ? ' is-acked' : ''}`}>
      <header>
        <LevelTag level={a.level} />
        <strong>{t('alerts.token', { n: a.token ?? '–' })}</strong>
        <span>{a.patientName} · {a.patientcaseId}</span>
        <span className="muted">{t('alerts.raised', { time: new Date(a.raisedAt).toLocaleTimeString() })}</span>
      </header>
      <p className="alert-reason">{a.reason[i]}</p>
      <p className="muted">{t('alerts.triggered')}:</p>
      <ul>
        {a.triggers.map((x) => (
          <li key={x.key}>{x.question[i]} <strong>{x.skipped ? t('alerts.notAnswered') : x.answer[i]}</strong></li>
        ))}
      </ul>
      <footer>
        {a.acknowledgedAt
          ? <span className="ok">✔ {t('alerts.acknowledgedBy', { name: a.acknowledgedBy ?? '' })}</span>
          : onAck && <button type="button" className="primary" onClick={() => onAck(a)}>{t('alerts.ack')}</button>}
        {onOpen && <button type="button" onClick={() => onOpen(a)}>{t('alerts.openCase')}</button>}
      </footer>
    </article>
  );
}

// Staff priority screen: alerts first, with the triggering answers and an Acknowledge action (FR-T1), help requests beside them.
export function StaffAlerts() {
  const { t } = useI18n();
  const { alerts, help, live } = useAlertStream('staff');
  const [error, setError] = useState('');
  const open = openAlerts(alerts);

  const ack = async (a) => {
    setError('');
    try {
      const r = await api(`/staff/alerts/${a.id}/ack`, { method: 'POST' });
      if (!r.ok && r.status !== 404) setError(t('signin.error.network'));
    } catch { setError(t('signin.error.network')); }
  };
  const ackHelp = async (h) => { try { await api(`/staff/help-requests/${h.id}/ack`, { method: 'POST' }); } catch { setError(t('signin.error.network')); } };

  return (
    <>
    <Hero title={t('nav.staff.alerts')} subtitle={t('hero.staff.sub')} tiles={[
      { label: t('hero.openAlerts'), value: open.length, icon: 'alert', tone: 'alert' }, { label: t('hero.helpRequests'), value: help.filter((h) => !h.acknowledgedAt).length, icon: 'people', tone: 'alert' },
      { label: t('hero.acknowledged'), value: alerts.length - open.length, icon: 'check' },
    ]} />
    <section className="alerts-page">
      <div className="alerts-head">
        <h2>{t('alerts.title')}</h2>
        <strong>{t('alerts.open', { n: open.length })}</strong>
        <LiveBadge live={live} />
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {alerts.length === 0 && <p>{t('alerts.none')}</p>}
      {alerts.map((a) => <AlertCard key={a.id} a={a} onAck={ack} />)}

      <h2>{t('help.title')}</h2>
      {help.length === 0 && <p>{t('help.none')}</p>}
      {help.map((h) => (
        <article key={h.id} className={`help-card${h.acknowledgedAt ? ' is-acked' : ''}`}>
          <strong>{t(`help.reason.${h.reason}`)}</strong>
          <span>{h.patientName ? `${h.patientName} · ${h.patientcaseId}` : ''}</span>
          {h.detail?.screen && <span className="muted">{t('help.screen', { screen: h.detail.screen })}</span>}
          <span className="muted">{new Date(h.createdAt).toLocaleTimeString()}</span>
          {!h.acknowledgedAt && <button type="button" onClick={() => ackHelp(h)}>{t('help.done')}</button>}
        </article>
      ))}
    </section>
    </>
  );
}

// Queue: alerts first, then token order (priority comes from the server).
export function StaffQueue() {
  const { t, lang } = useI18n();
  const { version, live } = useAlertStream('staff');
  const [rows, setRows] = useState([]);
  const load = () => api('/staff/queue').then((r) => { if (r.ok) setRows(r.body.queue); }).catch(() => {});
  useEffect(() => { load(); }, [version]);
  // AYUSH mode follows the department; staff can switch it for one patient (Phase 7).
  const toggleAyush = async (r) => { await api(`/staff/encounters/${r.encounterId}/mode`, { method: 'PUT', body: { ayush: !r.ayush } }); load(); };
  return (
    <>
    <Hero title={t('nav.staff.queue')} subtitle={t('hero.staff.sub')} tiles={[
      { label: t('hero.inQueue'), value: rows.length, icon: 'people' }, { label: t('hero.withAlerts'), value: rows.filter((r) => r.openAlerts > 0).length, icon: 'alert', tone: 'alert' },
      { label: t('ws.counter.ready'), value: rows.filter((r) => r.status === 'ready').length, icon: 'file' },
    ]} />
    <section className="alerts-page">
      <div className="alerts-head"><h2>{t('queue.title')}</h2><LiveBadge live={live} /></div>
      {rows.length === 0 ? <p>{t('queue.empty')}</p> : (
        <table className="queue-table">
          <thead><tr><th>{t('queue.token')}</th><th>{t('queue.patient')}</th><th>{t('queue.complaint')}</th><th>{t('queue.status')}</th><th>{t('queue.alerts')}</th><th>{t('queue.ayush')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.encounterId} className={r.openAlerts ? 'row-alert' : ''}>
                <td>{r.token}</td>
                <td>{r.patientName}<br /><small>{r.patientcaseId}</small></td>
                <td>{r.complaint ? r.complaint.label[IDX[lang]] : '–'}</td>
                <td>{t(`status.${r.status}`)}</td>
                <td>{r.openAlerts > 0 ? `⚠ ${r.openAlerts}` : ''}</td>
                <td><button type="button" aria-pressed={r.ayush} onClick={() => toggleAyush(r)}>{r.ayush ? `✔ ${t('queue.ayush.on')}` : t('queue.ayush.off')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
    </>
  );
}

// Doctor banner: alerts for this doctor's patients, an Open action and the acknowledged status (FR-T2).
export function DoctorBanner() {
  const { t, lang } = useI18n();
  const { alerts, live } = useAlertStream('doctor');
  const navigate = useNavigate();
  const shown = alerts.slice(0, 5);
  if (!shown.length) return live ? null : <div className="banner banner-quiet"><LiveBadge live={live} /></div>;
  return (
    <div className="banner" role="region" aria-label={t('doctor.banner.title')}>
      {shown.map((a) => (
        <div key={a.id} className={`banner-row level-${a.level}${a.acknowledgedAt ? ' is-acked' : ''}`}>
          <LevelTag level={a.level} />
          <strong>{t('alerts.token', { n: a.token ?? '–' })}</strong>
          <span>{a.patientName}</span>
          <span className="banner-reason">{a.reason[IDX[lang]]}</span>
          <span className={a.acknowledgedAt ? 'ok' : 'waiting'}>
            {a.acknowledgedAt ? `✔ ${t('alerts.acknowledgedBy', { name: a.acknowledgedBy ?? '' })}` : `… ${t('alerts.waiting')}`}
          </span>
          <button type="button" className="primary" onClick={() => navigate(`/doctor/workspace?encounter=${a.encounterId}`)}>{t('alerts.openCase')}</button>
        </div>
      ))}
    </div>
  );
}

export { AlertCard };
