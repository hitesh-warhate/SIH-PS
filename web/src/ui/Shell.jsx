import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { openAlerts } from '../alertState.js';
import { AccessibilityToggles, ThemeToggle } from '../components/Controls.jsx';
import Brand from '../components/Brand.jsx';
import { LANGUAGES, useI18n } from '../i18n/index.jsx';
import { useAlertStream } from '../useAlertStream.js';

const IDX = { en: 0, hi: 1, mr: 2 };
const initials = (name = '') => name.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

function Svg({ d, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={d} fill="currentColor" /></svg>;
}
const PATHS = {
  search: 'M10 2a8 8 0 105.300 14l4.400 4.400 1.400-1.400-4.400-4.400A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  bell: 'M12 22a2.500 2.500 0 002.400-2h-4.800A2.500 2.500 0 0012 22zm7-6V11a7 7 0 00-5.500-6.800V3.500a1.500 1.500 0 00-3 0v.7A7 7 0 005 11v5l-2 2v1h18v-1z',
  chevron: 'M7 10l5 5 5-5z',
  exit: 'M10 3h8a2 2 0 012 2v14a2 2 0 01-2 2h-8v-2h8V5h-8zm-1 4l-5 5 5 5v-4h8v-2H9z',
  gear: 'M12 8a4 4 0 100 8 4 4 0 000-8zm9 5v-2l-2.300-.5a7 7 0 00-.8-1.900l1.300-2-1.400-1.400-2 1.300a7 7 0 00-1.900-.8L13 3h-2l-.5 2.300a7 7 0 00-1.900.8l-2-1.300-1.400 1.400 1.300 2a7 7 0 00-.8 1.900L3 11v2l2.300.5a7 7 0 00.8 1.900l-1.300 2 1.400 1.400 2-1.300a7 7 0 001.900.8L11 21h2l.5-2.300a7 7 0 001.900-.8l2 1.300 1.400-1.400-1.300-2a7 7 0 00.8-1.900z',
  help: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 16h-2v-2h2zm1.800-6.900l-.9.900c-.7.700-.9 1.100-.9 2h-2v-.5c0-1 .3-1.800.9-2.400l1.200-1.200c.4-.3.600-.8.600-1.300a2 2 0 00-4 0H7a4 4 0 118 0c0 .8-.3 1.600-.2 2.500z',
};

// One small picture per menu entry, so each section can be found without reading every label.
const NAV_ICONS = {
  dashboard: 'M3 3h8v8H3zm10 0h8v5h-8zM3 13h8v8H3zm10-3h8v11h-8z',
  alerts: 'M12 2l10 18H2zm-1 7v5h2V9zm0 7v2h2v-2z',
  queue: 'M4 5h16v2H4zm0 6h16v2H4zm0 6h10v2H4z',
  register: 'M15 12a4 4 0 100-8 4 4 0 000 8zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2zm9 4c-2.700 0-8 1.300-8 4v2h16v-2c0-2.700-5.300-4-8-4z',
  deliveries: 'M3 4h13v10H3zm13 4h3l2 3v3h-5zM6.500 15a2 2 0 110 4 2 2 0 010-4zm11 0a2 2 0 110 4 2 2 0 010-4z',
  workspace: 'M7 3v6a4 4 0 008 0V3h-2v6a2 2 0 01-4 0V3zm4 10.900V16a5 5 0 0010 0v-2.200a2.500 2.500 0 10-2 0V16a3 3 0 01-6 0v-2.100z',
  accounts: 'M9 12a4 4 0 100-8 4 4 0 000 8zm8 0a3 3 0 100-6 3 3 0 000 6zM1 20c0-3.300 3.600-6 8-6s8 2.700 8 6zm16.500-5.900C20.500 14.500 23 16.500 23 20h-4.500c0-2.300-.4-4.300-1-5.900z',
  departments: 'M3 21V7l9-4 9 4v14h-7v-6h-4v6zm6-11h2v2H9zm4 0h2v2h-2z',
  audit: 'M6 2h9l5 5v15H6zm8 1.500V8h4.500zM8 12h8v2H8zm0 4h8v2H8z',
  health: 'M3 13h4l2-5 4 10 2-5h6v-2h-4.700L14 4l-4 10-1.700-4H3z',
  reports: 'M4 20V10h3v10zm6 0V4h3v16zm6 0v-7h3v7z',
};

// Closes a popover on a click outside it or on Escape.
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return { open, setOpen, ref };
}

