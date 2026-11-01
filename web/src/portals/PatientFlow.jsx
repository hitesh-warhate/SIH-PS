import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { LANGUAGES, useI18n } from '../i18n/index.jsx';
import Icon from '../components/Icon.jsx';
import IconButton from '../components/IconButton.jsx';
import { Choice, VoiceField } from '../components/Fields.jsx';
import { speech } from '../speech/speech.js';
import InterviewFlow from './InterviewFlow.jsx';
import DocumentsFlow from './DocumentsFlow.jsx';

const PURPOSES = [['history', 'consent.history'], ['documents', 'consent.documents'], ['his_sharing', 'consent.his'], ['abha_linking', 'consent.abha']];
const ROUTES = [['patientcase_id', 'lookup.patientcase'], ['abha', 'lookup.abha'], ['aadhaar', 'lookup.aadhaar'], ['mobile_otp', 'lookup.mobile']];
const EMPTY_FORM = { fullName: '', age: '', sex: '', address: '', emergencyContact: '', abhaId: '', registrationConsent: false };

// Patient journey, phase 1: language, identify or register, consent. One thing per screen; voice or touch.
export default function PatientFlow() {
  const { t, lang, setLang } = useI18n();
  const { refresh } = useAuth();
  const [step, setStep] = useState('language');
  const stack = useRef([]);
  const [voiceOn, setVoiceOn] = useState(false);
  const [mode, setMode] = useState('new'); // 'new' | 'returning'
  const [route, setRoute] = useState('patientcase_id');
  const [mobile, setMobile] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [token, setToken] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lookup, setLookup] = useState({ patientcaseId: '', dateOfBirth: '', abhaId: '', aadhaar: '' });
  const [candidates, setCandidates] = useState([]);
  const [people, setPeople] = useState([]);
  const [result, setResult] = useState(null);
  const [purposes, setPurposes] = useState({});
  const [message, setMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [helpMsg, setHelpMsg] = useState('');

  const go = useCallback((next) => { stack.current.push(step); setMessage(''); setHelpMsg(''); setStep(next); }, [step]);
  const back = () => { const prev = stack.current.pop(); if (prev) { setMessage(''); setStep(prev); } };

  // Resume after a page reload if a patient session already exists.
  // Audio confirmation of the submission, in the patient's own language (FR-C5).
  // On a shared terminal the next person must not meet the last person's session: after the confirmation the session is ended and the screen
  // returns to the start, by the Finish button or, if nobody touches it, after 90 seconds.
  const finishAndClear = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* the cookie is cleared by the next sign-in anyway */ }
    window.location.assign('/patient');
  }, []);
  useEffect(() => {
    if (step !== 'interview-done') return undefined;
    speech.speak(t('flow.done.audio'), lang);
    const timer = setTimeout(finishAndClear, 90_000);
    return () => clearTimeout(timer);
  }, [step, lang, t, finishAndClear]);

  // After submitting, the patient's own recap is written in the background; ask for it every 2 seconds for up to a minute.
  const [recap, setRecap] = useState(null);
  useEffect(() => {
    if (step !== 'interview-done') return undefined;
    let stop = false, tries = 0, timer;
    const poll = async () => {
      try {
        const r = await api('/patient/summary');
        if (stop) return;
        if (r.ok && r.body.status === 'ready') { setRecap(r.body); return; }
      } catch { /* try again */ }
      if (++tries < 30) timer = setTimeout(poll, 2000);
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [step]);

  useEffect(() => {
    api('/patient/me').then((r) => {
      if (!r.ok) return;
      setResult({ patientcaseId: r.body.patientcaseId });
      setLang(r.body.language);
      setStep(r.body.sessionState === 'active' ? 'interview' : 'consent');
    }).catch(() => {});
  }, [setLang]);

  // Audio guidance: speak each screen's prompt when listening is on (FR-A8 groundwork).
  const promptKey = { language: 'flow.language.title', choose: 'flow.choose.title', mobile: 'flow.mobile.title', otp: 'flow.otp.title',
    details: 'flow.details.title', duplicate: 'flow.dup.body', lookup: 'flow.lookup.title', consent: 'consent.intro', done: 'flow.done.title' }[step];
  useEffect(() => {
    if (voiceOn && promptKey) speech.speak(t(promptKey), lang);
    return () => speech.stopSpeaking();
  }, [voiceOn, promptKey, lang, t]);

  const send = async (path, body, method = 'POST') => {
    setBusy(true);
    setMessage('');
    try {
      return await api(path, { method, body });
    } catch {
      setMessage(t('signin.error.network'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const finishIdentity = async (body) => {
    setResult(body);
    await refresh();
    go('consent');
  };

  const sendOtp = async () => {
    const r = await send('/patient/otp/send', { mobile });
    if (!r) return;
    if (r.status === 429) { setMessage(t('flow.otp.tooMany')); return go('help'); }
    if (!r.ok) return setMessage(t('flow.error.invalid'));
    setChallenge(r.body);
    setCode('');
    go('otp');
  };

  const lookupBy = async (body) => {
    const r = await send('/patient/lookup', { ...body, language: lang });
    if (!r) return;
    if (r.status === 404) return setMessage(t('flow.lookup.notFound'));
    if (!r.ok) return setMessage(t('flow.error.invalid'));
    if (r.body.choose) { setPeople(r.body.choose); return go('pick'); }
    await finishIdentity(r.body);
  };

  const verifyOtp = async () => {
    const r = await send('/patient/otp/verify', { challengeId: challenge.challengeId, code });
    if (!r) return;
    if (r.status === 423) { setMessage(t('flow.otp.locked')); return go('help'); }
    if (r.status === 401) return setMessage(t('flow.otp.wrong', { n: r.body.attemptsLeft }));
    if (!r.ok) return setMessage(t('flow.otp.expired'));
    setToken(r.body.verificationToken);
    if (mode === 'new') go('details');
    else await lookupBy({ method: 'mobile_otp', verificationToken: r.body.verificationToken });
  };

  const register = async (duplicateDecision) => {
    const r = await send('/patient/register', {
      ...form, age: form.age === '' ? undefined : Number(form.age), mobile, language: lang, verificationToken: token,
      ...(duplicateDecision ? { duplicateDecision } : {}),
    });
    if (!r) return;
    if (r.status === 409) { setCandidates(r.body.candidates); return go('duplicate'); }
    if (r.status === 401) { setMessage(t('flow.otp.expired')); return go('mobile'); }
    if (!r.ok) return setMessage(t('flow.error.invalid'));
    await finishIdentity(r.body);
  };

  const submitConsent = async () => {
    const r = await send('/patient/consent', { purposes, language: lang });
    if (!r) return;
    if (!r.ok) return setMessage(t('flow.error.invalid'));
    go(r.body.closed ? 'ended' : 'interview');
  };

  const callHelp = async () => {
    const r = await send('/patient/help', { screen: step });
    if (r?.ok) setHelpMsg(t('interview.helpSent'));
  };

  const setField = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const nav = (
    <div className="flow-nav">
      {stack.current.length > 0 && !['done', 'ended', 'consent'].includes(step) && <IconButton name="back" onClick={back} />}
      <IconButton name="listen" state={voiceOn ? 'active' : 'off'} label={`${t('icon.listen')}: ${t(voiceOn ? 'state.on' : 'state.off')}`}
        onClick={() => setVoiceOn((v) => !v)} />
      <IconButton name="help" onClick={callHelp} />
    </div>
  );
  const note = message && <p role="alert" className="error big-note">{message}</p>;
  const next = (disabled, onClick) => (
    <button type="button" className="touch primary big" disabled={disabled || busy} onClick={onClick}><Icon name="next" size={28} /> {t('icon.next')}</button>
  );

  if (step === 'interview') {
    return <InterviewFlow onComplete={() => setStep('documents')} />;
  }
  if (step === 'documents') {
    // Finishing the papers submits the intake: the draft summary is prepared for the doctor. The patient hears and sees only a confirmation (FR-C5, FR-P5).
    const submit = async () => {
      setSubmitError('');
      try {
        const r = await api('/patient/submit', { method: 'POST' });
        if (r.ok) setStep('interview-done'); else setSubmitError(t('flow.submit.error'));
      } catch { setSubmitError(t('flow.submit.error')); }
    };
    return (
      <>
        <DocumentsFlow onComplete={submit} />
        {submitError && <p role="alert" className="error big-note">{submitError}</p>}
      </>
    );
  }

  return (
    <div className="flow">
      {step !== 'interview-done' && nav}
      {helpMsg && <p role="status" className="ok big-note">{helpMsg}</p>}
      {step === 'language' && (
        <section>
          <h1>{t('flow.language.title')}</h1>
          <div className="choices">
            {LANGUAGES.map((l) => <Choice key={l.code} selected={l.code === lang} onClick={() => { setLang(l.code); go('choose'); }}><Icon name="language" size={36} /> {l.label}</Choice>)}
          </div>
        </section>
      )}

      {step === 'choose' && (
        <section>
          <h1>{t('flow.choose.title')}</h1>
          <div className="choices">
            <Choice onClick={() => { setMode('new'); go('mobile'); }}>{t('flow.choose.new')}</Choice>
            <Choice onClick={() => { setMode('returning'); go('lookup'); }}>{t('flow.choose.returning')}</Choice>
          </div>
        </section>
      )}

      {step === 'lookup' && (
        <section>
          <h1>{t('flow.lookup.title')}</h1>
          <div className="choices">
            {ROUTES.map(([r, key]) => (
              <Choice key={r} onClick={() => { setRoute(r); if (r === 'mobile_otp') go('mobile'); else go('lookupForm'); }}>{t(`flow.${key}`)}</Choice>
            ))}
          </div>
        </section>
      )}

      {step === 'lookupForm' && (
        <section>
          <h1>{t(`flow.${ROUTES.find(([r]) => r === route)[1]}`)}</h1>
          {route === 'patientcase_id' && (
            <>
              <VoiceField label={t('flow.lookup.id')} value={lookup.patientcaseId} onChange={(v) => setLookup((l) => ({ ...l, patientcaseId: v.toUpperCase() }))} hint="PC-XXXX-XXXX" />
              <div className="field"><label>{t('flow.lookup.dob')}</label>
                <input type="date" value={lookup.dateOfBirth} onChange={(e) => setLookup((l) => ({ ...l, dateOfBirth: e.target.value }))} /></div>
            </>
          )}
          {route === 'abha' && <VoiceField label={t('flow.lookup.abha')} digits maxLength={14} value={lookup.abhaId} onChange={(v) => setLookup((l) => ({ ...l, abhaId: v }))} hint={t('flow.lookup.abhaHint')} />}
          {route === 'aadhaar' && <VoiceField label={t('flow.lookup.aadhaar')} digits maxLength={12} value={lookup.aadhaar} onChange={(v) => setLookup((l) => ({ ...l, aadhaar: v }))} hint={t('flow.lookup.aadhaarHint')} />}
          {note}
          {next(false, () => lookupBy({ method: route, ...lookup }))}
        </section>
      )}

      {step === 'mobile' && (
        <section>
          <h1>{t('flow.mobile.title')}</h1>
          <VoiceField label={t('flow.mobile.label')} digits maxLength={10} value={mobile} onChange={setMobile} hint={t('flow.mobile.hint')} />
          {note}
          {next(mobile.length !== 10, sendOtp)}
        </section>
      )}

      {step === 'otp' && (
        <section>
          <h1>{t('flow.otp.title')}</h1>
          <VoiceField label={t('flow.otp.label')} digits maxLength={6} value={code} onChange={setCode} />
          {import.meta.env.DEV && challenge?.devCode && <p className="dev-note">{t('flow.otp.devCode', { code: challenge.devCode })}</p>}
          {note}
          {next(code.length !== 6, verifyOtp)}
        </section>
      )}

      {step === 'pick' && (
        <section>
          <h1>{t('flow.lookup.choose')}</h1>
          <div className="choices">
            {people.map((p) => <Choice key={p.patientId} onClick={() => lookupBy({ method: 'mobile_otp', verificationToken: token, patientId: p.patientId })}>{p.maskedName}{p.ageYears != null && `, ${p.ageYears}`}</Choice>)}
          </div>
          {note}
        </section>
      )}

      {step === 'details' && (
        <section>
          <h1>{t('flow.details.title')}</h1>
          <VoiceField label={t('flow.name')} value={form.fullName} onChange={setField('fullName')} />
          <VoiceField label={t('flow.age')} digits maxLength={3} value={form.age} onChange={setField('age')} />
          <div className="field"><label>{t('flow.sex')}</label>
            <div className="choices">
              {['female', 'male', 'other'].map((s) => <Choice key={s} selected={form.sex === s} onClick={() => setField('sex')(s)}>{t(`sex.${s}`)}</Choice>)}
            </div>
          </div>
          <VoiceField label={t('flow.address')} value={form.address} onChange={setField('address')} />
          <VoiceField label={t('flow.emergency')} digits maxLength={10} value={form.emergencyContact} onChange={setField('emergencyContact')} />
          <VoiceField label={t('flow.abha')} digits maxLength={14} value={form.abhaId} onChange={setField('abhaId')} hint={t('flow.abhaHint')} />
          <Choice selected={form.registrationConsent} onClick={() => setField('registrationConsent')(!form.registrationConsent)}>
            {form.registrationConsent ? '✔ ' : '☐ '}{t('flow.regConsent')}
          </Choice>
          {note}
          {next(!form.fullName.trim() || !form.age || !form.sex || !form.registrationConsent, () => register())}
        </section>
      )}

      {step === 'duplicate' && (
        <section>
          <h1>{t('flow.dup.title')}</h1>
          <p className="lead">{t('flow.dup.body')}</p>
          {candidates.map((c) => (
            <div key={c.patientId} className="card-inline">
              <strong>{c.maskedName}{c.ageYears != null && `, ${c.ageYears}`}</strong> <small>…{c.patientcaseIdEnd}</small>
              <Choice onClick={() => register({ confirmExistingId: c.patientId })}>{t('flow.dup.thatsMe')}</Choice>
            </div>
          ))}
          <Choice onClick={() => register({ createNew: true })}>{t('flow.dup.notMe')}</Choice>
          {note}
        </section>
      )}

      {step === 'consent' && (
        <section>
          <h1>{t('flow.consent.title')}</h1>
          <p className="lead">{t('consent.intro')}</p>
          <p className="draft-note">{t('consent.draft')}</p>
          <IconButton name="listen" onClick={() => speech.speak([t('consent.intro'), ...PURPOSES.map(([, k]) => t(k))].join('. '), lang)} />
          {PURPOSES.map(([p, key]) => (
            <div key={p} className="consent-row">
              <p>{t(key)}</p>
              <div className="choices">
                <Choice variant="yes" selected={purposes[p] === true} onClick={() => setPurposes((s) => ({ ...s, [p]: true }))}>✔ {t('common.yes')}</Choice>
                <Choice variant="no" selected={purposes[p] === false} onClick={() => setPurposes((s) => ({ ...s, [p]: false }))}>✖ {t('common.no')}</Choice>
              </div>
            </div>
          ))}
          {note}
          {next(PURPOSES.some(([p]) => typeof purposes[p] !== 'boolean'), submitConsent)}
        </section>
      )}

      {(step === 'done' || step === 'interview-done') && (
        <section>
          <h1>{t('flow.done.title')}</h1>
          <p className="lead">{t('flow.done.id')}</p>
          <p className="bigid">{result?.patientcaseId}</p>
          <p>{t('flow.done.next')}</p>
          {step === 'interview-done' && (
            <div className="recap" aria-live="polite">
              <h2>{t('flow.recap.title')}</h2>
              {recap
                ? (
                  <>
                    <p className="recap-text">{recap.text}</p>
                    <p className="muted small">{recap.writtenBy === 'ai' ? t('flow.recap.byAi') : t('flow.recap.byRules')} {t('flow.recap.doctor')}</p>
                  </>
                )
                : <p className="muted">{t('flow.recap.pending')}</p>}
            </div>
          )}
          {step === 'interview-done' && <button type="button" className="touch primary big" onClick={finishAndClear}>{t('flow.done.finish')}</button>}
        </section>
      )}

      {step === 'ended' && (
        <section>
          <h1>{t('flow.consent.ended')}</h1>
        </section>
      )}

      {step === 'help' && (
        <section>
          <h1>{message || t('flow.otp.locked')}</h1>
          <Icon name="help" size={64} />
        </section>
      )}
    </div>
  );
}
