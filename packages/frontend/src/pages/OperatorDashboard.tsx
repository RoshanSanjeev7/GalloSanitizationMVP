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

type Tab = 'all' | 'in_progress' | 'submitted' | 'completed';

export default function OperatorDashboard() {
  const user = useSelector((s: RootState) => s.auth.user);
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [tab, setTab] = useState<Tab>('in_progress');
  const [showModal, setShowModal] = useState(false);
  const [selectedLine, setSelectedLine] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      const [cls, lns] = await Promise.all([
        api.getChecklists({ operatorId: user!.id }),
        api.getLines(),
      ]);
      setChecklists(cls);
      setLines(lns);
    } catch {
      // 401 handled by api interceptor
    }
  };

  const filtered = checklists.filter((c) => {
    if (tab === 'in_progress') return c.status === 'in_progress';
    if (tab === 'submitted') return c.status === 'submitted';
    if (tab === 'completed') return c.status === 'approved' || c.status === 'denied';
    return true;
  });

  const counts = {
    all: checklists.length,
    in_progress: checklists.filter((c) => c.status === 'in_progress').length,
    submitted: checklists.filter((c) => c.status === 'submitted').length,
    completed: checklists.filter((c) => c.status === 'approved' || c.status === 'denied').length,
  };

  const handleCreate = async () => {
    if (!selectedLine) return;
    await api.createChecklist({ lineId: selectedLine });
    setShowModal(false);
    setSelectedLine('');
    await loadData();
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
            { key: 'in_progress' as Tab, label: 'In Progress', count: counts.in_progress },
            { key: 'submitted' as Tab, label: 'Pending Review', count: counts.submitted },
            { key: 'completed' as Tab, label: 'Completed', count: counts.completed },
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
                  {formatDate(cl.startTime)} &middot; {formatTime(cl.startTime)}
                </span>
              </div>
              <div className={d.dashRowRight}>
                <StatusBadge status={cl.status} />
                {cl.status === 'in_progress' && (
                  <button
                    className={d.dashDelete}
                    onClick={(e) => confirmDelete(e, cl.id)}
                    title="Delete"
                  >
                    &times;
                  </button>
                )}
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
