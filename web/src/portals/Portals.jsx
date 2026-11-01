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

function SignIn({ portal }) {
  const { t } = useI18n();
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needCode, setNeedCode] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const r = await login(username, password, code);
      if (!r.ok && r.body?.mfaRequired) { setNeedCode(true); setError(''); }
      else if (!r.ok) setError(t('signin.error.invalid'));
      else if (r.body.portal !== portal) setError(t('signin.error.wrongPortal'));
    } catch {
      setError(t('signin.error.network'));
    }
  };

  return (
    <form className="card signin" onSubmit={submit}>
      <h2>{t('signin.title')}: {t(`portal.${portal}`)}</h2>
      <label>{t('signin.username')}<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label>
      <label>{t('signin.password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      {needCode && <label>{t('signin.code')}<input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus required /></label>}
      {needCode && <p className="muted">{t('signin.codeHelp')}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" className="primary">{t('signin.submit')}</button>
    </form>
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
        {!session ? <SignIn portal={portal} /> : (
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
    <div className="shell">
      <header className="topbar">
        <span className="brand"><Brand />{t('app.name')}</span>
        <div className="spacer" />
        <LanguageSwitch />
        <AccessibilityToggles />
        <ThemeToggle />
      </header>
      <main className="landing">
        <h1>{t('app.tagline')}</h1>
        <h2>{t('landing.choose')}</h2>
        <div className="portal-cards">
          {['patient', 'staff', 'doctor', 'admin'].map((p) => (
            <Link key={p} to={`/${p}`} className={`touch portal-card portal-card-${p}`}>
              <strong>{t(`portal.${p}`)}</strong>
              <span>{t(`portal.${p}.desc`)}</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
