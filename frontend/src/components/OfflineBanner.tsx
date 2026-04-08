import { useState, useEffect } from 'react';

export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      padding: '10px 16px',
      background: '#dc3545',
      color: '#fff',
      textAlign: 'center',
      fontSize: 14,
      fontWeight: 500,
    }}>
      You are offline. Changes will not be saved until you reconnect.
    </div>
  );
}
