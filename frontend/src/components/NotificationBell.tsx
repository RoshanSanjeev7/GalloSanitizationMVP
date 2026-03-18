import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type NotificationItem } from '../services/api';
import s from './NotificationBell.module.css';

const POLL_INTERVAL = 10_000;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fetchCount = async () => {
    try {
      const { count } = await api.getUnreadCount();
      setUnreadCount(count);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpen = async () => {
    if (!open) {
      try {
        const items = await api.getNotifications();
        setNotifications(items);
      } catch { /* ignore */ }
    }
    setOpen(!open);
  };

  const handleClick = async (n: NotificationItem) => {
    if (!n.read) {
      api.markNotificationRead(n.id);
      setNotifications(prev => prev.map(item =>
        item.id === n.id ? { ...item, read: true } : item
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    setOpen(false);
    navigate(`/checklist/${n.checklistId}/review`);
  };

  const handleMarkAll = async () => {
    const unread = notifications.filter(n => !n.read);
    await Promise.all(unread.map(n => api.markNotificationRead(n.id)));
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  return (
    <div className={s.bellWrapper} ref={wrapperRef}>
      <button className={s.bellBtn} onClick={handleOpen} aria-label="Notifications">
        <svg className={s.bellIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className={s.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className={s.dropdown}>
          <div className={s.dropdownHeader}>
            <span className={s.dropdownTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button className={s.markAll} onClick={handleMarkAll}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className={s.empty}>No notifications</div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={`${s.notifItem} ${!n.read ? s.notifUnread : ''}`}
                onClick={() => handleClick(n)}
              >
                <div className={`${s.notifDot} ${n.read ? s.notifDotRead : ''}`} />
                <div className={s.notifContent}>
                  <div className={s.notifText}>
                    <strong>{n.operatorName}</strong> submitted <strong>{n.checklistLineName}</strong>
                  </div>
                  <div className={s.notifTime}>{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
