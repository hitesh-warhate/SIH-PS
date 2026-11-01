// Sends a file as the raw request body (photos and PDFs). The name travels in a header so the body can stay binary.
export async function uploadFile(path, file, { method = 'POST' } = {}) {
  const res = await fetch(`/api${path}`, {
    method, credentials: 'same-origin', body: file,
    headers: { 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name || 'document') },
  });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({})) };
}

// JSON fetch helper. Resolves { ok, status, body } and never throws on HTTP errors; network failures reject.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body: parsed };
}
