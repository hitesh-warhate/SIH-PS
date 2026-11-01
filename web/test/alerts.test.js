import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, initialState, openAlerts, sortAlerts } from '../src/alertState.js';

const alert = (id, level, raisedAt, acknowledgedAt = null) => ({ id, level, raisedAt, acknowledgedAt, token: 1 });

test('alerts sort emergency first, then attention, then acknowledged ones', () => {
  const sorted = sortAlerts([
    alert('ack', 'emergency', '2026-11-01T10:00:00Z', '2026-11-01T10:05:00Z'),
    alert('att', 'attention', '2026-11-01T10:01:00Z'),
    alert('emg-late', 'emergency', '2026-11-01T10:03:00Z'),
    alert('emg-early', 'emergency', '2026-11-01T10:02:00Z'),
  ]);
  assert.deepEqual(sorted.map((a) => a.id), ['emg-early', 'emg-late', 'att', 'ack']);
});

test('a snapshot replaces everything, which is how a screen catches up after a reload or dropped connection', () => {
  let s = applyEvent(initialState, 'alert', alert('a', 'emergency', '2026-11-01T10:00:00Z'));
  s = applyEvent(s, 'snapshot', { alerts: [alert('b', 'attention', '2026-11-01T10:01:00Z')], help: [{ id: 'h1' }] });
  assert.deepEqual(s.alerts.map((a) => a.id), ['b']);
  assert.deepEqual(s.help.map((h) => h.id), ['h1']);
});

test('the same alert arriving twice (snapshot then live event) appears once', () => {
  let s = applyEvent(initialState, 'snapshot', { alerts: [alert('a', 'emergency', '2026-11-01T10:00:00Z')] });
  s = applyEvent(s, 'alert', alert('a', 'emergency', '2026-11-01T10:00:00Z'));
  s = applyEvent(s, 'alert', alert('a', 'emergency', '2026-11-01T10:00:00Z'));
  assert.equal(s.alerts.length, 1);
});

test('an acknowledgement updates the alert in place and removes it from the open list', () => {
  let s = applyEvent(initialState, 'alert', alert('a', 'emergency', '2026-11-01T10:00:00Z'));
  assert.equal(openAlerts(s.alerts).length, 1);
  s = applyEvent(s, 'ack', { ...alert('a', 'emergency', '2026-11-01T10:00:00Z', '2026-11-01T10:02:00Z'), acknowledgedBy: 'Test Staff' });
  assert.equal(s.alerts.length, 1);
  assert.equal(s.alerts[0].acknowledgedBy, 'Test Staff');
  assert.equal(openAlerts(s.alerts).length, 0);
});

test('help requests are added once and marked done on acknowledgement', () => {
  let s = applyEvent(initialState, 'help', { id: 'h1', reason: 'help_button', acknowledgedAt: null });
  s = applyEvent(s, 'help', { id: 'h1', reason: 'help_button', acknowledgedAt: null });
  assert.equal(s.help.length, 1);
  s = applyEvent(s, 'help-ack', { id: 'h1', acknowledgedAt: '2026-11-01T10:02:00Z' });
  assert.equal(s.help[0].acknowledgedAt, '2026-11-01T10:02:00Z');
  assert.equal(applyEvent(s, 'unknown', {}), s);
});
