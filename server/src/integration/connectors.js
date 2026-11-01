// Delivery connectors: the hospital system (HIS/EMR) and ABHA. Both are interfaces so that each hospital's HIS can be configured
// (Open Question Q6) and the real ABDM client can replace the stub when sandbox access exists.

// mode 'mock' records bundles and acknowledges them (development and tests). mode 'http' POSTs the bundle as FHIR JSON to a configured URL
// and expects a 2xx; the response body (or its id) is kept as the delivery acknowledgement.
export function createHisConnector({ mode = 'mock', url, token, fetchImpl = fetch, timeoutMs = 10_000 } = {}) {
  if (mode === 'http' && !url) throw new Error('HIS_URL is required when HIS_MODE=http');
  const received = [];
  return {
    name: mode, received,
    async send(bundle) {
      if (mode === 'mock') {
        received.push(bundle);
        return { id: `mock-his-${received.length}`, receivedAt: new Date().toISOString(), mock: true };
      }
      const res = await fetchImpl(url, {
        method: 'POST', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'content-type': 'application/fhir+json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(bundle),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HIS responded ${res.status}`);
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { /* a plain acknowledgement */ }
      return { id: body?.id ?? res.headers.get('location') ?? null, status: res.status, receivedAt: new Date().toISOString() };
    },
  };
}
