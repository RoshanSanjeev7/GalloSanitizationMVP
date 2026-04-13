import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import api, { type Checklist, type Line, type Factory } from '../services/api';
import Avatar from '../components/Avatar';
import StatusBadge from '../components/StatusBadge';
import Footer from '../components/Footer';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import ToastContainer from '../components/Toast';
import { usePresenceSummary } from '../hooks/usePresenceSummary';
import { useToasts } from '../hooks/useToasts';
import PresenceAvatars from '../components/PresenceAvatars';
import { wsClient } from '../services/websocket';
import type { StatusChangeMessage } from '../types/websocket';
import { formatDate, formatTime } from '../utils/format';
import { PAGE_LIMIT, NOTIF_PAGE_SIZE, POLL_INTERVAL_MS, SEARCH_DEBOUNCE_MS } from '../config/constants';
import d from '../styles/dashboard.module.css';

type Tab = 'all' | 'submitted' | 'approved' | 'in_progress';

function statusParamsForTab(tab: Tab): Record<string, string> {
  if (tab === 'submitted') return { status: 'submitted' };
  if (tab === 'approved') return { status: 'approved' };
  if (tab === 'in_progress') return { status: 'in_progress' };
  return {};
}

export default function AdminDashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const navigate = useNavigate();
  const location = useLocation();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryFilter, setFactoryFilter] = useState('');
  const [tab, setTab] = useState<Tab>('submitted');
  const [search, setSearch] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [dateFilter, setDateFilter] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<Checklist[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifHasMore, setNotifHasMore] = useState(false);
  const [notifTotal, setNotifTotal] = useState(0);
  const [notifLoadingMore, setNotifLoadingMore] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);
  const { presenceMap } = usePresenceSummary();
  const { toasts, addToast, dismissToast } = useToasts();

  const fetchNotifications = useCallback(async (offset = 0, append = false) => {
    const [submitted, inProgress] = await Promise.all([
      api.getChecklists({ status: 'submitted', limit: String(NOTIF_PAGE_SIZE), offset: String(offset) }),
      api.getChecklists({ status: 'in_progress', limit: String(NOTIF_PAGE_SIZE), offset: String(offset) }),
    ]);
    const all = [...submitted.items, ...inProgress.items];
    all.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    if (append) {
      setNotifications((prev) => [...prev, ...all]);
    } else {
      setNotifications(all);
    }
    setNotifTotal(submitted.total + inProgress.total);
    setNotifHasMore(submitted.hasMore || inProgress.hasMore);
  }, []);

  const fetchCounts = useCallback(async () => {
    const [submitted, inProgress, approved, all] = await Promise.all([
      api.getChecklists({ status: 'submitted', limit: '1' }),
      api.getChecklists({ status: 'in_progress', limit: '1' }),
      api.getChecklists({ status: 'approved', limit: '1' }),
      api.getChecklists({ limit: '1' }),
    ]);
    setCounts({
      submitted: submitted.total,
      in_progress: inProgress.total,
      approved: approved.total,
      all: all.total,
    });
  }, []);

  const fetchChecklists = useCallback(async (
    currentTab: Tab,
    currentOffset: number,
    currentSearch: string,
    currentLineFilter: string,
    append: boolean,
    currentDate?: string,
    signal?: AbortSignal,
  ) => {
    const params: Record<string, string> = {
      limit: String(PAGE_LIMIT),
      offset: String(currentOffset),
      ...statusParamsForTab(currentTab),
    };
    if (currentSearch) params.search = currentSearch;
    if (currentLineFilter) params.lineId = currentLineFilter;
    if (currentDate) params.date = currentDate;

    const res = await api.getChecklists(params, signal);
    if (signal?.aborted) return;
    if (append) {
      setChecklists((prev) => [...prev, ...res.items]);
    } else {
      setChecklists(res.items);
    }
    setTotal(res.total);
    setHasMore(res.hasMore);
  }, []);

  const loadData = useCallback(async (currentTab: Tab) => {
    setLoading(true);
    setOffset(0);
    try {
      const [, lns, , , fcts] = await Promise.all([
        fetchChecklists(currentTab, 0, search, lineFilter, false, dateFilter),
        api.getLines(),
        fetchCounts(),
        fetchNotifications(),
        api.getFactories(),
      ]);
      setLines(lns);
      setFactories(fcts);
    } catch {
      // 401 handled by api interceptor
    } finally {
      setLoading(false);
    }
  }, [fetchChecklists, fetchCounts, fetchNotifications, search, lineFilter, dateFilter]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData(tab);
  }, [user, location.key]);

  const handleTabChange = (newTab: Tab) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTab(newTab);
    setOffset(0);
    setChecklists([]);
    setLoading(true);
    fetchChecklists(newTab, 0, search, lineFilter, false, dateFilter, controller.signal)
      .catch((err) => { if (err?.name !== 'AbortError') console.error(err); })
      .finally(() => setLoading(false));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setOffset(0);
      setLoading(true);
      fetchChecklists(tab, 0, value, lineFilter, false, dateFilter, controller.signal)
        .catch((err) => { if (err?.name !== 'AbortError') console.error(err); })
        .finally(() => setLoading(false));
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleLineFilterChange = (value: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLineFilter(value);
    setOffset(0);
    setLoading(true);
    fetchChecklists(tab, 0, search, value, false, dateFilter, controller.signal)
      .catch((err) => { if (err?.name !== 'AbortError') console.error(err); })
      .finally(() => setLoading(false));
  };

  const handleDateFilterChange = (value: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setDateFilter(value);
    setOffset(0);
    setLoading(true);
    fetchChecklists(tab, 0, search, lineFilter, false, value, controller.signal)
      .catch((err) => { if (err?.name !== 'AbortError') console.error(err); })
      .finally(() => setLoading(false));
  };

  const handleLoadMore = async () => {
    const newOffset = offset + PAGE_LIMIT;
    setLoadingMore(true);
    try {
      await fetchChecklists(tab, newOffset, search, lineFilter, true, dateFilter);
      setOffset(newOffset);
    } catch {
      // handled
    } finally {
      setLoadingMore(false);
    }
  };

  const confirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteTarget(id);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.deleteChecklist(deleteTarget);
    setChecklists((prev) => prev.filter((c) => c.id !== deleteTarget));
    setTotal((prev) => prev - 1);
    setDeleteTarget(null);
    fetchCounts();
    setNotifications((prev) => prev.filter((n) => n.id !== deleteTarget));
  };

  // Sort visible items client-side (server returns newest first)
  const sorted = sortOrder === 'oldest' ? [...checklists].reverse() : checklists;

  // Close notification dropdown on click outside
  useEffect(() => {
    if (!showNotifications) return;
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifications]);

  // Auto-refresh polling every 30 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      fetchCounts();
      fetchNotifications();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, fetchCounts, fetchNotifications]);

  // Listen for WebSocket status_change events to show toast notifications
  useEffect(() => {
    const off = wsClient.on('status_change', (data) => {
      const msg = data as StatusChangeMessage;
      if (msg.status === 'submitted') {
        addToast(
          `New submission from ${msg.by} for checklist`,
          'info',
          { label: 'Review', onClick: () => navigate(`/checklist/${msg.checklistId}/review`) }
        );
        // Refresh counts and notifications
        fetchCounts();
        fetchNotifications();
      }
    });
    return off;
  }, [addToast, navigate, fetchCounts, fetchNotifications]);

  // Cleanup AbortController on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const unviewedCount = notifications.filter((n) => !n.viewedAt).length;

  if (!user) return null;

  return (
    <div className="page-container">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      <div className="main-content">
        <div className={d.dashHeader}>
          <div>
            <h1 className={d.dashWelcome}>Sanitation Audit Log</h1>
            <p className={d.dashDate}>Review and approve deep clean submissions</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={() => {
                  const opening = !showNotifications;
                  setShowNotifications(opening);
                  if (opening) {
                    fetchNotifications(0, false);
                  }
                }}
                aria-label="Notifications"
                style={{
                  width: 40, height: 40, borderRadius: '50%', border: '1px solid #e5e5e5',
                  background: showNotifications ? '#f5f5f5' : '#fff',
                  cursor: 'pointer', position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {unviewedCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 0, right: 0,
                    background: '#dc2626', color: '#fff', borderRadius: '50%',
                    minWidth: 18, height: 18, fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px', border: '2px solid #fff',
                  }}>
                    {unviewedCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div style={{
                  position: 'absolute', top: 48, right: 0, width: 360,
                  background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,.15)',
                  border: '1px solid #e5e5e5', zIndex: 100, maxHeight: 440, overflowY: 'auto',
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>Activity ({notifications.length})</span>
                    {unviewedCount > 0 && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          await api.markAllViewed();
                          // Optimistically update all items as viewed
                          const now = new Date().toISOString();
                          const name = user?.name || 'Admin';
                          setNotifications((prev) =>
                            prev.map((n) =>
                              !n.viewedAt
                                ? { ...n, viewedAt: now, viewedBy: name }
                                : n,
                            ),
                          );
                        }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--primary, #5B2333)',
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 0',
                        }}
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 && (
                    <div style={{ padding: '20px 16px', color: '#999', fontSize: 13, textAlign: 'center' }}>
                      No recent activity
                    </div>
                  )}
                  {notifications.map((n) => {
                    const isNew = !n.viewedAt;
                    return (
                    <div
                      key={n.id}
                      onClick={() => {
                        // Mark as viewed locally before navigating
                        setNotifications((prev) => prev.map((item) =>
                          item.id === n.id && !item.viewedAt
                            ? { ...item, viewedAt: new Date().toISOString(), viewedBy: user?.name || 'Admin' }
                            : item,
                        ));
                        setShowNotifications(false);
                        navigate(n.status === 'submitted' ? `/checklist/${n.id}/review` : `/checklist/${n.id}`);
                      }}
                      style={{
                        padding: '12px 16px', borderBottom: '1px solid #f5f5f5', cursor: 'pointer',
                        background: isNew ? '#fefce8' : '#fff',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isNew ? '#fefce8' : '#fff'; }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{n.lineName}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                            background: n.status === 'in_progress' ? '#dbeafe' : '#fef3c7',
                            color: n.status === 'in_progress' ? '#1d4ed8' : '#92400e',
                            whiteSpace: 'nowrap',
                          }}>
                            {n.status === 'in_progress' ? 'In Progress' : 'Pending Review'}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 3 }}>
                          {n.operatorName} &middot; {n.status === 'in_progress'
                            ? `Started ${formatDate(n.startTime)}`
                            : `Submitted ${n.submittedAt ? formatDate(n.submittedAt) : ''}`}
                        </div>
                        {n.activities && n.activities.length > 0 && (() => {
                          const latest = n.activities[n.activities.length - 1];
                          return (
                            <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 3 }}>
                              {latest.type === 'comment' && `Comment: "${(latest.detail || '').slice(0, 40)}${(latest.detail || '').length > 40 ? '...' : ''}"`}
                              {latest.type === 'image' && (latest.detail || 'Photo added')}
                              {' '}&mdash; {latest.by}
                            </div>
                          );
                        })()}
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 8 }}>
                        {n.viewedAt ? (
                          <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 500 }}>Viewed</span>
                        ) : (
                          <span style={{
                            fontSize: 10, color: '#dc2626', fontWeight: 600,
                            background: '#fef2f2', padding: '2px 6px', borderRadius: 8,
                          }}>New</span>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {notifHasMore && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const newOffset = notifications.length;
                        setNotifLoadingMore(true);
                        await fetchNotifications(newOffset, true);
                        setNotifLoadingMore(false);
                      }}
                      style={{
                        width: '100%', padding: '10px', textAlign: 'center',
                        background: 'none', border: 'none', borderTop: '1px solid #eee',
                        fontSize: 12, color: 'var(--primary, #5B2333)', fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {notifLoadingMore ? 'Loading...' : `Load more (${notifTotal - notifications.length} remaining)`}
                    </button>
                  )}
                </div>
              )}
            </div>
            <Avatar name={user.name} />
          </div>
        </div>

        <div className={d.adminFilterBar}>
          <input
            className="form-input"
            placeholder="Search operator or line..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={{ flex: 1 }}
          />
          {factories.length > 1 && (
            <select
              className="form-select"
              value={factoryFilter}
              onChange={(e) => {
                setFactoryFilter(e.target.value);
                setLineFilter('');
                handleLineFilterChange('');
              }}
              style={{ width: 160, flex: 'none' }}
            >
              <option value="">All Factories</option>
              {factories.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="form-select"
            value={lineFilter}
            onChange={(e) => handleLineFilterChange(e.target.value)}
            style={{ width: 140, flex: 'none' }}
          >
            <option value="">All Lines</option>
            {(factoryFilter ? lines.filter(l => l.factoryId === factoryFilter) : lines).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="form-input"
            value={dateFilter}
            onChange={(e) => handleDateFilterChange(e.target.value)}
            style={{ width: 150, flex: 'none' }}
          />
          <select
            className="form-select"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            style={{ width: 120, flex: 'none' }}
          >
            <option value="newest">&darr; Newest</option>
            <option value="oldest">&uarr; Oldest</option>
          </select>
        </div>

        <div className={d.dashTabs}>
          {([
            { key: 'submitted' as Tab, label: 'Pending' },
            { key: 'in_progress' as Tab, label: 'In Progress' },
            { key: 'approved' as Tab, label: 'Approved' },
            { key: 'all' as Tab, label: 'All' },
          ]).map((t) => (
            <button
              key={t.key}
              className={`${d.dashTab} ${tab === t.key ? d.dashTabActive : ''}`}
              onClick={() => handleTabChange(t.key)}
            >
              {t.label} ({counts[t.key] ?? 0})
            </button>
          ))}
        </div>

        {loading && <Spinner label="Loading checklists..." />}
        {!loading && <div className={d.dashList}>
          {sorted.map((cl) => (
            <div
              key={cl.id}
              className={d.dashRow}
              onClick={() => {
                // Mark as viewed in notifications when clicking from main list
                setNotifications((prev) => prev.map((item) =>
                  item.id === cl.id && !item.viewedAt
                    ? { ...item, viewedAt: new Date().toISOString(), viewedBy: user?.name || 'Admin' }
                    : item,
                ));
                navigate(cl.status === 'submitted'
                  ? `/checklist/${cl.id}/review`
                  : `/checklist/${cl.id}`);
              }}
            >
              <div className={d.dashRowInfo}>
                <span className={d.dashRowLine}>{cl.lineName}</span>
                <span className={d.dashRowSub}>
                  {cl.operatorName} &middot;{' '}
                  {cl.status === 'in_progress' ? (
                    <>
                      Created {formatDate(cl.startTime)} &middot; {formatTime(cl.startTime)}
                      {cl.updatedAt && (
                        <> &middot; Last edit {formatDate(cl.updatedAt)} &middot; {formatTime(cl.updatedAt)}</>
                      )}
                    </>
                  ) : (
                    <>
                      Submitted on {cl.submittedAt ? `${formatDate(cl.submittedAt)} \u00b7 ${formatTime(cl.submittedAt)}` : `${formatDate(cl.endTime || cl.startTime)} \u00b7 ${formatTime(cl.endTime || cl.startTime)}`}
                    </>
                  )}
                </span>
              </div>
              <div className={d.dashRowRight}>
                {presenceMap[cl.id] && presenceMap[cl.id].length > 0 && (
                  <PresenceAvatars users={presenceMap[cl.id]} />
                )}
                <StatusBadge status={cl.status} />
                <span className={d.dashRowChevron}>&rsaquo;</span>
              </div>
            </div>
          ))}
          {sorted.length === 0 && (
            <div className={d.dashEmpty}>
              No checklists found
            </div>
          )}
          {hasMore && (
            <button
              className={`btn btn-outline ${d.loadMoreBtn}`}
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>}
      </div>

      <Footer role="admin" />

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <h2>Delete Checklist</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
            Are you sure you want to delete this checklist? This action cannot be undone.
          </p>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-red-outline" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
