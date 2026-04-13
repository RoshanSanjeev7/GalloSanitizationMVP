import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import api, { type AuditEntry } from '../services/api';
import Spinner from '../components/Spinner';
import d from '../styles/dashboard.module.css';

const PAGE_LIMIT = 25;

const ACTION_LABELS: Record<string, string> = {
  checklist_created: 'Checklist Created',
  checklist_submitted: 'Checklist Submitted',
  checklist_approved: 'Checklist Approved',
  checklist_denied: 'Checklist Denied',
  checklist_deleted: 'Checklist Deleted',
  user_created: 'User Created',
  user_role_changed: 'Role Changed',
  user_deleted: 'User Deleted',
  template_created: 'Template Created',
  template_updated: 'Template Updated',
  template_deleted: 'Template Deleted',
};

const ACTION_COLORS: Record<string, string> = {
  checklist_approved: '#16a34a',
  checklist_denied: '#dc2626',
  checklist_deleted: '#dc2626',
  user_deleted: '#dc2626',
  template_deleted: '#dc2626',
  checklist_submitted: '#2563eb',
  checklist_created: '#6b7280',
  user_created: '#6b7280',
  template_created: '#6b7280',
  template_updated: '#d97706',
  user_role_changed: '#d97706',
};

export default function AuditLog() {
  const user = useSelector((s: RootState) => s.auth.user);
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const fetchLogs = useCallback(async (currentOffset: number, currentAction: string, currentDate: string, append: boolean) => {
    const params: Record<string, string> = {
      limit: String(PAGE_LIMIT),
      offset: String(currentOffset),
    };
    if (currentAction) params.action = currentAction;
    if (currentDate) {
      params.startDate = `${currentDate}T00:00:00.000Z`;
      params.endDate = `${currentDate}T23:59:59.999Z`;
    }

    const res = await api.getAuditLogs(params);
    if (append) {
      setEntries((prev) => [...prev, ...res.items]);
    } else {
      setEntries(res.items);
    }
    setTotal(res.total);
    setHasMore(res.hasMore);
  }, []);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.role !== 'admin') { navigate('/'); return; }
    setLoading(true);
    fetchLogs(0, actionFilter, dateFilter, false)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const handleActionChange = (value: string) => {
    setActionFilter(value);
    setOffset(0);
    setLoading(true);
    fetchLogs(0, value, dateFilter, false)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleDateChange = (value: string) => {
    setDateFilter(value);
    setOffset(0);
    setLoading(true);
    fetchLogs(0, actionFilter, value, false)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleLoadMore = async () => {
    const newOffset = offset + PAGE_LIMIT;
    setOffset(newOffset);
    await fetchLogs(newOffset, actionFilter, dateFilter, true);
  };

  const formatTimestamp = (ts: string) => {
    const dt = new Date(ts);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  if (!user) return null;

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/settings')}>
          &larr; Back to Settings
        </button>

        <h1 style={{ marginBottom: 4 }}>Audit Log</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          Track all actions across the system ({total} entries)
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <select
            className="form-select"
            value={actionFilter}
            onChange={(e) => handleActionChange(e.target.value)}
            style={{ width: 200 }}
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <input
            type="date"
            className="form-input"
            value={dateFilter}
            onChange={(e) => handleDateChange(e.target.value)}
            style={{ width: 160 }}
          />
          {(actionFilter || dateFilter) && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => { handleActionChange(''); setDateFilter(''); handleDateChange(''); }}
              style={{ alignSelf: 'center' }}
            >
              Clear Filters
            </button>
          )}
        </div>

        {loading && <Spinner label="Loading audit log..." />}

        {!loading && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Time</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>User</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Action</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '10px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>
                      {formatTimestamp(e.timestamp)}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontWeight: 500 }}>{e.userName}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{e.userRole}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#fff',
                        background: ACTION_COLORS[e.action] || '#6b7280',
                      }}>
                        {ACTION_LABELS[e.action] || e.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                      {e.detail}
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No audit entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button className="btn btn-outline" onClick={handleLoadMore}>
              Load More
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
