// Provider interfaces keep the OTP/SMS vendor and the ABDM integration swappable (Open Question Q11).

// OTP delivery. A real provider implements send(mobile, message). The mock records messages and never sends anything.
export function createMockOtpProvider() {
  const sent = [];
  return { name: 'mock', sent, async send(mobile, message) { sent.push({ mobile, message }); } };
}

// ABDM adapter. This stub only checks identifier formats and invents ABHA numbers for synthetic patients;
// it stands in until ABDM sandbox access is granted (Phase 0 external action). Phase 8 replaces it with the real FHIR/ABDM client.
export function createStubAbdmProvider() {
  return {
    name: 'stub',
    async verifyAbha(abhaId) {
      return { verified: /^\d{14}$/.test(abhaId), stub: true };
    },
    async verifyAadhaar(aadhaar) {
      return { verified: /^\d{12}$/.test(aadhaar), stub: true };
    },
    // Stands in for the ABHA personal health record push (consent artefact, then the FHIR bundle). Replaced when sandbox access exists.
    async pushRecord(bundle, { abhaId }) {
      return { id: `stub-abha-${bundle.id}`, receivedAt: new Date().toISOString(), stub: true, abhaLast4: String(abhaId).slice(-4) };
    },
    async createAbha() {
      const digits = Array.from({ length: 14 }, () => Math.floor(Math.random() * 10)).join('');
      return { abhaId: digits, stub: true };
    },
  };
}
