import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Hero } from '../components/Hero.jsx';

const ROLES = ['staff', 'doctor', 'admin'];
const MARK = { ok: '✔', degraded: '!', down: '✖' };

const useLoad = (path, key, every = 0) => {
  const [data, setData] = useState(null);
  const load = useCallback(() => api(path).then((r) => { if (r.ok) setData(key ? r.body[key] : r.body); }).catch(() => {}), [path, key]);
  useEffect(() => {
    load();
    if (!every) return undefined;
    const timer = setInterval(load, every);
    return () => clearInterval(timer);
  }, [load, every]);
  return [data, load];
};

// ---------- accounts (FR-P6) ----------
export function AdminAccounts() {
  const { t } = useI18n();
  const [users, load] = useLoad('/admin/users', 'users');
  const [depts] = useLoad('/admin/departments', 'departments');
  const [form, setForm] = useState({ role: 'staff', fullName: '', username: '', departmentId: '' });
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState('');

  const create = async (e) => {
    e.preventDefault();
    setError(''); setNotice(null);
    const r = await api('/admin/users', { method: 'POST', body: { ...form, departmentId: form.departmentId || null } });
    if (!r.ok) setError(t(`admin.error.${r.body.error}`) === `admin.error.${r.body.error}` ? t('admin.error.generic') : t(`admin.error.${r.body.error}`));
    else { setNotice({ who: r.body.user.username, password: r.body.temporaryPassword }); setForm({ ...form, fullName: '', username: '' }); load(); }
  };
  const act = async (id, action) => {
    setError(''); setNotice(null);
    const r = await api(`/admin/users/${id}/${action}`, { method: 'POST' });
    if (!r.ok) setError(t('admin.error.generic'));
    else if (r.body.temporaryPassword) setNotice({ who: users.find((u) => u.id === id)?.username, password: r.body.temporaryPassword });
    load();
  };

  return (
    <>
    <Hero title={t('nav.admin.accounts')} subtitle={t('hero.admin.sub')} tiles={[
      { label: t('hero.accounts'), value: users?.length ?? 0, icon: 'people' }, { label: t('admin.active'), value: users?.filter((u) => !u.disabledAt).length ?? 0, icon: 'check' },
      { label: t('admin.disabled'), value: users?.filter((u) => u.disabledAt).length ?? 0, icon: 'alert' },
    ]} />
    <section className="alerts-page">
      <h2>{t('admin.accounts.title')}</h2>
      <form className="admin-form" onSubmit={create}>
        <label>{t('admin.field.role')}
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(`portal.${r}`)}</option>)}</select>
        </label>
        <label>{t('admin.field.name')}<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required minLength={2} /></label>
        <label>{t('admin.field.username')}<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required pattern="[a-z0-9._-]{3,40}" title="a-z 0-9 . _ -" /></label>
        <label>{t('admin.field.department')}
          <select value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            <option value="">–</option>{(depts ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}{d.ayush ? ' (AYUSH)' : ''}</option>)}
          </select>
        </label>
        <button type="submit" className="primary">{t('admin.create')}</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      {notice && (
        <p role="status" className="draft-note">
          {notice.password ? t('admin.tempPassword', { who: notice.who, password: notice.password }) : t('admin.created', { who: notice.who })}
          <br /><small>{t('admin.tempPasswordNote')}</small>
        </p>
      )}
      {users && (
        <table className="queue-table">
          <thead><tr><th>{t('admin.field.name')}</th><th>{t('admin.field.username')}</th><th>{t('admin.field.role')}</th><th>{t('admin.field.department')}</th><th>{t('admin.field.status')}</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.disabledAt ? 'is-acked' : ''}>
                <td>{u.fullName}</td><td>{u.username}</td><td>{t(`portal.${u.role}`)}</td><td>{u.department ?? '–'}</td>
                <td>{u.disabledAt ? `✖ ${t('admin.disabled')}` : `✔ ${t('admin.active')}`}{u.mfaEnabled ? ` · ${t('admin.mfa')}` : ''}</td>
                <td className="admin-actions">
                  <button type="button" onClick={() => act(u.id, u.disabledAt ? 'enable' : 'disable')}>{u.disabledAt ? t('admin.enable') : t('admin.disable')}</button>
                  <button type="button" onClick={() => act(u.id, 'reset-password')}>{t('admin.resetPassword')}</button>
                  {u.mfaEnabled && <button type="button" onClick={() => act(u.id, 'reset-mfa')}>{t('admin.resetMfa')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
    </>
  );
}

// ---------- departments, including the AYUSH setting ----------
export function AdminDepartments() {
  const { t } = useI18n();
  const [depts, load] = useLoad('/admin/departments', 'departments');
  const [name, setName] = useState('');
  const [ayush, setAyush] = useState(false);
  const [error, setError] = useState('');
  const add = async (e) => {
    e.preventDefault();
    setError('');
    const r = await api('/admin/departments', { method: 'POST', body: { name, ayush } });
    if (!r.ok) setError(r.body.error === 'name_taken' ? t('admin.error.name_taken') : t('admin.error.generic')); else { setName(''); load(); }
  };
  const toggle = async (d) => { await api(`/admin/departments/${d.id}`, { method: 'PUT', body: { ayush: !d.ayush } }); load(); };
  return (
    <section className="alerts-page">
      <h2>{t('admin.departments.title')}</h2>
      <form className="admin-form" onSubmit={add}>
        <label>{t('admin.field.department')}<input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></label>
        <label className="check"><input type="checkbox" checked={ayush} onChange={(e) => setAyush(e.target.checked)} /> {t('admin.ayush')}</label>
        <button type="submit" className="primary">{t('admin.create')}</button>
      </form>
      {error && <p role="alert" className="error">{error}</p>}
      <table className="queue-table">
        <thead><tr><th>{t('admin.field.department')}</th><th>{t('admin.ayush')}</th><th /></tr></thead>
        <tbody>{(depts ?? []).map((d) => (
          <tr key={d.id}><td>{d.name}</td><td>{d.ayush ? `✔ ${t('admin.yes')}` : t('admin.no')}</td><td><button type="button" onClick={() => toggle(d)}>{t('admin.toggleAyush')}</button></td></tr>
        ))}</tbody>
      </table>
      <p className="muted">{t('admin.ayushNote')}</p>
    </section>
  );
}

// ---------- the audit log (read only) ----------
export function AdminAudit() {
  const { t } = useI18n();
  const [actions] = useLoad('/admin/audit/actions', 'actions');
  const [filter, setFilter] = useState({ action: '', from: '' });
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState(null);
  const query = useCallback((before) => {
    const qs = new URLSearchParams({ limit: '50', ...(filter.action ? { action: filter.action } : {}), ...(filter.from ? { from: filter.from } : {}), ...(before ? { before } : {}) });
    return api(`/admin/audit?${qs}`);
  }, [filter]);
  useEffect(() => { query().then((r) => { if (r.ok) { setRows(r.body.entries); setNext(r.body.next); } }).catch(() => {}); }, [query]);
  const more = async () => { const r = await query(next); if (r.ok) { setRows([...rows, ...r.body.entries]); setNext(r.body.next); } };
  return (
    <section className="alerts-page">
      <h2>{t('admin.audit.title')}</h2>
      <div className="admin-form">
        <label>{t('admin.audit.action')}
          <select value={filter.action} onChange={(e) => setFilter({ ...filter, action: e.target.value })}><option value="">–</option>{(actions ?? []).map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </label>
        <label>{t('admin.audit.from')}<input type="date" value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} /></label>
      </div>
      <table className="queue-table">
        <thead><tr><th>{t('admin.audit.when')}</th><th>{t('admin.audit.action')}</th><th>{t('admin.audit.actor')}</th><th>{t('admin.audit.detail')}</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{new Date(r.at).toLocaleString()}</td><td>{r.action}</td><td>{r.actorType ?? '–'}</td><td className="small">{r.detail ? JSON.stringify(r.detail) : ''}</td></tr>
        ))}</tbody>
      </table>
      {next && <button type="button" onClick={more}>{t('admin.audit.more')}</button>}
    </section>
  );
}

