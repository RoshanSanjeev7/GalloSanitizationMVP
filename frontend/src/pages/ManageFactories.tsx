import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type Factory } from '../services/api';
import Modal from '../components/Modal';

export default function ManageFactories() {
  const navigate = useNavigate();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Factory | null>(null);

  useEffect(() => {
    loadFactories();
  }, []);

  const loadFactories = async () => {
    try {
      const data = await api.getFactories();
      setFactories(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCreate = async () => {
    if (!name || !location) return;
    setLoading(true);
    setError('');
    try {
      await api.createFactory({ name, location });
      setName('');
      setLocation('');
      await loadFactories();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteFactory(deleteTarget.id);
      setDeleteTarget(null);
      await loadFactories();
    } catch (err) {
      setError((err as Error).message);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/settings')}>
          &larr; Back to Settings
        </button>

        <h2 style={{ marginBottom: 20 }}>Manage Factories</h2>

        {error && (
          <div style={{ maxWidth: 500, margin: '0 auto 16px', padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="card" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Add New Factory</h3>
          <div className="form-group">
            <label className="form-label">Factory Name</label>
            <input
              className="form-input"
              placeholder="e.g. Modesto Plant"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <input
              className="form-input"
              placeholder="e.g. Modesto, CA"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={handleCreate}
            disabled={!name || !location || loading}
          >
            {loading ? 'Adding...' : 'Add Factory'}
          </button>
        </div>

        <div className="card" style={{ maxWidth: 500, margin: '0 auto' }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Current Factories</h3>
          {factories.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No factories yet.</p>
          )}
          {factories.map((f) => (
            <div
              key={f.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.location}</div>
              </div>
              <button
                className="btn btn-red-outline btn-sm"
                style={{ fontSize: 11 }}
                onClick={() => setDeleteTarget(f)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <h2>Delete Factory</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
            Lines and checklists associated with this factory will not be deleted, but they will no longer be grouped under this factory.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-red-outline btn-sm" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
