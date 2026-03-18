import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import api, { type Checklist, type Line, type NotificationItem } from '../services/api';
import Avatar from '../components/Avatar';
import StatusBadge from '../components/StatusBadge';
import NotificationBell from '../components/NotificationBell';
import Footer from '../components/Footer';
import d from '../styles/dashboard.module.css';

type Tab = 'all' | 'submitted' | 'approved' | 'in_progress';

export default function AdminDashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<Tab>('submitted');
  const [search, setSearch] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();

    // Poll for live updates every 5 seconds
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const loadData = async () => {
    try {
      const [cls, lns, notifs] = await Promise.all([
        api.getChecklists(),
        api.getLines(),
        api.getNotifications(),
      ]);
      setChecklists(cls);
      setLines(lns);
      setNotifications(notifs);
    } catch {
      // 401 handled by api interceptor
    }
  };

  let filtered = checklists.filter((c) => {
    if (tab === 'submitted') return c.status === 'submitted';
    if (tab === 'approved') return c.status === 'approved';
    if (tab === 'in_progress') return c.status === 'in_progress';
    return true;
  });

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        c.operatorName.toLowerCase().includes(q) ||
        c.lineName.toLowerCase().includes(q)
    );
  }

  if (lineFilter) {
    filtered = filtered.filter((c) => c.lineId === lineFilter);
  }

  if (sortOrder === 'oldest') {
    filtered = [...filtered].reverse();
  }

  const counts = {
    all: checklists.length,
    submitted: checklists.filter((c) => c.status === 'submitted').length,
    approved: checklists.filter((c) => c.status === 'approved').length,
    in_progress: checklists.filter((c) => c.status === 'in_progress').length,
  };

  const unreadChecklistIds = new Set(
    notifications.filter((n) => !n.read).map((n) => n.checklistId)
  );

  const handleRowClick = async (cl: Checklist) => {
    const unreadNotif = notifications.find(
      (n) => n.checklistId === cl.id && !n.read
    );
    if (unreadNotif) {
      api.markNotificationRead(unreadNotif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === unreadNotif.id ? { ...n, read: true } : n))
      );
    }
    navigate(
      cl.status === 'submitted'
        ? `/checklist/${cl.id}/review`
        : `/checklist/${cl.id}`
    );
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this checklist?')) return;
    try {
      await api.deleteChecklist(id);
      await loadData();
    } catch {
      alert('Failed to delete checklist');
    }
  };

  const formatDate = (iso: string) => {
    const dt = new Date(iso);
    return dt.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (iso: string) => {
    const dt = new Date(iso);
    return dt.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getProgress = (c: Checklist) => {
    let total = 0, done = 0;
    for (const m of c.machines) {
      for (const cat of m.categories) {
        total += cat.items.length;
        done += cat.items.filter(i => i.completed !== null).length;
      }
    }
    return { done, total };
  };

  if (!user) return null;

  return (
    <div className="page-container">
      <div className="main-content">
        <div className={d.dashHeader}>
          <div>
            <h1 className={d.dashWelcome}>Sanitation Audit Log</h1>
            <p className={d.dashDate}>Review and approve deep clean submissions</p>
          </div>
          <div className={d.dashHeaderRight}>
            <NotificationBell />
            <Avatar name={user.name} />
          </div>
        </div>

        <div className={d.adminFilterBar}>
          <input
            className={`form-input ${d.adminFilterInput}`}
            placeholder="Search operator or line..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={`form-select ${d.adminFilterLine}`}
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
          >
            <option value="">All Lines</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            className={`form-select ${d.adminFilterSort}`}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="newest">&darr; Newest</option>
            <option value="oldest">&uarr; Oldest</option>
          </select>
        </div>

        <div className={d.dashTabs}>
          {([
            { key: 'submitted' as Tab, label: 'Pending', count: counts.submitted },
            { key: 'in_progress' as Tab, label: 'In Progress', count: counts.in_progress },
            { key: 'approved' as Tab, label: 'Approved', count: counts.approved },
            { key: 'all' as Tab, label: 'All', count: counts.all },
          ]).map((t) => (
            <button
              key={t.key}
              className={`${d.dashTab} ${tab === t.key ? d.dashTabActive : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        <div className={d.dashList}>
          {filtered.map((cl) => (
            <div
              key={cl.id}
              className={`${d.dashRow} ${unreadChecklistIds.has(cl.id) ? d.dashRowUnread : ''}`}
              onClick={() => handleRowClick(cl)}
            >
              <div className={d.dashRowInfo}>
                {unreadChecklistIds.has(cl.id) && <span className={d.unreadDot} />}
                <span className={d.dashRowLine}>{cl.lineName}</span>
                <span className={d.dashRowSub}>
                  {cl.operatorName} &middot; {formatDate(cl.startTime)} &middot; {formatTime(cl.startTime)}
                </span>
              </div>
              <div className={d.dashRowRight}>
                <span className={d.dashRowProgress}>
                  {getProgress(cl).done}/{getProgress(cl).total}
                </span>
                <StatusBadge status={cl.status} />
                <button
                  className={d.dashDelete}
                  onClick={(e) => handleDelete(e, cl.id)}
                  title="Delete checklist"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className={d.dashEmpty}>
              No checklists found
            </div>
          )}
        </div>
      </div>

      <Footer role="admin" />
    </div>
  );
}
