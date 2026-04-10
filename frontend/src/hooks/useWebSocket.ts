import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { wsClient } from '../services/websocket';

export function useWebSocket() {
  const user = useSelector((s: RootState) => s.auth.user);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const unsub = wsClient.onStatusChange(() => {
      setConnected(wsClient.connected);
      setReconnecting(wsClient.reconnecting);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (user && token) {
      wsClient.connect(token);
    } else {
      wsClient.disconnect();
    }
    return () => {
      wsClient.disconnect();
    };
  }, [user]);

  return { connected, reconnecting };
}
