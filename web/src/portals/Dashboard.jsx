import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { GlyphIcon } from '../components/Hero.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Donut, MiniBars, WeekGrid } from '../ui/charts.jsx';

const IDX = { en: 0, hi: 1, mr: 2 };
const LOCALE = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };
const TILE_ICON = { newPatients: 'people', submitted: 'file', alerts: 'alert', confirmed: 'check', registrations: 'people', signIns: 'check', auditEvents: 'file', deliveriesFailed: 'alert' };
const BAD_WHEN_UP = new Set(['alerts', 'deliveriesFailed']);
const CHIP = { registered: 'not_started', in_intake: 'in_intake', alert: 'alert', ready: 'ready', in_consultation: 'in_consultation', completed: 'completed', rejected: 'rejected' };

// The landing page of every portal: figures, a complaint chart, the week's patients, insights worked out from the records, and the latest cases.
// All of it comes from GET /api/dashboard; nothing on this page is example data.
export default function Dashboard({ portal }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [range, setRange] = useState(7);
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => api(`/dashboard?range=${range}`).then((r) => { if (r.ok) { setData(r.body); setFailed(false); } else setFailed(true); }).catch(() => setFailed(true)), [range]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) return <section className="dash"><div className="dash-hero"><h1>{t('dash.title')}</h1><p>{failed ? t('analysis.loadError') : t('dash.loading')}</p></div></section>;

  const admin = data.role === 'admin';
  const dayName = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALE[lang], { weekday: 'short', day: 'numeric', timeZone: 'UTC' });
  const bars = data.dates.map(dayName);
  const label = (x) => x.label[IDX[lang]];
  const param = (v) => (Array.isArray(v) ? v[IDX[lang]] : v);
  const insightText = (i) => t(`insight.${i.key}`, Object.fromEntries(Object.entries(i.params).map(([k, v]) => [k, param(v)])));
  const open = (id) => navigate(portal === 'doctor' ? `/doctor/workspace?encounter=${id}` : '/staff/queue');

  return (
    <section className="dash">
      <div className="dash-hero">
        <h1>{t('dash.title')}</h1>
        <p>{t(admin ? 'dash.sub.admin' : 'dash.sub.clinical')}</p>
        <div className="tiles">
          {data.tiles.map((x) => {
            const diff = x.value - x.previous;
            const bad = BAD_WHEN_UP.has(x.key) ? diff > 0 : diff < 0;
            return (
              <article key={x.key} className="tile">
                <div className="tile-head"><GlyphIcon name={TILE_ICON[x.key]} /><span>{t(`dash.tile.${x.key}`)}</span></div>
                <div className="tile-body">
                  <div>
                    <strong className="tile-n">{x.value}</strong>
                    <small className={`delta${diff === 0 ? '' : bad ? ' is-bad' : ' is-good'}`}>
                      {diff === 0 ? t('dash.same') : t('dash.vsYesterday', { n: `${diff > 0 ? '+' : '−'}${Math.abs(diff)}` })}
                    </small>
                  </div>
                  <MiniBars series={x.series} labels={bars} />
                </div>
                <small className="tile-foot">{t('dash.last7', { n: x.total })}</small>
              </article>
            );
          })}
        </div>
      </div>

      <div className="dash-row">
        <article className="panel">
          <header className="panel-head">
            <h2>{t(admin ? 'dash.chart.admin' : 'dash.chart.title')}</h2>
            <div className="seg" role="group" aria-label={t('dash.chart.range')}>
              {[7, 30].map((d) => <button key={d} type="button" className={range === d ? 'is-active' : ''} aria-pressed={range === d} onClick={() => setRange(d)}>{t(`dash.chart.range${d}`)}</button>)}
            </div>
          </header>
          <Donut items={data.distribution.items} total={data.distribution.total} centerLabel={t(admin ? 'dash.chart.totalAdmin' : 'dash.chart.total')} getLabel={label} empty={t('dash.chart.empty')} />
        </article>

        {data.schedule ? (
          <article className="panel panel-week">
            <header className="panel-head"><div><h2>{t('dash.week.title')}</h2><small className="muted">{t('dash.week.sub')}</small></div></header>
            {data.schedule.items.length === 0 ? <p className="muted chart-empty">{t('dash.week.empty')}</p> : (
              <WeekGrid schedule={data.schedule} dayLabel={dayName} hourLabel={(h) => `${String(h).padStart(2, '0')}:00`}
                moreLabel={(n) => t('dash.week.more', { n })} statusLabel={(s) => t(`ws.status.${CHIP[s]}`)} onOpen={(i) => open(i.id)} />
            )}
          </article>
        ) : (
          <article className="panel">
            <header className="panel-head"><h2>{t('dash.health.title')}</h2></header>
            <ul className="health-list">{data.health.map((h) => <li key={h.key}><span className={`pill ${h.status}`}>{h.status === 'ok' ? '✔' : h.status === 'down' ? '✖' : '!'} {t(`admin.health.${h.status}`)}</span> {t(`admin.health.c.${h.key}`)}</li>)}</ul>
          </article>
        )}

        <article className="panel">
          <header className="panel-head"><h2>{t('dash.insights.title')}</h2></header>
          <ul className="insights">
            {data.insights.map((i) => (
              <li key={i.key}><span className="bolt" aria-hidden="true"><GlyphIcon name="bolt" size={18} /></span><span>{insightText(i)}</span></li>
            ))}
          </ul>
          <small className="muted">{t('dash.insights.note')}</small>
        </article>
      </div>

      <article className="panel">
        <header className="panel-head">
          <h2>{t(admin ? 'dash.recent.admin' : 'dash.recent.title')}</h2>
          {!admin && <button type="button" className="linklike" onClick={() => navigate(portal === 'doctor' ? '/doctor/workspace' : '/staff/queue')}>{t('dash.recent.viewAll')}</button>}
          {admin && <button type="button" className="linklike" onClick={() => navigate('/admin/audit')}>{t('dash.recent.viewAll')}</button>}
        </header>
        <div className="table-wrap">
          {admin ? (
            <table className="dash-table">
              <thead><tr><th>{t('admin.audit.action')}</th><th>{t('admin.audit.actor')}</th><th>{t('admin.audit.when')}</th></tr></thead>
              <tbody>{data.recent.map((r) => <tr key={r.id}><td><strong>{r.action}</strong></td><td>{r.actorType ?? '–'}</td><td>{new Date(r.at).toLocaleString(LOCALE[lang])}</td></tr>)}</tbody>
            </table>
          ) : (
            <table className="dash-table">
              <thead><tr><th>{t('dash.col.patient')}</th><th>{t('dash.col.date')}</th><th>{t('dash.col.complaint')}</th><th>{t('dash.col.intake')}</th><th>{t('dash.col.status')}</th><th /></tr></thead>
              <tbody>
                {data.recent.length === 0 && <tr><td colSpan="6" className="muted">{t('analysis.noPatients')}</td></tr>}
                {data.recent.map((r) => (
                  <tr key={r.id}>
                    <td><span className="cell-person"><span className="avatar sm" aria-hidden="true">{r.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span><span><strong>{r.name}</strong><small>{r.token != null ? t('analysis.token', { n: r.token }) : ''}</small></span></span></td>
                    <td>{new Date(r.startedAt).toLocaleString(LOCALE[lang], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{r.complaint ? label(r.complaint) : '–'}</td>
                    <td>{r.intakeMinutes != null ? t('dash.min', { m: r.intakeMinutes }) : '–'}</td>
                    <td><span className={`pill st-${r.status}`}>{t(`ws.status.${CHIP[r.status]}`)}</span></td>
                    <td className="actions"><button type="button" onClick={() => open(r.id)}>{t('dash.open')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </article>
    </section>
  );
}
