import { useContext } from 'react';
import { SessionLogContext } from '@/context/SessionLogContext';

export const useSessionLog = () => {
  const ctx = useContext(SessionLogContext);
  if (!ctx) {
    throw new Error('useSessionLog must be used inside <SessionLogProvider>');
  }
  return ctx;
};
