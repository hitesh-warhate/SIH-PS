import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';

const EMPTY = { fullName: '', age: '', sex: '', mobile: '', language: 'en', address: '', emergencyContact: '', abhaId: '', registrationConsent: false };

// Register a patient on their behalf (FR-R8): the same fields and the same duplicate check as the terminal.
export default function StaffRegister() {
  const { t } = useI18n();
  const [form, setForm] = useState(EMPTY);
  const [candidates, setCandidates] = useState([]);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(null);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (duplicateDecision) => {
    setMessage('');
    try {
      const r = await api('/staff/patients', {
        method: 'POST',
        body: { ...form, age: form.age === '' ? undefined : Number(form.age), ...(duplicateDecision ? { duplicateDecision } : {}) },
      });
      if (r.status === 409) { setCandidates(r.body.candidates); return; }
      if (!r.ok) { setMessage(t('flow.error.invalid')); return; }
      setCandidates([]);
      setDone(r.body);
      setForm(EMPTY);
    } catch {
      setMessage(t('signin.error.network'));
    }
  };

  return (
    <section className="card wide">
      <h2>{t('nav.staff.register')}</h2>
      {done && <p role="status" className="ok">{t('staff.register.done', { id: done.patientcaseId, name: done.fullName })}</p>}
      <form className="grid-form" onSubmit={(e) => { e.preventDefault(); setDone(null); submit(); }}>
        <label>{t('flow.name')}<input value={form.fullName} onChange={set('fullName')} required /></label>
        <label>{t('flow.age')}<input type="number" min="0" max="120" value={form.age} onChange={set('age')} required /></label>
        <label>{t('flow.sex')}
          <select value={form.sex} onChange={set('sex')} required>
            <option value="" />
            {['female', 'male', 'other'].map((s) => <option key={s} value={s}>{t(`sex.${s}`)}</option>)}
          </select>
        </label>
        <label>{t('flow.mobile.label')}<input inputMode="numeric" value={form.mobile} onChange={set('mobile')} required /></label>
        <label>{t('icon.language')}
          <select value={form.language} onChange={set('language')}>
            <option value="en">English</option><option value="hi">हिंदी</option><option value="mr">मराठी</option>
          </select>
        </label>
        <label>{t('flow.address')}<input value={form.address} onChange={set('address')} /></label>
        <label>{t('flow.emergency')}<input inputMode="numeric" value={form.emergencyContact} onChange={set('emergencyContact')} /></label>
        <label>{t('flow.abha')}<input inputMode="numeric" value={form.abhaId} onChange={set('abhaId')} /></label>
        <label className="check"><input type="checkbox" checked={form.registrationConsent} onChange={set('registrationConsent')} /> {t('staff.register.consent')}</label>
        {message && <p role="alert" className="error">{message}</p>}
        <button type="submit" className="primary" disabled={!form.registrationConsent}>{t('staff.register.submit')}</button>
      </form>

      {candidates.length > 0 && (
        <div className="dupes" role="alert">
          <h3>{t('staff.dup.title')}</h3>
          {candidates.map((c) => (
            <p key={c.patientId}>
              <strong>{c.fullName}</strong>, {c.ageYears} · {c.patientcaseId} · {c.sameMobile ? t('staff.dup.sameMobile') : t('staff.dup.sameName')}
              {' '}<button type="button" onClick={() => submit({ confirmExistingId: c.patientId })}>{t('staff.dup.use')}</button>
            </p>
          ))}
          <button type="button" onClick={() => submit({ createNew: true })}>{t('staff.dup.createNew')}</button>
        </div>
      )}
    </section>
  );
}
