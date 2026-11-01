import { useEffect, useReducer, useState } from 'react';
import { applyEvent, initialState } from './alertState.js';

const EVENTS = ['snapshot', 'alert', 'ack', 'help', 'help-ack'];

// Subscribes to the live alert stream. The browser reconnects by itself after a drop; every reconnect starts with a snapshot.
export function useAlertStream(role) {
  const [state, dispatch] = useReducer((s, a) => applyEvent(s, a.event, a.data), initialState);
  const [live, setLive] = useState(false);
  const [version, setVersion] = useState(0); // bumps on every change so other panels (the queue) can refresh

  useEffect(() => {
    const source = new EventSource(`/api/${role}/alerts/stream`);
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    for (const event of EVENTS) {
      source.addEventListener(event, (e) => {
        dispatch({ event, data: JSON.parse(e.data) });
        setVersion((v) => v + 1);
        if (event === 'snapshot') setLive(true);
      });
    }
    return () => source.close();
  }, [role]);

  return { ...state, live, version };
}
