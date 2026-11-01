import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n/index.jsx';
import { AccessibilityToggles, LanguageSwitch, ThemeToggle } from '../components/Controls.jsx';
import Brand from '../components/Brand.jsx';
import Dashboard from './Dashboard.jsx';
import { AppShell } from '../ui/Shell.jsx';
import PatientFlow from './PatientFlow.jsx';
import StaffRegister from './StaffRegister.jsx';
import DoctorWorkspace from './DoctorWorkspace.jsx';
import StaffDeliveries from './StaffDeliveries.jsx';
import { AdminAccounts, AdminAudit, AdminDepartments, AdminHealth, AdminReports } from './AdminConsole.jsx';
import { DoctorBanner, StaffAlerts, StaffQueue } from './Alerts.jsx';

function Placeholder({ phase }) {
  const { t } = useI18n();
  return (
    <section className="card">
      <h2>{t('placeholder.title')}</h2>
      <p>{t('placeholder.body', { phase })}</p>
    </section>
  );
}

// Simple line glyphs for the landing page and the sign-in panel.
const GLYPHS = {
  patient: 'M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 2c-4.400 0-8 2.200-8 5.500V21h16v-1.500c0-3.300-3.600-5.500-8-5.500z',
  staff: 'M4 4h16v12H4zm2 2v8h12V6zm-2 12h16v2H4zm5-9h6v2H9z',
  doctor: 'M7 3v6a4 4 0 008 0V3h-2v6a2 2 0 01-4 0V3zm4 10.900V16a5 5 0 0010 0v-2.200a2.500 2.500 0 10-2 0V16a3 3 0 01-6 0v-2.100z',
  admin: 'M12 2l8 3v6c0 5-3.400 9.400-8 11-4.600-1.600-8-6-8-11V5zm0 4a3 3 0 100 6 3 3 0 000-6zm-4.500 9.500c1 1.600 2.600 2.900 4.500 3.600 1.900-.7 3.500-2 4.500-3.600-1.200-1-2.800-1.500-4.500-1.500s-3.300.5-4.500 1.500z',
  voice: 'M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.900V21h2v-2.100A7 7 0 0019 12z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
  doc: 'M6 2h8l6 6v14H6zm7 1.500V9h5.500zM8 13h8v2H8zm0 4h6v2H8z',
  spark: 'M12 2l1.800 5.200L19 9l-5.200 1.800L12 16l-1.800-5.200L5 9l5.200-1.800zM19 14l.9 2.100L22 17l-2.100.9L19 20l-.9-2.100L16 17l2.100-.9z',
  arrow: 'M13 5l7 7-7 7-1.400-1.400 4.600-4.600H4v-2h12.200l-4.600-4.600z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9c0-4 3.600-6 8-6s8 2 8 6z',
  lock: 'M7 10V7a5 5 0 0110 0v3h1a1 1 0 011 1v10a1 1 0 01-1 1H6a1 1 0 01-1-1V11a1 1 0 011-1zm2 0h6V7a3 3 0 00-6 0zm3 4a1.500 1.500 0 00-1 2.600V19h2v-2.400a1.500 1.500 0 00-1-2.600z',
  eye: 'M12 5c5 0 9 4.500 10 7-1 2.500-5 7-10 7S3 14.500 2 12c1-2.500 5-7 10-7zm0 3a4 4 0 100 8 4 4 0 000-8zm0 2a2 2 0 110 4 2 2 0 010-4z',
  shield: 'M12 2l8 3v6c0 5-3.400 9.400-8 11-4.600-1.600-8-6-8-11V5zm-1 13.400l5.700-5.700-1.400-1.400L11 12.600 8.700 10.300 7.300 11.700z',
};
export function Glyph({ name, size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={GLYPHS[name]} fill="currentColor" /></svg>;
}

const FEATURES = [['voice', 'landing.f1'], ['bolt', 'landing.f2'], ['doc', 'landing.f3'], ['spark', 'landing.f4']];

function SignIn({ portal }) {
  const { t } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await login(username, password, code);
      if (!r.ok && r.body?.mfaRequired) { setNeedCode(true); setError(''); }
      else if (r.status === 429) setError(t('signin.error.locked'));
      else if (!r.ok) setError(t('signin.error.invalid'));
      else if (r.body.portal !== portal) setError(t('signin.error.wrongPortal'));
    } catch {
      setError(t('signin.error.network'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`auth auth-${portal}`}>
      <aside className="auth-side">
        <span className="auth-badge"><Glyph name={portal} size={30} /></span>
        <h2>{t(`portal.${portal}`)}</h2>
        <p>{t(`portal.${portal}.desc`)}</p>
        <ul>
          {FEATURES.slice(1).map(([icon, key]) => (
            <li key={key}><Glyph name={icon} size={18} /><span>{t(`${key}.title`)}</span></li>
          ))}
        </ul>
        <div className="auth-ecg" aria-hidden="true"><svg viewBox="0 0 300 60" preserveAspectRatio="none"><path d="M0 30h80l10-18 14 40 12-30 8 8h176" /></svg></div>
      </aside>
      <form className="auth-form" onSubmit={submit}>
        <h1>{t('signin.welcome')}</h1>
        <p className="muted">{t('signin.lead', { portal: t(`portal.${portal}`) })}</p>
        <label className="fld">
          <span>{t('signin.username')}</span>
          <span className="fld-box"><Glyph name="user" size={18} /><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus required /></span>
        </label>
        <label className="fld">
          <span>{t('signin.password')}</span>
          <span className="fld-box">
            <Glyph name="lock" size={18} />
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button type="button" className="fld-eye" aria-pressed={show} onClick={() => setShow((s) => !s)}>{t(show ? 'signin.hide' : 'signin.show')}</button>
          </span>
        </label>
        {needCode && (
          <label className="fld">
            <span>{t('signin.code')}</span>
            <span className="fld-box"><Glyph name="shield" size={18} /><input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required /></span>
            <small className="muted">{t('signin.codeHelp')}</small>
          </label>
        )}
        {error && <p role="alert" className="error auth-error">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null}{busy ? t('signin.busy') : t('signin.submit')}
        </button>
        <p className="auth-foot"><Glyph name="shield" size={16} />{t('landing.privacy')}</p>
      </form>
    </div>
  );
}

const initials = (name = '') => name.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?)\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

