// State of the live alert screens. Pure, so reconnect and de-duplication can be tested without a browser.
const LEVEL_ORDER = { emergency: 0, attention: 1 };

// Open alerts first (emergency before attention), then acknowledged ones; within a group the oldest comes first.
export function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => (
    Number(Boolean(a.acknowledgedAt)) - Number(Boolean(b.acknowledgedAt))
    || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
    || new Date(a.raisedAt) - new Date(b.raisedAt)
  ));
}

const upsert = (list, item) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? { ...x, ...item } : x)) : [...list, item]);

export const initialState = { alerts: [], help: [] };

// event: 'snapshot' | 'alert' | 'ack' | 'help' | 'help-ack'. A snapshot replaces everything (sent on every connect and reconnect).
export function applyEvent(state, event, data) {
  switch (event) {
    case 'snapshot': return { alerts: sortAlerts(data.alerts ?? []), help: data.help ?? [] };
    case 'alert':
    case 'ack': return { ...state, alerts: sortAlerts(upsert(state.alerts, data)) };
    case 'help': return { ...state, help: upsert(state.help, data) };
    case 'help-ack': return { ...state, help: state.help.map((h) => (h.id === data.id ? { ...h, acknowledgedAt: data.acknowledgedAt } : h)) };
    default: return state;
  }
}

export const openAlerts = (alerts) => alerts.filter((a) => !a.acknowledgedAt);
