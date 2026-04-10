import { useEffect, useState } from 'react';
import { wsClient } from '../services/websocket';

interface PresenceUser {
  id: string;
  name: string;
  role: string;
  machine: number | null;
}

export function usePresenceSummary() {
  const [presenceMap, setPresenceMap] = useState<Record<string, PresenceUser[]>>({});

  useEffect(() => {
    wsClient.subscribeDashboard();

    const off = wsClient.on('presence_summary', (msg: any) => {
      setPresenceMap(msg.checklists || {});
    });

    return () => {
      wsClient.unsubscribeDashboard();
      off();
    };
  }, []);

  return { presenceMap };
}
