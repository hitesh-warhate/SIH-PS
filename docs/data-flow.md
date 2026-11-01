# Data-flow note: where voice, documents and language-model processing happen (Phase 8, FR-D6)

Status: first version written by the developers, 2026-11-01. It states what the code does today. It has **not** been reviewed by a security or compliance reviewer (Phase 8 Definition of Done, item 10), and its first finding is a gap against the requirement that voice and document AI stay inside the platform boundary.

## Summary

| Processing | Where it happens today | Who can see the data | Inside the platform boundary? |
|---|---|---|---|
| **Speech to text** (the patient speaking an answer) | In the patient's browser, through the browser's Web Speech API (`web/src/speech/speech.js`). Only the recognised text is sent to the server; no audio is recorded or stored by this system. | **The browser vendor.** In Chrome and Edge the audio is sent to the vendor's cloud speech service to be recognised. Safari and Firefox behave differently. | **No.** This is the main open item. |
| **Text to speech** (reading questions and answers aloud) | In the browser through `speechSynthesis`, using device voices. Some browsers use cloud voices. | Question text is generic. Read-backs of the patient's answers (allergies, medicines) are patient data, so a cloud voice would see them. | Depends on the device voice. Not verified. |
| **Document reading (OCR)** | On the application server, in process, with Tesseract (`tesseract.js`). Images never leave the server. The three language models are downloaded from a public CDN on first use (no patient data is sent in that download). | Application server operators. | **Yes**, once the language data is shipped with the application. |
| **Extraction, classification, analysis, summary** | On the application server, rule-based code. | Application server and database operators. | Yes. |
| **Language model** | **None is connected.** Free-text narration is mapped by a rule-based mapper (`server/src/interview/narration.js`). The mapper is behind an interface, so a model can be added later. | n/a | n/a until one is chosen. |
| **Hospital system (HIS) push** | HTTPS POST of a FHIR bundle from the server to the configured `HIS_URL`. | The hospital system, and anything on the path if TLS is not used. | Only to the hospital the patient consented to (`his_sharing`). |
| **ABHA push** | Stub today. The real client sends the bundle to the ABDM gateway after ABDM consent artefacts. | ABDM and the patient's PHR. | Only with `abha_linking` consent and an ABHA number on record. |
| **SMS / OTP** | Mock provider today. A real provider would see the mobile number and the message. | The SMS vendor. | Not decided (Open Question Q11). |

## What is stored, and where

| Data | Where | Protection |
|---|---|---|
| Mobile number | `patients.mobile_hash` | Keyed hash only (HMAC-SHA256). The number itself is not stored after registration. |
| ABHA, Aadhaar reference, hospital UHID | `patient_identifiers.value_encrypted` | AES-256-GCM field encryption. |
| Original documents | `FILE_STORE_DIR` files | AES-256-GCM, one random IV per file. The database holds only a reference. |
| Name, date of birth, sex, address, answers, summaries | PostgreSQL | **Not encrypted at field level** (the requirement covers identifiers and mobile numbers). Protection is access control, row-level security for the doctor role, and disk encryption of the database server (a deployment duty, not done here). |
| Raw voice transcripts | Not kept after the intake is submitted | Removed by `compliance/purge.js`. |
| Audit log | `audit_logs` (monthly partitions) | Append-only for every role without the right to drop the trigger. |
| FHIR bundles and delivery acknowledgements | `fhir_bundles`, `deliveries` | Contain the patient's record. The ABHA number is included only with ABHA consent. |
| Application logs | stdout | Contain errors only; a test checks that a mobile number and an ABHA number never appear. |

## Overview writer (optional external model)

After submission, `server/src/ai` builds a de-identified facts object (age group, sex, answers, file findings and checks for the doctor; only answers for the patient) and passes it to the configured writer. The default writer is rule-based and local. If `AI_PROVIDER=anthropic`, those facts leave the platform to the Anthropic API. Results are stored in `ai_narratives`, and each write is audited as `ai_overview_written`. Open item: approval and a consent purpose for external model processing.

## In transit

The API speaks plain HTTP and expects a TLS-terminating proxy in front of it (production sets `Strict-Transport-Security`, and the session cookie is `Secure`). TLS is a deployment duty and has not been tested here.

## Open items for the reviewer

1. **Browser speech recognition sends audio outside the platform.** To meet FR-D6, either an on-premises speech service is added behind the existing speech interface, or the consent notice must say plainly that voice answers are recognised by the browser vendor. The first needs a decision on Open Question Q9.
2. Confirm that the hospital accepts OCR on the application server.
3. Decide where keys live (an environment variable today; a managed key service is the target).
4. If a language model is added, update this note before it is used with real data.
