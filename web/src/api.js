// Connection state for the whole app. When the API process is not running, the Vite proxy answers 5xx with no JSON body;
// that is reported as "server unreachable" (a rejected promise, like a network failure) rather than passed on as an
// ordinary HTTP error, so a stopped server never shows up as "wrong password" or as an empty screen.
export const SERVER_OFFLINE = 'pc:server-offline';
export const SERVER_ONLINE = 'pc:server-online';

let offline = false;
const announce = (down) => {
  if (down === offline) return;
  offline = down;
  window.dispatchEvent(new Event(down ? SERVER_OFFLINE : SERVER_ONLINE));
};

export class ServerUnreachableError extends Error {
  constructor() { super('server unreachable'); this.name = 'ServerUnreachableError'; }
}

async function send(path, init) {
  let res;
  try {
    res = await fetch(`/api${path}`, { credentials: 'same-origin', ...init });
  } catch {
    announce(true);
    throw new ServerUnreachableError();
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  if (res.status >= 500 && !isJson) {
    announce(true);
    throw new ServerUnreachableError();
  }
  announce(false);
  return { ok: res.ok, status: res.status, body: isJson ? await res.json().catch(() => ({})) : {} };
}

// Sends a file as the raw request body (photos and PDFs). The name travels in a header so the body can stay binary.
export function uploadFile(path, file, { method = 'POST' } = {}) {
  return send(path, {
    method, body: file,
    headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name || 'document') },
  });
}

// JSON fetch helper. Resolves { ok, status, body } and never throws on HTTP errors; network failures and an unreachable server reject.
export function api(path, { method = 'GET', body } = {}) {
  return send(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Checks the API and its database: 'up', 'db-down' or 'api-down'.
export async function checkHealth() {
  try {
    const r = await api('/health');
    return r.ok ? 'up' : 'db-down';
  } catch {
    return 'api-down';
  }
}
