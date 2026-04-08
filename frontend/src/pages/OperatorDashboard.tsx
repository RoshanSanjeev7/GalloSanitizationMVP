import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import api, { type Checklist, type Line } from '../services/api';
import Avatar from '../components/Avatar';
import StatusBadge from '../components/StatusBadge';
import Footer from '../components/Footer';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import d from '../styles/dashboard.module.css';

type Tab = 'all' | 'in_progress' | 'submitted' | 'completed';

const PAGE_LIMIT = 20;

function statusParamsForTab(tab: Tab): Record<string, string> {
  if (tab === 'in_progress') return { status: 'in_progress' };
  if (tab === 'submitted') return { status: 'submitted' };
  if (tab === 'completed') return { status: 'approved,denied' };
  return {};
}

export default function OperatorDashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<Tab>('in_progress');
  const [showModal, setShowModal] = useState(false);
  const [selectedLine, setSelectedLine] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const fetchCounts = useCallback(async () => {
    const [inProgress, submitted, completed, all] = await Promise.all([
      api.getChecklists({ status: 'in_progress', limit: '1' }),
      api.getChecklists({ status: 'submitted', limit: '1' }),
      api.getChecklists({ status: 'approved,denied', limit: '1' }),
      api.getChecklists({ limit: '1' }),
    ]);
    setCounts({
      in_progress: inProgress.total,
      submitted: submitted.total,
      completed: completed.total,
      all: all.total,
    });
  }, []);

  const fetchChecklists = useCallback(async (currentTab: Tab, currentOffset: number, append: boolean) => {
    const params: Record<string, string> = {
      limit: String(PAGE_LIMIT),
      offset: String(currentOffset),
      ...statusParamsForTab(currentTab),
    };
    const res = await api.getChecklists(params);
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
      const [, lns] = await Promise.all([
        fetchChecklists(currentTab, 0, false),
        api.getLines(),
        fetchCounts(),
      ]);
      setLines(lns);
    } catch {
      // 401 handled by api interceptor
    } finally {
      setLoading(false);
    }
  }, [fetchChecklists, fetchCounts]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData(tab);
  }, [user]);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    setOffset(0);
    setChecklists([]);
    setLoading(true);
    fetchChecklists(newTab, 0, false)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleLoadMore = async () => {
    const newOffset = offset + PAGE_LIMIT;
    setLoadingMore(true);
    try {
      await fetchChecklists(tab, newOffset, true);
      setOffset(newOffset);
    } catch {
      // handled
    } finally {
      setLoadingMore(false);
    }
  };

  // Sort is handled server-side (newest first by default)
  // For "oldest", the operator dashboard doesn't have a sort toggle, so we just use server order

  const handleCreate = async () => {
    if (!selectedLine) return;
    await api.createChecklist({ lineId: selectedLine });
    setShowModal(false);
    setSelectedLine('');
    await loadData(tab);
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

  const now = new Date();
  const greeting = `${now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`;

  if (!user) return null;

  return (
    <div className="page-container">
      <div className="main-content">
        <div className={d.dashHeader}>
          <div>
            <h1 className={d.dashWelcome}>Welcome, {user.name.split(' ')[0]}</h1>
            <p className={d.dashDate}>{greeting}</p>
          </div>
          <Avatar name={user.name} />
        </div>

        <div className={d.dashTabs}>
          {([
            { key: 'in_progress' as Tab, label: 'In Progress' },
            { key: 'submitted' as Tab, label: 'Pending Review' },
            { key: 'completed' as Tab, label: 'Completed' },
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
          {checklists.map((cl) => (
            <div
              key={cl.id}
              className={d.dashRow}
              onClick={() =>
                cl.status === 'in_progress'
                  ? navigate(`/checklist/${cl.id}/fill`)
                  : navigate(`/checklist/${cl.id}`)
              }
            >
              <div className={d.dashRowInfo}>
                <span className={d.dashRowLine}>{cl.lineName}</span>
                <span className={d.dashRowSub}>
                  {cl.operatorName} &middot; {formatDate(cl.startTime)} &middot; {formatTime(cl.startTime)}
                </span>
              </div>
              <div className={d.dashRowRight}>
                <StatusBadge status={cl.status} />
              </div>
            </div>
          ))}
          {checklists.length === 0 && (
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

      <Footer role="operator" onAddChecklist={() => setShowModal(true)} />

      {showModal && (
        <Modal onClose={() => setShowModal(false)}>
          <h2>New Checklist</h2>
          <p className="form-label">Select Production Line</p>
          <select
            className="form-select"
            value={selectedLine}
            onChange={(e) => setSelectedLine(e.target.value)}
          >
            <option value="">&mdash; Choose a line &mdash;</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setShowModal(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={!selectedLine}
            >
              Create
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
