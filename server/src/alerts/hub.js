// In-process publish/subscribe for the real-time channel (server-sent events). One instance per server process;
// a multi-process deployment would put this behind PostgreSQL LISTEN/NOTIFY or Redis (Phase 10).
export function createAlertHub() {
  const subs = new Set();
  return {
    // sub: { role: 'staff' | 'doctor', departmentId, send(event, data) }
    subscribe(sub) { subs.add(sub); return () => subs.delete(sub); },
    // opts.roles limits who receives it; opts.departmentId limits doctors to their department (department-level routing).
    publish(event, data, { roles = ['staff', 'doctor'], departmentId = null } = {}) {
      for (const s of subs) {
        if (!roles.includes(s.role)) continue;
        if (s.role === 'doctor' && departmentId && s.departmentId && s.departmentId !== departmentId) continue;
        try { s.send(event, data); } catch { subs.delete(s); }
      }
    },
    get size() { return subs.size; },
  };
}