// ---------- search: patients waiting (staff, doctor) or accounts (admin); Ctrl or Cmd with K or Space focuses it ----------
function SearchBox({ portal }) {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const input = useRef(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.code === 'Space')) { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return undefined; }
    const timer = setTimeout(() => api(`/dashboard/search?q=${encodeURIComponent(q)}`).then((r) => { if (r.ok) { setResults(r.body.results); setActive(0); } }).catch(() => {}), 180);
    return () => clearTimeout(timer);
  }, [q]);

  const go = (r) => {
    setQ(''); setResults([]); input.current?.blur();
    if (r.kind === 'patient') navigate(portal === 'doctor' ? `/doctor/workspace?encounter=${r.id}` : '/staff/queue');
    else navigate('/admin/accounts');
  };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && results[active]) go(results[active]);
    else if (e.key === 'Escape') { setQ(''); input.current?.blur(); }
  };
  return (
    <div className="search">
      <Svg d={PATHS.search} />
      <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onFocus={() => setFocused(true)} onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder={t(portal === 'admin' ? 'search.placeholderAdmin' : 'search.placeholder')} aria-label={t('search.label')} role="combobox" aria-expanded={focused && q.trim() !== ''} aria-controls="search-results" />
      <kbd className="search-key" aria-hidden="true">{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
      {focused && q.trim() && (
        <ul className="search-results" id="search-results" role="listbox">
          {results.length === 0 && <li className="muted">{t('search.none')}</li>}
          {results.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active} className={i === active ? 'is-active' : ''} onMouseDown={() => go(r)}>
              <span className="avatar sm" aria-hidden="true">{initials(r.title)}</span>
              <span className="grow"><strong>{r.title}</strong><small>{r.kind === 'patient' ? `${r.token != null ? t('analysis.token', { n: r.token }) : '–'} · ${r.complaint ? r.complaint[IDX[lang]] : '–'}` : r.sub}</small></span>
              {r.alerts > 0 && <span className="pill alert">⚠ {r.alerts}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- notifications: open alerts for staff and doctors, components needing attention for admins ----------
function BellView({ items }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="popwrap" ref={ref}>
      <button type="button" className="icon-btn" aria-label={t('bell.title')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Svg d={PATHS.bell} />
        {items.length > 0 && <span className="badge-dot" aria-label={String(items.length)}>{items.length}</span>}
      </button>
      {open && (
        <div className="popover bell-pop" role="dialog" aria-label={t('bell.title')}>
          <h3>{t('bell.title')}</h3>
          {items.length === 0 && <p className="muted">{t('bell.none')}</p>}
          <ul>{items.slice(0, 6).map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => { setOpen(false); navigate(i.to); }}><strong>{i.level === 'emergency' ? '‼ ' : ''}{i.title}</strong><small>{i.sub}</small></button>
            </li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

function AlertBell({ portal }) {
  const { t, lang } = useI18n();
  const stream = useAlertStream(portal);
  const items = useMemo(() => openAlerts(stream.alerts).map((a) => ({
    id: a.id, title: `${a.token != null ? t('analysis.token', { n: a.token }) : '–'} · ${a.patientName}`, sub: a.reason[IDX[lang]],
    to: portal === 'doctor' ? `/doctor/workspace?encounter=${a.encounterId}` : '/staff/alerts', level: a.level,
  })), [stream.alerts, lang, t, portal]);
  return <BellView items={items} />;
}

function OpsBell() {
  const { t } = useI18n();
  const [ops, setOps] = useState(null);
  useEffect(() => {
    const load = () => api('/admin/ops').then((r) => { if (r.ok) setOps(r.body); }).catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);
  const items = Object.entries(ops?.components ?? {}).filter(([, c]) => c.status !== 'ok').map(([k, c]) => ({ id: k, title: t(`admin.health.c.${k}`), sub: t(`admin.health.${c.status}`), to: '/admin/health' }));
  return <BellView items={items} />;
}

const Bell = ({ portal }) => (portal === 'admin' ? <OpsBell /> : <AlertBell portal={portal} />);

// ---------- the signed-in person: language, accessibility, sign out ----------
function UserMenu({ portal, onHelp }) {
  const { t, lang, setLang } = useI18n();
  const { session, logout } = useAuth();
  const { open, setOpen, ref } = usePopover();
  return (
    <div className="popwrap" ref={ref}>
      <button type="button" className="user-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">{initials(session.name)}</span>
        <span className="who"><strong>{session.name}</strong><small>{t(`portal.${session.portal ?? portal}`)}</small></span>
        <Svg d={PATHS.chevron} />
      </button>
      {open && (
        <div className="popover user-pop" role="menu">
          <h3>{t('user.settings')}</h3>
          <div className="lang-row" role="group" aria-label={t('icon.language')}>
            {LANGUAGES.map((l) => <button key={l.code} type="button" className={l.code === lang ? 'is-active' : ''} aria-pressed={l.code === lang} onClick={() => setLang(l.code)}>{l.label}</button>)}
          </div>
          <AccessibilityToggles />
          <button type="button" className="menu-item" onClick={() => { setOpen(false); onHelp(); }}><Svg d={PATHS.help} size={18} /> {t('nav.help')}</button>
          <button type="button" className="menu-item danger" onClick={logout}><Svg d={PATHS.exit} size={18} /> {t('nav.signOut')}</button>
        </div>
      )}
    </div>
  );
}

function HelpDialog({ onClose }) {
  const { t } = useI18n();
  const ok = useRef(null);
  useEffect(() => { ok.current?.focus(); const esc = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, [onClose]);
  const mod = isMac ? '⌘' : 'Ctrl';
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t('help.title')} onMouseDown={(e) => e.stopPropagation()}>
        <h2>{t('help.title')}</h2>
        <h3>{t('help.shortcuts')}</h3>
        <dl className="shortcuts">
          <dt><kbd>{mod}</kbd> <kbd>K</kbd></dt><dd>{t('help.k.search')}</dd>
          <dt><kbd>J</kbd> <kbd>K</kbd></dt><dd>{t('help.k.next')}</dd>
          <dt><kbd>1</kbd>–<kbd>6</kbd></dt><dd>{t('help.k.tabs')}</dd>
          <dt><kbd>O</kbd></dt><dd>{t('help.k.open')}</dd>
          <dt><kbd>A</kbd></dt><dd>{t('help.k.accept')}</dd>
        </dl>
        <p>{t('help.support')}</p>
        <button type="button" className="primary" ref={ok} onClick={onClose}>{t('help.close')}</button>
      </div>
    </div>
  );
}

// ---------- the frame: dark sidebar, a top bar and the page ----------
export function AppShell({ portal, items, banner = null, children }) {
  const { t } = useI18n();
  const { session, logout } = useAuth();
  const [help, setHelp] = useState(false);
  const closeHelp = useCallback(() => setHelp(false), []);
  const main = items.filter((i) => i[4] !== 'more');
  const more = items.filter((i) => i[4] === 'more');
  const link = ([path, key]) => <NavLink key={path} to={`/${portal}/${path}`} end>{NAV_ICONS[path] && <Svg d={NAV_ICONS[path]} size={18} />}{t(key)}</NavLink>;
  return (
    <div className={`shell2 shell-${portal}`}>
      <nav className="nav" aria-label={t(`portal.${portal}`)}>
        <Link to="/" className="brand"><Brand size={34} />{t('app.name')}</Link>
        <span className="nav-label">{t('nav.label')}</span>
        {main.map(link)}
        {more.length > 0 && <span className="nav-label">{t('nav.more')}</span>}
        {more.map(link)}
        <span className="grow" />
        <button type="button" className="nav-btn" onClick={() => setHelp(true)}><Svg d={PATHS.help} size={18} /> {t('nav.help')}</button>
        <div className="nav-user">
          <span className="avatar" aria-hidden="true">{initials(session.name)}</span>
          <span className="who"><strong>{session.name}</strong><small>{t(`portal.${session.portal ?? portal}`)}</small></span>
          <button type="button" className="icon-btn on-dark" aria-label={t('nav.signOut')} title={t('nav.signOut')} onClick={logout}><Svg d={PATHS.exit} /></button>
        </div>
      </nav>
      <div className="main2">
        <header className="top">
          <SearchBox portal={portal} />
          <span className="grow" />
          <ThemeToggle />
          <Bell portal={portal} />
          <UserMenu portal={portal} onHelp={() => setHelp(true)} />
        </header>
        <main className="content">
          {banner}
          {children ?? (
            <Routes>
              <Route index element={<Navigate to={items[0][0]} replace />} />
              {items.map(([path, , , element]) => <Route key={path} path={path} element={element} />)}
            </Routes>
          )}
        </main>
      </div>
      {help && <HelpDialog onClose={closeHelp} />}
    </div>
  );
}
