# Restore drill report (Phase 10, DBR-12)

## Drill 1: logical backup and restore, 2026-11-01

`BACKUP_INTERVAL_HOURS=24 node --env-file=.env scripts/backup-restore-test.mjs`

| Item | Result |
|---|---|
| Source | The development database, 26 tables, 674 rows, synthetic data, 148 KB |
| Dump (`pg_dump`, custom format) | 0.5 s |
| Restore (`pg_restore` into a new database) | 1.5 s |
| Checked afterwards | Every table has the same number of rows; the 6 audit partitions, 14 append-only triggers and 13 row-level-security policies came back |
| **Recovery time** (from starting the restore until the restored copy was checked) | **1.9 s** |
| **Data-loss window** | For a dump taken once a day: up to **24 hours plus the dump time (0.5 s)**. Anything committed since the last dump is lost |

**What these numbers mean.** They are for a tiny database on one laptop. A hospital database holding months of encrypted documents' metadata, analysis and audit rows will take far longer to dump and restore; the drill must be repeated at a realistic size. The 24-hour data-loss window is a consequence of daily logical dumps, not a measurement of what the hospital can accept.

## Not drilled

- **Point-in-time recovery** (restore to a chosen minute, which shrinks the data-loss window to seconds). It needs WAL archiving on the production database server, which does not exist yet (`docs/backup-and-retention.md` lists the settings).
- **The encrypted document files** (`FILE_STORE_DIR`) are not in a database dump. A restore without them leaves every document reference pointing at nothing. They need their own backup, taken so that it matches the database backup.
- **The encryption keys**, which must be backed up separately from the data, and a restore using them on a clean machine.
- A restore to a different server and PostgreSQL version, and a restore under time pressure by the person who would do it on the day.
- **Agreed targets.** Nobody has agreed a recovery time or a data-loss window, so nothing could be compared with one. Proposal for the hospital's IT head and the clinical lead: recovery time of 2 hours or less in OPD hours, and a data-loss window of 15 minutes or less (needs point-in-time recovery; a daily dump cannot meet it). A record of intake answers lost for a morning is recoverable (the patient answers again); a confirmed summary lost after the doctor accepted it is not, unless the hospital system already received it.

## Schedule proposed

| Drill | How often | Who | Recorded in |
|---|---|---|---|
| Restore the latest dump into a scratch database and run the row-count check | Weekly | Hospital IT | this report, one line per run |
| Full restore on a spare server including files and keys, timed | Quarterly and after any change to backups | Hospital IT with the developers | this report |
| Point-in-time restore to a chosen minute | Quarterly, once it exists | Hospital IT | this report |

| Date | Kind | Recovery time | Data-loss window | Within target? | By |
|---|---|---|---|---|---|
| 2026-11-01 | Logical restore, development database | 1.9 s | 24 h + 0.5 s | No target agreed | Developers |
