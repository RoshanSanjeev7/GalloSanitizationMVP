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
  const [showConfirm, setShowConfirm] = useState(false);

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

  const handleCreateClick = () => {
    if (!selectedLine) return;
    setShowConfirm(true);
  };

  const handleCreateConfirm = async () => {
    if (!selectedLine) return;
    await api.createChecklist({ lineId: selectedLine });
    setShowConfirm(false);
    setShowModal(false);
    setSelectedLine('');
    await loadData();
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
            <h1 className={d.dashWelcome}>Welcome, {user.name?.split(' ')[0] || 'User'}</h1>
            <p className={d.dashDate}>{greeting}</p>
          </div>
          <Avatar name={user.name || 'User'} />
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
                <span className={d.dashRowProgress}>
                  {getProgress(cl).done}/{getProgress(cl).total}
                </span>
                <StatusBadge status={cl.status} />
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
              onClick={handleCreateClick}
              disabled={!selectedLine}
            >
              Create
            </button>
          </div>
        </Modal>
      )}

      {showConfirm && (
        <Modal onClose={() => setShowConfirm(false)}>
          <h2>Confirm New Checklist</h2>
          <p className={d.modalConfirmText}>
            Are you sure you want to create a new checklist for{' '}
            <strong>{lines.find((l) => l.id === selectedLine)?.name}</strong>?
          </p>
          <div className="modal-actions">
            <button className="btn btn-outline" onClick={() => setShowConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleCreateConfirm}>
              Yes, Create
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
