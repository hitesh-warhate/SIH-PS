import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICON_NAMES, ICONS, ICON_STATES } from '../src/components/iconRegistry.js';

const load = (lang) => JSON.parse(readFileSync(new URL(`../src/i18n/${lang}.json`, import.meta.url), 'utf8'));
const locales = { en: load('en'), hi: load('hi'), mr: load('mr') };

test('all 14 icons from PRD Section 8.3 exist, each with drawing paths', () => {
  assert.deepEqual([...ICON_NAMES].sort(), [
    'addfile', 'back', 'followup', 'help', 'language', 'listen', 'next', 'read', 'repeat', 'skip', 'slower', 'speak', 'tap', 'yesno',
  ]);
  for (const name of ICON_NAMES) assert.ok(ICONS[name].length > 0, name);
});

test('icons have distinct on, off, active and disabled states', () => {
  assert.deepEqual(ICON_STATES, ['default', 'off', 'active', 'disabled']);
  const src = readFileSync(new URL('../src/components/Icon.jsx', import.meta.url), 'utf8');
  for (const marker of ["state === 'off'", "state === 'active'", "state === 'disabled'"]) assert.ok(src.includes(marker), marker);
});

test('every icon has a non-empty label in English, Hindi and Marathi', () => {
  for (const [lang, dict] of Object.entries(locales)) {
    for (const name of ICON_NAMES) assert.ok(dict[`icon.${name}`]?.trim(), `${lang} icon.${name}`);
  }
});

test('the three locale files have exactly the same keys and no empty values', () => {
  const keys = Object.keys(locales.en).sort();
  for (const lang of ['hi', 'mr']) {
    assert.deepEqual(Object.keys(locales[lang]).sort(), keys, `${lang} keys differ from en`);
  }
  for (const [lang, dict] of Object.entries(locales)) {
    for (const [k, v] of Object.entries(dict)) assert.ok(v.trim(), `${lang}.${k} is empty`);
  }
});

test('Hindi and Marathi are flagged as pending native-speaker review', () => {
  assert.equal(locales.en['meta.reviewStatus'], 'approved');
  assert.match(locales.hi['meta.reviewStatus'], /pending/);
  assert.match(locales.mr['meta.reviewStatus'], /pending/);
});

test('hi and mr text uses Devanagari so the font stack is exercised', () => {
  for (const lang of ['hi', 'mr']) assert.match(locales[lang]['portal.patient'], /[ऀ-ॿ]/);
});

test('patient touch target is at least 64 px in the design tokens', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const token = css.match(/--touch-min:\s*(\d+)px/);
  assert.ok(token && Number(token[1]) >= 64);
  assert.match(css, /\.touch\s*\{[^}]*min-width:\s*var\(--touch-min\)[^}]*min-height:\s*var\(--touch-min\)/);
});

test('design system has large-text and high-contrast options', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(css, /html\.large-text/);
  assert.match(css, /html\.high-contrast/);
});

test('every translation key used in the code exists in English, Hindi and Marathi', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = `${dir}/${name}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.jsx?$/.test(name)) files.push(full);
    }
  };
  walk(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' '));
  const used = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  assert.ok(used.size > 40);
  for (const key of used) for (const [lang, dict] of Object.entries(locales)) assert.ok(dict[key], `${lang} is missing ${key}`);
  // keys built from a prefix (t(`flow.${x}`), t(`sex.${s}`), t(`icon.${n}`)) are checked by their known value sets
  for (const s of ['female', 'male', 'other']) for (const d of Object.values(locales)) assert.ok(d[`sex.${s}`]);
  for (const k of ['patientcase', 'abha', 'aadhaar', 'mobile']) for (const d of Object.values(locales)) assert.ok(d[`flow.lookup.${k}`]);
});
