# Monitoring, alerting and the read replica (Phase 10)

## What is monitored

`server/src/ops/monitor.js` runs six checks every 30 seconds, each with a 30-second time limit (a check that hangs counts as down). The result is kept in `ops_events` whenever a component changes state, shown in the admin console under **System health**, and available to the hospital's own tools.

| Component | What is checked | Degraded when | Down when |
|---|---|---|---|
| Database | `SELECT 1` and its time | slower than 1 s | the query fails |
| Reporting replica | In recovery, the WAL receiver is streaming, how far behind it is. Only measured when `REPLICA_DATABASE_URL` is set | not streaming, or more than 30 s behind, or not actually a replica | more than 300 s behind, or unreachable |
| Document reading (OCR) | The engine can start (models present, workers running) | n/a | it cannot start |
| Reading queue | Oldest file still waiting, files given up on in the last hour | oldest waiting over 5 minutes, or any file given up on | oldest waiting over 15 minutes |
| Hospital system and ABHA | Deliveries failed or with invalid bundles, oldest delivery still pending | any failed or invalid delivery | a delivery pending for over an hour |
| Speech | **Indirect only.** Recognition runs in the patient's browser, so the server cannot test it. It counts patients who could not be understood three times and asked for help in the last 15 minutes | 10 or more | n/a |

These thresholds are the developers' proposals. Hospital IT and the clinical lead should set them.

## How an alert reaches a person

When a component changes state the monitor sends one message to the notifier, and one more when it recovers; a component that stays down does not repeat. Set `ALERT_WEBHOOK_URL` to an address that accepts a JSON POST `{ component, status, previous, detail, at }`; with no address it writes the alert to the server log. **Routing that webhook to a pager, phone or chat channel that someone is actually watching is the hospital's job, and has not been set up** (`docs/rollout-runbook.md`, support path).

External monitors can poll `GET /api/ops/health` (JSON, answers 503 when anything is down) or `GET /api/ops/metrics` (Prometheus text) with the header `x-ops-token: <OPS_TOKEN>`, or with an admin session. `GET /api/health` stays as the simple public liveness check.

## Failure drills run (2026-11-01)

| Drill | Result |
|---|---|
| Reading engine made to fail (test) | One alert `ocr: ok to down`; a second run sent nothing; `/api/ops/health` answered 503; recovery sent `ocr: down to ok`; both changes in the history |
| A file made to wait 20 minutes (test) | `jobQueue` went down with the age in the detail, and recovered when the file was removed |
| Database check made to fail (test) | `database: down` alert |
| A check that never finishes (test) | Reported as down after the limit; the other checks were not held up |
| The real replica stopped with `pg_ctl stop` (`scripts/replica-drill.mjs`) | The monitor raised `replica: ok to down`, the replica was started again, and `replica: down to ok` followed 1.9 s after the stop |
| Webhook (test) | A JSON alert reached a local HTTP listener; a dead address did not stop the monitor |

**Not drilled:** the OCR engine failing in production (the test replaces the check), a real network partition to the hospital system, and an alert actually reaching a person. The drills prove the software notices and says so; they do not prove that anyone is woken up.

## Read replica

`REPLICA_DATABASE_URL` points the admin console's reports and audit-log view (and the monitor's replica check) at a streaming replica; with it unset they use the primary. Nothing that writes, and none of the patient, staff or doctor screens, uses the replica, so a lagging replica cannot show a stale queue or summary.

The recorded run used a real streaming replica built on the development machine:

```
pg_basebackup -h localhost -U postgres -D <replica dir> -R -X stream
pg_ctl -D <replica dir> -o "-p 5433" start
REPLICA_DATABASE_URL=postgres://...:5433/... node --env-file=.env scripts/replica-drill.mjs
```

Results: the replica was in recovery and refused a write ("cannot execute INSERT in a read-only transaction"); 15 writes on the primary were visible on the replica after a median of under 1 ms and at most 7 ms; the reports (metrics, queue read, audit count) ran on the replica in 50, 32 and 1 ms, the same as on the primary at this size; the monitor reported streaming with zero lag.

**Limits:** primary and replica were on one machine over the loopback interface, so the delay says nothing about a network between hospital servers. The monitor's lag figure needs the monitor's database role to be allowed to read `pg_stat_wal_receiver` (the `pg_monitor` role). A production replica has not been provisioned.

## Queue response time at hospital volume (DBR-11)

`node --env-file=.env scripts/queue-benchmark.mjs 10000` with 10,000 encounters in one day (with queue entries, complaint answers, 3% emergency alerts, files and analysis rows for about half), 20 runs each, on one laptop:

| Query | p50 | p95 |
|---|---|---|
| Doctor queue (all cases, with warning counts) | 115 ms | 210 ms |
| Doctor queue, search and filter | 117 ms | 130 ms |
| Staff queue | 34 ms | 38 ms |
| Open alerts list | 4 ms | 8 ms |

The doctor queue sends at most 300 rows to a screen (`truncated` says if more match); the counters still count the whole day. **No response-time target has been agreed.** The proposal is p95 of 500 ms or less at 10,000 encounters a day.

## Pooling and indexes

The API pool is bounded (`PG_POOL_MAX`, default 20), each statement is limited (`PG_STATEMENT_TIMEOUT_MS`, default 15 s) and connections are named for the database administrator. Indexes on today's encounters and queue entries were added in migration 010 (`encounters.started_at`, `queue_entries.created_at`). Row-level security for the doctor role is still not used by the running app (D-09).
