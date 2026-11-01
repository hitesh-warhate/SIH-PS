// Server-sent events for staff and doctor screens. On every (re)connect the server first sends a full snapshot of what is
// open, so a screen that was reloaded or lost its connection catches up without missing or duplicating anything.
export function alertStream({ pool, hub, service, help, role }) {
  return async (req, res) => {
    let departmentId = null;
    if (role === 'doctor') {
      const { rows: [u] } = await pool.query('SELECT department_id FROM users WHERE id = $1', [req.user.sub]);
      departmentId = u?.department_id ?? null;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    res.write('retry: 2000\n\n');

    // Subscribe before reading the snapshot so nothing raised in between is lost; the client de-duplicates by alert id.
    const unsubscribe = hub.subscribe({ role, departmentId, send });
    const snapshot = { alerts: await service.list({ role, departmentId }) };
    if (role === 'staff') snapshot.help = await help.list();
    send('snapshot', snapshot);

    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeat); unsubscribe(); });
  };
}
