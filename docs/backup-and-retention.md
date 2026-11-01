# Backups, point-in-time recovery and retention (Phase 8, DBR-12)

## What has been tested

On 2026-11-01 `node --env-file=.env scripts/backup-restore-test.mjs` took a `pg_dump` of the development database (25 tables, 627 rows, 141 KB), restored it into a new database with `pg_restore`, and compared every table's row count. All matched, and the audit log's 6 partitions, its 14 append-only triggers and the 13 row-level-security policies came back. The dump took 0.5 s and the restore 0.8 s. This shows that a **logical backup can be restored**. It is a development database with synthetic data; the encrypted document files in `FILE_STORE_DIR` are not part of a database dump and must be backed up separately (the script does not do that).

## What has not been done

**Point-in-time recovery is not configured.** It is a property of the PostgreSQL server, not of this application, and needs a deployment that has not been chosen (Open Question Q9). The settings it needs are:

- `wal_level = replica` (or higher), `archive_mode = on`, and an `archive_command` that copies WAL files to storage outside the database host;
- a base backup on a schedule (`pg_basebackup`) and a retention rule for base backups and WAL;
- a recovery drill: restore the base backup, set `recovery_target_time`, start the server, and check the rows.

Managed PostgreSQL services provide this as a setting; a self-hosted server needs the above. Definition of Done item 8 stays open until a restore to a chosen time has succeeded on the real server.

Also not done: backing up the encrypted file store, backing up the encryption keys separately from the data (a restored database without its keys is unreadable by design), and monitoring that backups ran.

## Retention (proposal, for the hospital and legal review)

| Data | Proposal | Today |
|---|---|---|
| Temporary working files | 15 minutes (`TEMP_TTL_MS`) | Implemented, removed on submission and every 5 minutes |
| Raw voice transcripts | Removed when the intake is submitted | Implemented |
| Confirmed clinical record (answers, summary versions, documents, analysis) | **Period to be set by the hospital and legal advisers**, following its medical-records policy and the ABDM consent terms | Kept indefinitely; no job deletes it |
| Abandoned intakes (never submitted) | Delete after a short period, for example 7 days | Not implemented |
| Audit log | Keep at least as long as the clinical record; partitions allow old months to be archived as a unit | Partitioned monthly; archiving not implemented |
| FHIR bundles and delivery records | Same as the clinical record | Kept |
| Backups | Retention shorter than or equal to the clinical record, and deleted data must age out of backups within a stated time | Not decided |

Decisions needed: the clinical-record retention period; whether abandoned intakes are deleted and when; how long backups are kept; how an erasure request interacts with backups.
