// Upload limits are configuration because Open Question Q10 is still open (FR-B2). Defaults are the PRD's proposals.
export function limitsFromEnv(env = process.env) {
  const num = (name, dflt) => (Number.isFinite(Number(env[name])) && Number(env[name]) > 0 ? Number(env[name]) : dflt);
  return {
    maxFiles: num('DOC_MAX_FILES', 15),
    maxBytes: num('DOC_MAX_MB', 10) * 1024 * 1024,
    maxPages: num('DOC_MAX_PAGES', 10),
  };
}

// Quality thresholds for photos and scans, tuned on the synthetic set (docs/ocr-accuracy-report.md); retune on real terminal cameras.
export const QUALITY = {
  minWidth: 600,        // px: below this the text is too small to read reliably
  minMean: 70,          // 0-255: darker than this is "too dark"
  blankMean: 250,       // brighter and flat: blank or blown out
  minSharpness: 10,     // edge-filter spread: sharp pages score 28 to 52, a blurred page 5 or less
  borderInkRatio: 0.03, // share of an edge strip that holds ink: a page with margins scores 0, text cut off 0.04 to 0.3
};

export const OCR_LANGS = 'eng+hin+mar';
export const CONFIDENCE = { review: 0.75 }; // fields below this are flagged for review and never shown as certain
