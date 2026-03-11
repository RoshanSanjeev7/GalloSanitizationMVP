import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import api, { type Checklist, type Line } from '../services/api';
import Avatar from '../components/Avatar';
import StatusBadge from '../components/StatusBadge';
import Footer from '../components/Footer';
import Modal from '../components/Modal';
import d from '../styles/dashboard.module.css';

type Tab = 'all' | 'submitted' | 'approved' | 'in_progress';

export default function AdminDashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');
  const [lineFilter, setLineFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [cls, lns] = await Promise.all([
        api.getChecklists(),
        api.getLines(),
      ]);
      setChecklists(cls);
      setLines(lns);
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

  const confirmDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteTarget(id);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.deleteChecklist(deleteTarget);
    setChecklists((prev) => prev.filter((c) => c.id !== deleteTarget));
    setDeleteTarget(null);
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

  if (!user) return null;

  return (
    <div className="page-container">
      <div className="main-content">
        <div className={d.dashHeader}>
          <div>
            <h1 className={d.dashWelcome}>Sanitation Audit Log</h1>
            <p className={d.dashDate}>Review and approve deep clean submissions</p>
          </div>
          <Avatar name={user.name} />
        </div>

        <div className={d.adminFilterBar}>
          <input
            className="form-input"
            placeholder="Search operator or line..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            className="form-select"
            value={lineFilter}
            onChange={(e) => setLineFilter(e.target.value)}
            style={{ width: 140, flex: 'none' }}
          >
            <option value="">All Lines</option>
            {lines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
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
            { key: 'all' as Tab, label: 'All', count: counts.all },
            { key: 'submitted' as Tab, label: 'Pending', count: counts.submitted },
            { key: 'approved' as Tab, label: 'Approved', count: counts.approved },
            { key: 'in_progress' as Tab, label: 'In Progress', count: counts.in_progress },
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
              className={d.dashRow}
              onClick={() =>
                cl.status === 'submitted'
                  ? navigate(`/checklist/${cl.id}/review`)
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
                <span className={d.dashRowChevron}>&rsaquo;</span>
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
