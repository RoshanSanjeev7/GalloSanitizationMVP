import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type UserPublic } from '../services/api';
import Avatar from '../components/Avatar';
import s from './RoleAssignment.module.css';

export default function RoleAssignment() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserPublic[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'operator' | 'admin'>('operator');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const data = await api.getUsers();
    setUsers(data);
  };

  const handleAdd = async () => {
    if (!name || !email) return;
    await api.createUser({
      name,
      email,
      password: 'changeme123',
      role,
    });
    setName('');
    setEmail('');
    setRole('operator');
    loadUsers();
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    await api.updateUserRole(userId, newRole);
    loadUsers();
  };

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/settings')}>
          &larr; Role Assignment
        </button>

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
                className={role === 'operator' ? 'active' : ''}
                onClick={() => setRole('operator')}
              >
                Operator
              </button>
              <button
                className={role === 'admin' ? 'active' : ''}
                onClick={() => setRole('admin')}
              >
                Administrator
              </button>
            </div>
          </div>
          <button
            className="btn btn-primary btn-block"
            onClick={handleAdd}
            disabled={!name || !email}
          >
            Add User
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
              <div className={s.roleToggle} style={{ width: 180 }}>
                <button
                  className={u.role === 'operator' ? 'active' : ''}
                  onClick={() => handleRoleChange(u.id, 'operator')}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  Operator
                </button>
                <button
                  className={u.role === 'admin' ? 'active' : ''}
                  onClick={() => handleRoleChange(u.id, 'admin')}
                  style={{ padding: '6px 12px', fontSize: 12 }}
                >
                  Admin
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
