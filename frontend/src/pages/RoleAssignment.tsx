import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type UserPublic } from '../services/api';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import s from './RoleAssignment.module.css';

export default function RoleAssignment() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'operator' | 'admin'>('operator');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserPublic | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleAdd = async () => {
    if (!name || !email) return;
    setLoading(true);
    setError('');
    try {
      await api.createUser({
        name,
        email,
        password: 'changeme123',
        role,
      });
      setName('');
      setEmail('');
      setRole('operator');
      await loadUsers();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await api.deleteUser(userId);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setError((err as Error).message);
      setDeleteTarget(null);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.updateUserRole(userId, newRole);
      await loadUsers();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/settings')}>
          &larr; Role Assignment
        </button>

        {error && (
          <div style={{ maxWidth: 500, margin: '0 auto 16px', padding: '10px 14px', background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="card" style={{ maxWidth: 500, margin: '0 auto 24px' }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Add New User</h3>
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input
              className="form-input"
              placeholder="Enter full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="user@gallo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Role</label>
            <div className={s.roleToggle}>
              <button
                className={role === 'operator' ? s.roleToggleActive : ''}
                onClick={() => setRole('operator')}
              >
                Operator
              </button>
              <button
                className={role === 'admin' ? s.roleToggleActive : ''}
                onClick={() => setRole('admin')}
              >
                Administrator
              </button>
            </div>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={handleAdd}
            disabled={!name || !email || loading}
          >
            {loading ? 'Adding...' : 'Add User'}
          </button>
        </div>

        <div className="card" style={{ maxWidth: 500, margin: '0 auto' }}>
          <h3 style={{ fontSize: 15, marginBottom: 12 }}>Current Users</h3>
          {users.map((u) => (
            <div key={u.id} className={s.userRow}>
              <div className={s.userInfo}>
                <Avatar name={u.name} />
                <div>
                  <h4>{u.name}</h4>
                  <p>{u.email}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <div className={s.roleToggle} style={{ width: 180 }}>
                  <button
                    className={u.role === 'operator' ? s.roleToggleActive : ''}
                    onClick={() => handleRoleChange(u.id, 'operator')}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    Operator
                  </button>
                  <button
                    className={u.role === 'admin' ? s.roleToggleActive : ''}
                    onClick={() => handleRoleChange(u.id, 'admin')}
                    style={{ padding: '6px 12px', fontSize: 12 }}
                  >
                    Admin
                  </button>
                </div>
                <button
                  className="btn btn-red-outline btn-sm"
                  style={{ padding: '6px 10px', fontSize: 11 }}
                  onClick={() => setDeleteTarget(u)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {deleteTarget && (
        <Modal onClose={() => setDeleteTarget(null)}>
          <h2>Delete User</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Are you sure you want to delete <strong>{deleteTarget.name}</strong> ({deleteTarget.email})?
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
            This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-red-outline btn-sm" onClick={() => handleDelete(deleteTarget.id)}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
