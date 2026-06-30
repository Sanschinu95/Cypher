import React, { createContext, useCallback, useMemo, useRef, useState } from 'react';

export type SessionEventType =
  | 'info'
  | 'training'
  | 'auth_pass'
  | 'auth_warn'
  | 'auth_block'
  | 'anomaly'
  | 'lockout'
  | 'system';

export interface SessionEvent {
  id: string;
  type: SessionEventType;
  message: string;
  timestamp: number;
}

interface SessionLogContextValue {
  events: SessionEvent[];
  addEvent: (type: SessionEventType, message: string) => void;
  clearEvents: () => void;
}

export const SessionLogContext = createContext<SessionLogContextValue | null>(null);

const MAX_EVENTS = 200;

export const SessionLogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const counter = useRef(0);
  const [events, setEvents] = useState<SessionEvent[]>(() => [
    {
      id: 'session-start',
      type: 'system',
      message: `Session started — ${navigator.platform || 'Unknown platform'} / ${navigator.language || ''}`.trim(),
      timestamp: Date.now(),
    },
  ]);

  const addEvent = useCallback((type: SessionEventType, message: string) => {
    counter.current += 1;
    const entry: SessionEvent = {
      id: `evt_${Date.now()}_${counter.current}`,
      type,
      message,
      timestamp: Date.now(),
    };
    setEvents((prev) => {
      const next = [...prev, entry];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const value = useMemo<SessionLogContextValue>(
    () => ({ events, addEvent, clearEvents }),
    [events, addEvent, clearEvents]
  );

  return <SessionLogContext.Provider value={value}>{children}</SessionLogContext.Provider>;
};
