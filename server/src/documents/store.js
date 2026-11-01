import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Encrypted file store (DBR-4). Originals are AES-256-GCM encrypted on disk and referenced by storage_ref; the database never
// holds file bytes. Production would put the same interface in front of an object store with server-side encryption (Phase 8/10).
export function createFileStore({ dir, crypto }) {
  const files = path.join(dir, 'files');
  const tmp = path.join(dir, 'tmp');
  const safe = (ref) => {
    if (!/^[0-9a-f-]{36}\.enc$/.test(ref)) throw new Error('invalid storage ref');
    return path.join(files, ref);
  };
  return {
    async put(buffer) {
      await mkdir(files, { recursive: true });
      const ref = `${randomUUID()}.enc`;
      await writeFile(safe(ref), crypto.encryptBuffer(buffer));
      return ref;
    },
    async get(ref) { return crypto.decryptBuffer(await readFile(safe(ref))); },
    async remove(ref) { if (ref) await rm(safe(ref), { force: true }); },

    // Temporary working files (intermediate images) live here with a time-to-live; the purge job is scheduled in Phase 8 (DBR-7).
    async tempFile(name, buffer) {
      await mkdir(tmp, { recursive: true });
      const p = path.join(tmp, `${randomUUID()}-${name.replace(/[^\w.-]/g, '_')}`);
      await writeFile(p, buffer);
      return p;
    },
    async purgeTemp(maxAgeMs) {
      let removed = 0;
      try {
        for (const name of await readdir(tmp)) {
          const p = path.join(tmp, name);
          if (Date.now() - (await stat(p)).mtimeMs > maxAgeMs) { await rm(p, { force: true }); removed++; }
        }
      } catch { /* no temp directory yet */ }
      return removed;
    },
    paths: { files, tmp },
  };
}
