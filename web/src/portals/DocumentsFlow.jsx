import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadFile } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import Icon from '../components/Icon.jsx';
import IconButton from '../components/IconButton.jsx';
import { audioCue } from '../speech/speech.js';

const BUSY = ['waiting', 'reading'];

// Add several papers, see each one's status, and retake, remove or reorder before continuing (FR-B1, FR-B6).
// The patient sees status only: never what was read from the papers (FR-P5).
export default function DocumentsFlow({ onComplete }) {
  const { t } = useI18n();
  const [docs, setDocs] = useState(null);
  const [limits, setLimits] = useState(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const picker = useRef(null);
  const camera = useRef(null);
  const retakeInput = useRef(null);
  const retakeId = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api('/patient/documents');
      if (r.status === 403) { onComplete?.(); return; } // documents consent was not given: nothing to add
      if (r.ok) { setDocs(r.body.documents); setLimits(r.body.limits); }
    } catch { setMessage(t('docs.error.network')); }
  }, [onComplete, t]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while any file is still being read, so each one shows its result as soon as it is ready.
  useEffect(() => {
    if (!docs?.some((d) => BUSY.includes(d.status))) return undefined;
    const timer = setInterval(refresh, 1500);
    return () => clearInterval(timer);
  }, [docs, refresh]);

  const upload = async (files) => {
    setMessage('');
    setUploading(true);
    for (const file of files) {
      if (limits && file.size > limits.maxBytes) { setMessage(t('docs.error.too_large', { mb: Math.round(limits.maxBytes / 1048576) })); continue; }
      try {
        const r = await uploadFile('/patient/documents', file);
        if (!r.ok) setMessage(t(`docs.error.${r.body.error}`, { mb: limits ? Math.round(limits.maxBytes / 1048576) : '', max: r.body.maxFiles ?? r.body.maxPages ?? '' }));
      } catch { setMessage(t('docs.error.network')); }
    }
    setUploading(false);
    await refresh();
  };

  const retake = async (file) => {
    setMessage('');
    const r = await uploadFile(`/patient/documents/${retakeId.current}`, file, { method: 'PUT' });
    if (!r.ok) setMessage(t(`docs.error.${r.body.error}`, { mb: limits ? Math.round(limits.maxBytes / 1048576) : '', max: r.body.maxPages ?? '' }));
    await refresh();
  };

  const remove = async (id) => { audioCue(); await api(`/patient/documents/${id}`, { method: 'DELETE' }); await refresh(); };
  const move = async (index, by) => {
    const ids = docs.map((d) => d.id);
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    const r = await api('/patient/documents/order', { method: 'PUT', body: { ids } });
    if (r.ok) setDocs(r.body.documents);
  };

  if (!docs) return <p className="lead">{t('interview.loading')}</p>;
  const busy = docs.some((d) => BUSY.includes(d.status));
  const needsAttention = docs.some((d) => d.status === 'needs_attention');

  return (
    <div className="flow docs">
      <section>
        <h1>{t('docs.title')}</h1>
        <p className="lead">{t('docs.intro')}</p>

        <div className="controls">
          <button type="button" className="touch icon-button" disabled={uploading || docs.length >= (limits?.maxFiles ?? 15)} onClick={() => { audioCue(); picker.current.click(); }}>
            <Icon name="addfile" size={32} /><span>{t('icon.addfile')}</span>
          </button>
          <button type="button" className="touch icon-button" disabled={uploading || docs.length >= (limits?.maxFiles ?? 15)} onClick={() => { audioCue(); camera.current.click(); }}>
            <Icon name="addfile" size={32} /><span>{t('docs.takePhoto')}</span>
          </button>
        </div>
        <input ref={picker} type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
        <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
        <input ref={retakeInput} type="file" hidden accept="image/*,application/pdf" onChange={(e) => { if (e.target.files[0]) retake(e.target.files[0]); e.target.value = ''; }} />

        {limits && <p className="draft-note">{t('docs.count', { n: docs.length, max: limits.maxFiles })}</p>}
        {message && <p role="alert" className="error big-note">{message}</p>}
        {docs.length === 0 && <p>{t('docs.none')}</p>}

        {docs.map((d, i) => (
          <article key={d.id} className={`doc-card status-${d.status}`}>
            <header>
              <strong>{i + 1}. {d.name}</strong>
              <span className={`doc-status doc-status-${d.status}`}>
                {d.status === 'done' ? '✔ ' : d.status === 'needs_attention' ? '⚠ ' : '… '}{t(`docs.status.${d.status}`)}
              </span>
            </header>
            {BUSY.includes(d.status) && <progress max="100" value={d.progress} aria-label={t(`docs.status.${d.status}`)} />}
            {d.status === 'needs_attention' && <p className="error">{t(`docs.reason.${d.attentionReason}`)}</p>}
            <footer>
              <button type="button" className="touch" onClick={() => { retakeId.current = d.id; retakeInput.current.click(); }}>{t('docs.retake')}</button>
              <button type="button" className="touch" onClick={() => remove(d.id)}>✖ {t('docs.remove')}</button>
              <button type="button" className="touch" disabled={i === 0} aria-label={t('docs.moveUp')} onClick={() => move(i, -1)}>▲</button>
              <button type="button" className="touch" disabled={i === docs.length - 1} aria-label={t('docs.moveDown')} onClick={() => move(i, 1)}>▼</button>
            </footer>
          </article>
        ))}

        {busy && <p role="status" className="calm-box">{t('docs.wait')}</p>}
        {needsAttention && !busy && <p className="draft-note">{t('docs.attentionNote')}</p>}
        <div className="controls">
          <IconButton name="help" onClick={() => api('/patient/help', { method: 'POST', body: { screen: 'documents' } })} />
          <button type="button" className="touch primary big" disabled={busy || uploading} onClick={() => onComplete?.()}>
            <Icon name="next" size={28} /> {docs.length ? t('docs.next') : t('docs.skip')}
          </button>
        </div>
      </section>
    </div>
  );
}