// ---------- health and history ----------
export function AdminHealth() {
  const { t } = useI18n();
  const [ops] = useLoad('/admin/ops', null, 10000);
  if (!ops) return <section className="alerts-page"><h2>{t('admin.health.title')}</h2></section>;
  return (
    <section className="alerts-page">
      <h2>{t('admin.health.title')}: {MARK[ops.status]} {t(`admin.health.${ops.status}`)}</h2>
      <table className="queue-table">
        <thead><tr><th>{t('admin.health.component')}</th><th>{t('admin.field.status')}</th><th>{t('admin.audit.detail')}</th></tr></thead>
        <tbody>{Object.entries(ops.components).map(([name, c]) => (
          <tr key={name} className={c.status === 'down' ? 'row-alert' : ''}><td>{t(`admin.health.c.${name}`)}</td><td><strong>{MARK[c.status]} {t(`admin.health.${c.status}`)}</strong></td><td className="small">{JSON.stringify(c.detail)}</td></tr>
        ))}</tbody>
      </table>
      <h3>{t('admin.health.history')}</h3>
      <ul className="plain">{ops.events.slice(0, 15).map((e, i) => <li key={i}>{new Date(e.at).toLocaleString()} · {t(`admin.health.c.${e.component}`)} · {MARK[e.status]} {t(`admin.health.${e.status}`)}</li>)}</ul>
    </section>
  );
}

// ---------- reports (PRD Section 18, optional analytics) ----------
export function AdminReports() {
  const { t } = useI18n();
  const [m] = useLoad('/admin/metrics?days=30', null);
  const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
  if (!m) return <section className="alerts-page"><h2>{t('admin.reports.title')}</h2></section>;
  const rows = [
    ['admin.reports.sessions', `${m.sessions.submitted} / ${m.sessions.started}`],
    ['admin.reports.independent', pct(m.independentCompletion.rate)],
    ['admin.reports.intake', m.medianIntakeSeconds.value == null ? '–' : `${Math.round(m.medianIntakeSeconds.value)} s`],
    ['admin.reports.completeness', pct(m.historyCompleteness.meanQuestionsAnswered)],
    ['admin.reports.edits', pct(m.physicianEdits.amendedOrRejectedRate)],
    ['admin.reports.analysis', m.multiFileAnalysisMs.median == null ? '–' : `${(m.multiFileAnalysisMs.median / 1000).toFixed(1)} s`],
    ['admin.reports.consent', pct(m.consentIntegrity.rate)],
  ];
  return (
    <section className="alerts-page">
      <h2>{t('admin.reports.title')}</h2>
      <p className="muted">{t('admin.reports.note')}</p>
      <table className="queue-table"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{t(k)}</td><td><strong>{v}</strong></td></tr>)}</tbody></table>
    </section>
  );
}
