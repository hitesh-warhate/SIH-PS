import { randomInt } from 'node:crypto';

export const LANGS = ['en', 'hi', 'mr'];
export const PURPOSES = ['history', 'documents', 'his_sharing', 'abha_linking'];

// Indian mobile: 10 digits starting 6-9, with optional +91 or 0 prefix.
export function normalizeMobile(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const cleanName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

// Accepts a date of birth or an age in years; an age becomes 1 January of the implied year, flagged as estimated.
export function dobFromInput({ dateOfBirth, age }, now = new Date()) {
  if (dateOfBirth) {
    const d = new Date(`${dateOfBirth}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(d.getTime()) || d > now || d.getUTCFullYear() < 1900) return null;
    return { dob: dateOfBirth, estimated: false };
  }
  const n = Number(age);
  if (Number.isInteger(n) && n >= 0 && n <= 120) return { dob: `${now.getUTCFullYear() - n}-01-01`, estimated: true };
  return null;
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function newPatientCaseId() {
  const part = () => Array.from({ length: 4 }, () => ID_ALPHABET[randomInt(ID_ALPHABET.length)]).join('');
  return `PC-${part()}-${part()}`;
}

export function maskName(fullName) {
  const [first, ...rest] = cleanName(fullName).split(' ');
  return rest.length ? `${first} ${rest.map((p) => `${[...p][0]}.`).join(' ')}` : first;
}

export const ageYears = (dob, now = new Date()) => {
  if (!dob) return null;
  const d = new Date(dob);
  return now.getUTCFullYear() - d.getUTCFullYear();
};

// Duplicate candidates for a new registration (FR-R5, DBR-9).
//   mobile match (OTP proves the patient owns the number): shown to the patient to confirm, 'strong' when the names also look alike.
//   name + age match without the mobile: never shown to the patient (it could expose someone else's record); staff review it.
export async function findDuplicates(db, { fullName, dob, mobileHash }) {
  const { rows } = await db.query(
    `SELECT id, patientcase_id, full_name, date_of_birth, preferred_language,
            similarity(lower(full_name), lower($1)) AS sim,
            (mobile_hash IS NOT NULL AND mobile_hash = $2) AS mobile_match
       FROM patients
      WHERE mobile_hash = $2 OR similarity(lower(full_name), lower($1)) >= 0.6
      ORDER BY sim DESC LIMIT 10`,
    [fullName, mobileHash],
  );
  const year = dob ? Number(dob.slice(0, 4)) : null;
  const out = [];
  for (const r of rows) {
    const sim = Number(r.sim);
    const sameAge = year == null || !r.date_of_birth || Math.abs(Number(r.date_of_birth.slice(0, 4)) - year) <= 2;
    if (r.mobile_match) out.push({ ...r, sim, kind: sim >= 0.5 ? 'strong' : 'possible', viaMobile: true });
    else if (sim >= 0.7 && sameAge) out.push({ ...r, sim, kind: 'possible', viaMobile: false });
  }
  return out;
}

export async function audit(db, { actorType, actorId = null, userId = null, action, objectType = null, objectId = null, detail = null }) {
  await db.query(
    `INSERT INTO audit_logs (user_id, actor_type, actor_id, action, object_type, object_id, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, actorType, actorId, action, objectType, objectId, detail],
  );
}

// Strips analysis results, abnormal-value flags and alert levels from anything sent to the Patient portal (FR-P5).
const RESTRICTED = new Set([
  'analysis', 'analysisresults', 'analysis_results', 'flag', 'flags', 'alert', 'alerts', 'alertlevel', 'alert_level',
  'abnormal', 'abnormalflags', 'redflag', 'redflags', 'red_flag', 'red_flags', 'severity', 'priority',
]);
export function stripRestricted(value) {
  if (Array.isArray(value)) return value.map(stripRestricted);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !RESTRICTED.has(k.toLowerCase())).map(([k, v]) => [k, stripRestricted(v)]));
  }
  return value;
}
