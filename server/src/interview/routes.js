import express from 'express';
import { audit, LANGS } from '../patients.js';
import {
  activeQuestions, getQuestion, nextQuestion, presentQuestion, reviewList, staleKeys, structuredHistory, validateAnswer,
} from './dialogue.js';

export const LISTENING_MODES = ['listen_speak', 'listen_tap', 'read_tap'];
export const RECOGNITION_OFFER_TAP_AFTER = 2; // failed recognitions before tapping is offered
export const RECOGNITION_ALERT_AFTER = 3;     // a further failure alerts staff

// Mounted under /api/patient/interview behind the session and history-consent guards, so every route here is consent-checked.
export function createInterviewRouter({ pool, redFlags, narration, help, analysis }) {
  const router = express.Router();
  const bad = (res, fields) => res.status(400).json({ error: 'invalid_input', fields });
  const langOf = (req) => (LANGS.includes(req.query.lang) ? req.query.lang : req.pSession.language);

  async function loadAnswers(encounterId) {
    const { rows } = await pool.query('SELECT question_key, answer, modality, confidence, confirmed FROM interview_responses WHERE encounter_id = $1', [encounterId]);
    return Object.fromEntries(rows.map((r) => [r.question_key, { ...r.answer, modality: r.modality, confidence: r.confidence, confirmed: r.confirmed }]));
  }
  // AYUSH mode (Phase 7) adds the AYUSH questions after the standard ones; it is set per encounter by the department or by staff.
  const modeOf = async (encounterId) => ({ ayush: (await pool.query('SELECT ayush_mode FROM encounters WHERE id = $1', [encounterId])).rows[0].ayush_mode });
  const helpRequest = (patientId, reason, detail) => help.create(patientId, reason, detail);

  router.get('/state', async (req, res) => {
    const { rows: [e] } = await pool.query('SELECT listening_mode FROM encounters WHERE id = $1', [req.pSession.encounter_id]);
    const mode = await modeOf(req.pSession.encounter_id);
    const { answered, total, question } = nextQuestion(await loadAnswers(req.pSession.encounter_id), mode);
    // The patient only learns that staff know, never why (FR-P5): a bare yes or no, no level and no clinical wording.
    const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM alerts WHERE encounter_id = $1', [req.pSession.encounter_id]);
    res.json({ listeningMode: e.listening_mode, language: req.pSession.language, progress: { answered, total }, done: !question, staffNotified: n > 0, ayush: mode.ayush });
  });

  // The mode applies from the next question; the client shows it from then on (FR-A9, FR-A11).
  router.put('/listening-mode', async (req, res) => {
    if (!LISTENING_MODES.includes(req.body?.mode)) return bad(res, ['mode']);
    await pool.query('UPDATE encounters SET listening_mode = $2 WHERE id = $1', [req.pSession.encounter_id, req.body.mode]);
    await audit(pool, { actorType: 'patient', actorId: req.user.sub, action: 'listening_mode_set', objectType: 'encounter', objectId: req.pSession.encounter_id, detail: { mode: req.body.mode } });
    res.json({ listeningMode: req.body.mode });
  });

  router.get('/next', async (req, res) => {
    const { question, answered, total } = nextQuestion(await loadAnswers(req.pSession.encounter_id), await modeOf(req.pSession.encounter_id));
    const { rows: [e] } = await pool.query('SELECT listening_mode FROM encounters WHERE id = $1', [req.pSession.encounter_id]);
    res.json({ done: !question, question: question ? presentQuestion(question, langOf(req)) : null, listeningMode: e.listening_mode, progress: { answered, total } });
  });

  // Fetch one reachable question with its current answer, so the patient can correct it from the review screen.
  router.get('/question/:key', async (req, res) => {
    const answers = await loadAnswers(req.pSession.encounter_id);
    const q = activeQuestions(answers, await modeOf(req.pSession.encounter_id)).find((x) => x.key === req.params.key);
    if (!q) return res.status(404).json({ error: 'not_found' });
    const a = answers[q.key];
    res.json({ question: presentQuestion(q, langOf(req)), current: a ? (a.skipped ? { skipped: true } : { value: a.value }) : null });
  });

  router.post('/answer', async (req, res) => {
    const { questionKey, value, skipped, modality, confidence, transcript, confirmation } = req.body ?? {};
    const q = getQuestion(questionKey);
    const answers = await loadAnswers(req.pSession.encounter_id);
    // Constrained by the ontology: only a question that is reachable from the earlier answers can be answered.
    const mode = await modeOf(req.pSession.encounter_id);
    if (!q || !activeQuestions(answers, mode).some((x) => x.key === q.key)) return res.status(422).json({ error: 'question_not_available' });
    if (!['voice', 'tap'].includes(modality)) return bad(res, ['modality']);
    if (confidence != null && !(typeof confidence === 'number' && confidence >= 0 && confidence <= 1)) return bad(res, ['confidence']);

    let stored;
    let confirmed = true;
    if (skipped === true) {
      stored = { skipped: true }; // recorded as "not answered", never as "no"
      confirmed = false;
    } else {
      if (!validateAnswer(q, value)) return bad(res, ['value']);
      stored = { value };
      if (typeof transcript === 'string') stored.transcript = transcript.slice(0, 500);
      if (q.critical) {
        // Allergies, medicines and emergency symptoms are confirmed on screen AND by audio (PRD 8.5, FR-A17).
        const ok = confirmation?.visual === true && (confirmation.audio === true || confirmation.audioUnavailable === true);
        if (!ok) return res.status(400).json({ error: 'critical_confirmation_required', needs: ['visual', 'audio'] });
        stored.confirmation = { visual: true, audio: confirmation.audio === true, audioUnavailable: confirmation.audioUnavailable === true };
        if (confirmation.audioUnavailable) await helpRequest(req.user.sub, 'critical_answer_audio_unavailable', { questionKey });
      }
      if (q.type === 'text') stored.extracted = narration.map(value); // mapper input is `value`, output is stored beside it
    }

    const enc = req.pSession.encounter_id;
    await pool.query(
      `INSERT INTO interview_responses (encounter_id, question_key, answer, modality, confidence, confirmed)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (encounter_id, question_key) DO UPDATE SET answer = $3, modality = $4, confidence = $5, confirmed = $6`,
      [enc, q.key, stored, modality, confidence ?? null, confirmed]);

    const fresh = await loadAnswers(enc);
    const stale = staleKeys(fresh);
    if (stale.length) {
      await pool.query('DELETE FROM interview_responses WHERE encounter_id = $1 AND question_key = ANY($2)', [enc, stale]);
      for (const k of stale) delete fresh[k];
    }
    // Medicine and allergy answers feed the cross-document analysis (Phase 5), so it is rebuilt when one changes.
    if ([q.key, ...stale].some((k) => /^(drug|allergy)\./.test(k))) analysis?.schedule(enc, 'answers_changed');
    await pool.query(
      `UPDATE patient_sessions SET speech_failures = speech_failures - $2::text WHERE id = $1`, [req.pSession.id, q.key]);
    await pool.query(`UPDATE encounters SET status = 'in_intake' WHERE id = $1 AND status = 'registered'`, [enc]);
    await audit(pool, { actorType: 'patient', actorId: req.user.sub, action: 'history_answer_saved', objectType: 'encounter', objectId: enc, detail: { questionKey: q.key, skipped: Boolean(stored.skipped), modality } });

    // Red-flag evaluation after every answer (Phase 3 supplies the rules).
    const flags = await redFlags.evaluate({ encounterId: enc, patientId: req.user.sub, answers: fresh, changedKey: q.key });
    const { answered, total, question } = nextQuestion(fresh, mode);
    res.json({
      saved: true, pruned: stale, done: !question, progress: { answered, total },
      ...(stored.extracted ? { suggestions: stored.extracted } : {}),
      ...(flags?.length ? { staffNotified: true } : {}), // the patient is never told what was flagged
    });
  });

  // Two failed recognitions offer tapping; a further failure alerts staff (PRD 8.5).
  router.post('/recognition-failure', async (req, res) => {
    const key = req.body?.questionKey;
    if (!getQuestion(key)) return bad(res, ['questionKey']);
    const { rows: [s] } = await pool.query(
      `UPDATE patient_sessions SET speech_failures = jsonb_set(speech_failures, ARRAY[$2::text], to_jsonb(COALESCE((speech_failures->>$2)::int, 0) + 1))
        WHERE id = $1 RETURNING speech_failures`, [req.pSession.id, key]);
    const failures = s.speech_failures[key];
    const alertedStaff = failures === RECOGNITION_ALERT_AFTER;
    if (alertedStaff) await helpRequest(req.user.sub, 'speech_recognition_failed', { questionKey: key, failures });
    res.json({ failures, offerTap: failures >= RECOGNITION_OFFER_TAP_AFTER, alertedStaff: failures >= RECOGNITION_ALERT_AFTER });
  });

  router.get('/review', async (req, res) => {
    res.json({ items: reviewList(await loadAnswers(req.pSession.encounter_id), langOf(req), await modeOf(req.pSession.encounter_id)) });
  });

  router.get('/history', async (req, res) => {
    res.json({ sections: structuredHistory(await loadAnswers(req.pSession.encounter_id), langOf(req), await modeOf(req.pSession.encounter_id)) });
  });

  return router;
}
