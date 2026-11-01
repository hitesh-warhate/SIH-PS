# FHIR, ABHA and hospital-system integration report (Phase 8, first run)

Everything here ran against **local stand-ins**. No ABDM sandbox and no real hospital system was available.

## What was built

- **Mapping** (`server/src/integration/fhir.js`): a confirmed encounter becomes a FHIR R4 `document` Bundle with a Composition (the confirmed summary, section by section, with a narrative in the patient's language), Patient, Practitioner (the confirming doctor), Encounter, a MedicationStatement per medicine, an Observation per lab value (value, unit, reference range, **no interpretation**), an AllergyIntolerance per reported allergy, and a DocumentReference per file (from Phase 5). The ABHA number is added to the Patient only with ABHA consent. A rejected draft sends nothing; the manual documentation after a rejection is what is sent. Bundles are stored as JSONB in `fhir_bundles` with a GIN index.
- **Checks** (`validate.js`): required elements per resource, every reference resolves inside the bundle, the Composition comes first, ids and URLs are unique, dates are valid, narratives are well-formed XHTML, numbers are numbers. The result is stored with the bundle.
- **Delivery** (`service.js`, `connectors.js`): one `deliveries` row per bundle and target (hospital system, ABHA). States: waiting, delivered (with the acknowledgement stored), failed, not sent (no consent, or no ABHA number), cancelled (consent withdrawn). Failures are retried with exponential back-off (5 attempts by default, 30 s base), listed first on the staff screen with the last error, and can be retried by staff. Several workers are safe (`FOR UPDATE SKIP LOCKED`). The hospital connector is configurable: `HIS_MODE=http` with `HIS_URL` and `HIS_TOKEN`, or `mock`; production refuses `mock`.
- **Consent gate:** consent is checked when the bundle is queued and again just before each send; a purpose without consent is never sent and the reason is audited (`push_skipped_no_consent`).

## What was checked

`integration.test.js` (9 tests): the bundle passes the structural checks and carries the expected resources; the checker catches a broken reference, a missing Composition, bad dates, missing fields, a non-numeric value, a duplicate and a wrong bundle type; a confirmed summary reaches a real local HTTP server with the bearer token and FHIR content type and the acknowledgement id is stored; a failing server is retried, ends in a visible failed state after 3 attempts, and a retry from staff succeeds; a purpose without consent is never sent (nothing reaches the server) in all three situations (no consent, HIS only, no ABHA number); withdrawing consent cancels a waiting push; a rejected draft sends nothing and the manual note is what is sent; only staff see or retry deliveries.

## What has not been done

- **Validation against the ABDM profiles.** The checks above are our own. The bundle deliberately does not claim an ABDM profile in `meta.profile`; every stored result says `abdmProfiles.checked: false`. Definition of Done item 2 stays open until the bundle is validated in the ABDM sandbox and the mapping is adjusted to the profiles (the Composition type, the identifier systems and the document types are the likely changes).
- **The ABHA push is a stub** (`providers.js`). The real client needs the ABDM gateway, the consent-manager artefacts and the patient's ABHA consent flow; none of that exists here. Definition of Done item 1 is therefore met only against stand-ins.
- No real HIS: hospitals differ (Open Question Q6). The HTTP connector sends a FHIR bundle with a bearer token; some hospitals will need HL7 v2, an API gateway, a different authentication or a different payload.
- Coded values: medicines, tests and conditions are sent as text, not as SNOMED CT, LOINC or drug codes. A coded mapping needs the licensed code systems and the dictionary review from Phase 5.
- A confirmed record changed later is not re-sent; each summary version is sent once.