// The page's top card: language, accessibility, light or dark, and who is signed in with the way out.
function Header({ portal, withBrand = true }) {
  const { t } = useI18n();
  const { session, logout } = useAuth();
  return (
    <header className={`topbar topbar-${portal}`}>
      {withBrand && <Link to="/" className="brand"><Brand />{t('app.name')}</Link>}
      <span className="portal-name">{t(`portal.${portal}`)}</span>
      <div className="spacer" />
      <LanguageSwitch />
      <AccessibilityToggles />
      <ThemeToggle />
      {session && (
        <div className="user-chip">
          <span className="avatar" aria-hidden="true">{initials(session.name)}</span>
          <span className="who"><strong>{session.name}</strong><small>{t(`portal.${session.portal ?? portal}`)}</small></span>
          <button type="button" onClick={logout}>{t('nav.signOut')}</button>
        </div>
      )}
    </header>
  );
}

// Layout shared by the staff, doctor and admin portals: signed out or in the wrong portal it is a simple page; signed in it is the full app shell.
function DeskShell({ portal, items, banner = null }) {
  const { t } = useI18n();
  const { session } = useAuth();
  if (session === undefined) return <div className={`shell shell-${portal}`}><Header portal={portal} /></div>;
  if (!session || session.portal !== portal) {
    return (
      <div className={`shell shell-${portal}`}>
        <Header portal={portal} />
        {!session ? <main className="auth-wrap"><SignIn portal={portal} /></main> : (
          <section className="card">
            <p role="alert">{t('access.denied')}</p>
            {session.portal && <Link to={`/${session.portal}`}>{t(`portal.${session.portal}`)}</Link>}
          </section>
        )}
      </div>
    );
  }
  const all = [['dashboard', 'nav.dashboard', 0, <Dashboard key="dash" portal={portal} />], ...items].map(([path, key, phase, element, group]) => [path, key, phase, element ?? <Placeholder phase={phase} />, group]);
  return <AppShell portal={portal} items={all} banner={banner} />;
}

