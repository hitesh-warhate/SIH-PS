import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { limitsFromEnv } from './config.js';
import { createDocumentReader, createTesseractEngine } from './ocr.js';
import { createDocumentPipeline } from './pipeline.js';
import { createFileStore } from './store.js';

const SERVER_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Builds the document subsystem: encrypted file store, reader (OCR engine), job queue and limits.
// Tests inject a fake `reader` and a temporary `dir`.
export function createDocuments({ pool, crypto, dir = process.env.FILE_STORE_DIR ?? path.join(SERVER_DIR, '.data'), reader, limits = limitsFromEnv(), workers = 3, baseDelayMs = 500 }) {
  const store = createFileStore({ dir, crypto });
  const realReader = reader ?? createDocumentReader({ engine: createTesseractEngine({ cachePath: path.join(dir, 'tessdata'), workers: Math.min(workers, 2) }) });
  const pipeline = createDocumentPipeline({ pool, store, reader: realReader, workers, baseDelayMs });
  return { store, pipeline, limits, reader: realReader, close: () => realReader.close?.() };
}
