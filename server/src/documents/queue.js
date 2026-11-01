// A small in-process job queue (FR-B7): files run in parallel up to `concurrency`, a failing job is retried with exponential
// back-off, and one job failing never stops the others. Job state also lives in the documents table, so a restart re-queues
// whatever was waiting (see pipeline.recover). A multi-server deployment would swap this for a database-backed or Redis queue.
export function createJobQueue({ run, concurrency = 3, maxAttempts = 3, baseDelayMs = 500, isRetryable = () => true, onGiveUp = () => {} }) {
  const pending = [];
  const attempts = new Map();
  let active = 0;
  let timers = 0;
  let idleWaiters = [];

  const settle = () => {
    if (!active && !pending.length && !timers) { const w = idleWaiters; idleWaiters = []; w.forEach((r) => r()); }
  };

  const pump = () => {
    while (active < concurrency && pending.length) {
      const id = pending.shift();
      active++;
      Promise.resolve().then(() => run(id, attempts.get(id) ?? 1)).then(
        () => { attempts.delete(id); },
        async (err) => {
          const n = attempts.get(id) ?? 1;
          if (isRetryable(err) && n < maxAttempts) {
            attempts.set(id, n + 1);
            timers++;
            setTimeout(() => { timers--; pending.push(id); pump(); }, baseDelayMs * 2 ** (n - 1));
          } else {
            attempts.delete(id);
            try { await onGiveUp(id, err); } catch { /* a failing give-up handler must not stop the queue */ }
          }
        },
      ).finally(() => { active--; pump(); settle(); });
    }
  };

  return {
    enqueue(id) { if (!pending.includes(id)) { pending.push(id); pump(); } },
    idle() { return active || pending.length || timers ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve(); },
    get size() { return pending.length + active + timers; },
  };
}