export const StaffPortal = () => (
  <DeskShell portal="staff" items={[
    ['alerts', 'nav.staff.alerts', 3, <StaffAlerts key="alerts" />], ['queue', 'nav.staff.queue', 3, <StaffQueue key="queue" />], ['register', 'nav.staff.register', 1, <StaffRegister key="register" />],
    ['deliveries', 'nav.staff.deliveries', 8, <StaffDeliveries key="deliveries" />, 'more'], ['assist', 'nav.staff.assist', 3, undefined, 'more'], ['terminals', 'nav.staff.terminals', 10, undefined, 'more'],
  ]} />
);

export const DoctorPortal = () => (
  <DeskShell portal="doctor" items={[['workspace', 'nav.doctor.workspace', 6, <DoctorWorkspace key="workspace" />]]} banner={<DoctorBanner />} />
);

export const AdminPortal = () => (
  <DeskShell portal="admin" items={[
    ['accounts', 'nav.admin.accounts', 10, <AdminAccounts key="a" />], ['departments', 'nav.admin.departments', 10, <AdminDepartments key="d" />],
    ['audit', 'nav.admin.audit', 10, <AdminAudit key="u" />, 'more'], ['health', 'nav.admin.health', 10, <AdminHealth key="h" />, 'more'], ['reports', 'nav.admin.reports', 10, <AdminReports key="r" />, 'more'],
  ]} />
);

// Large-touch, one-thing-at-a-time layout. The flow itself is the sign-in: registering or being found creates the patient session.
export function PatientPortal() {
  return (
    <div className="shell shell-patient">
      <Header portal="patient" />
      <main className="patient-main">
        <PatientFlow />
      </main>
    </div>
  );
}
export function Landing() {
  const { t } = useI18n();
  return (
    <div className="land">
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
      <header className="topbar land-top">
        <span className="brand"><Brand />{t('app.name')}</span>
        <div className="spacer" />
        <LanguageSwitch />
        <AccessibilityToggles />
        <ThemeToggle />
      </header>

      <main className="land-main">
        <section className="land-hero">
          <div className="land-copy">
            <span className="eyebrow"><span className="live-dot" aria-hidden="true" />{t('landing.eyebrow')}</span>
            <h1>{t('app.tagline')}</h1>
            <p className="land-lead">{t('landing.sub')}</p>
            <div className="land-ctas">
              <Link to="/patient" className="btn btn-primary btn-lg">{t('landing.cta')}<Glyph name="arrow" size={20} /></Link>
              <Link to="/doctor" className="btn btn-ghost btn-lg">{t('landing.staffCta')}</Link>
            </div>
            <p className="land-trust"><Glyph name="shield" size={18} />{t('landing.privacy')}</p>
          </div>

          <div className="land-visual" aria-hidden="true">
            <div className="orb">
              <div className="orb-ring" /><div className="orb-ring r2" /><div className="orb-ring r3" />
              <div className="orb-core"><Brand size={72} /></div>
              <svg className="orb-ecg" viewBox="0 0 400 80" preserveAspectRatio="none"><path d="M0 40h120l14-26 18 54 16-40 10 12h222" /></svg>
            </div>
            {FEATURES.slice(0, 3).map(([icon, key], i) => (
              <div key={key} className={`float-chip fc-${i}`}><span className="fc-ico"><Glyph name={icon} size={18} /></span>{t(`${key}.title`)}</div>
            ))}
          </div>
        </section>

        <section className="land-portals" aria-labelledby="choose">
          <h2 id="choose">{t('landing.choose')}</h2>
          <div className="pcards">
            {['patient', 'staff', 'doctor', 'admin'].map((p, i) => (
              <Link key={p} to={`/${p}`} className={`touch pcard pcard-${p}`} style={{ '--i': i }}>
                <span className="pcard-ico"><Glyph name={p} size={28} /></span>
                <strong>{t(`portal.${p}`)}</strong>
                <span className="pcard-desc">{t(`portal.${p}.desc`)}</span>
                <span className="pcard-go">{t('landing.open')}<Glyph name="arrow" size={18} /></span>
              </Link>
            ))}
          </div>
        </section>

        <section className="land-features">
          {FEATURES.map(([icon, key]) => (
            <article key={key} className="feat">
              <span className="feat-ico"><Glyph name={icon} size={22} /></span>
              <h3>{t(`${key}.title`)}</h3>
              <p>{t(`${key}.body`)}</p>
            </article>
          ))}
        </section>
      </main>
      <footer className="land-foot">© PatientCase_AI · SIH 26047</footer>
    </div>
  );
}
