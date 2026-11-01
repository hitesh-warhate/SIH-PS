import { audit, cleanName, dobFromInput, LANGS, newPatientCaseId, normalizeMobile } from './patients.js';

// Validates the registration form shared by the patient terminal and the staff portal (FR-R3: minimum fields only).
export function validateRegistration(body) {
  const errors = [];
  const fullName = cleanName(body.fullName);
  if (fullName.length < 2 || fullName.length > 120) errors.push('fullName');
  const born = dobFromInput(body);
  if (!born) errors.push('dateOfBirthOrAge');
  if (!['female', 'male', 'other'].includes(body.sex)) errors.push('sex');
  const mobile = normalizeMobile(body.mobile);
  if (!mobile) errors.push('mobile');
  if (!LANGS.includes(body.language)) errors.push('language');
  if (body.registrationConsent !== true) errors.push('registrationConsent');
  const emergency = body.emergencyContact ? normalizeMobile(body.emergencyContact) : null;
  if (body.emergencyContact && !emergency) errors.push('emergencyContact');
  const address = body.address ? String(body.address).trim().slice(0, 300) : null;
  return { errors, value: { fullName, born, sex: body.sex, mobile, language: body.language, emergency, address } };
}

// Optional identifiers supplied at registration. ABHA is checked with ABDM; Aadhaar is kept by reference only.
export async function checkIdentifiers(body, abdm) {
  const out = { abhaId: null, aadhaar: null, errors: [] };
  if (body.abhaId) {
    const id = String(body.abhaId).replace(/\D/g, '');
    if ((await abdm.verifyAbha(id)).verified) out.abhaId = id; else out.errors.push('abhaId');
  }
  if (body.aadhaar) {
    const id = String(body.aadhaar).replace(/\D/g, '');
    if ((await abdm.verifyAadhaar(id)).verified) out.aadhaar = id; else out.errors.push('aadhaar');
  }
  return out;
}

export async function addIdentifier(db, crypto, patientId, type, number) {
  // Aadhaar: only the keyed hash (for lookup) and the last four digits are kept, never the number.
  const stored = type === 'aadhaar_ref' ? `aadhaar-ref:${number.slice(-4)}` : number;
  await db.query(
    `INSERT INTO patient_identifiers (patient_id, type, value_encrypted, value_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [patientId, type, crypto.encrypt(stored), crypto.hash(number)],
  );
}

// Creates the patient record and its unique PatientCase ID (FR-R6).
export async function createPatient(pool, crypto, { value, abhaId, aadhaar, channel, staffId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let row;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      try {
        await client.query('SAVEPOINT ins');
        row = (await client.query(
          `INSERT INTO patients (patientcase_id, full_name, date_of_birth, dob_estimated, sex, mobile_hash, mobile_encrypted,
                                 preferred_language, address, emergency_contact_encrypted, registration_channel, registered_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id, patientcase_id, full_name, preferred_language`,
          [newPatientCaseId(), value.fullName, value.born.dob, value.born.estimated, value.sex, crypto.hash(value.mobile),
            crypto.encrypt(value.mobile), value.language, value.address, value.emergency ? crypto.encrypt(value.emergency) : null,
            channel, staffId ?? null],
        )).rows[0];
      } catch (err) {
        if (err.code !== '23505') throw err;
        await client.query('ROLLBACK TO SAVEPOINT ins'); // PatientCase ID collision, retry
      }
    }
    if (!row) throw new Error('could not allocate a PatientCase ID');
    if (abhaId) await addIdentifier(client, crypto, row.id, 'abha', abhaId);
    if (aadhaar) await addIdentifier(client, crypto, row.id, 'aadhaar_ref', aadhaar);
    await audit(client, {
      actorType: channel === 'staff' ? 'staff' : 'patient', actorId: channel === 'staff' ? staffId : row.id, userId: staffId ?? null,
      action: 'registration_consent_given', objectType: 'patient', objectId: row.id, detail: { channel, language: value.language },
    });
    await audit(client, {
      actorType: channel === 'staff' ? 'staff' : 'patient', actorId: channel === 'staff' ? staffId : row.id, userId: staffId ?? null,
      action: 'patient_registered', objectType: 'patient', objectId: row.id, detail: { channel },
    });
    await client.query('COMMIT');
    return row;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
