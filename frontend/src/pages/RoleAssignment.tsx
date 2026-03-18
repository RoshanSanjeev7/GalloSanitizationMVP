import { useEffect, useState } from 'react';
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

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    await api.deleteUser(userId);
    loadUsers();
  };

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/settings')}>
          &larr; Role Assignment
        </button>

        <div className={`card ${s.centeredCard} ${s.addUserCard}`}>
          <h3 className={s.cardTitle}>Add New User</h3>
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
                className={role === 'operator' ? s.active : ''}
                onClick={() => setRole('operator')}
              >
                Operator
              </button>
              <button
                className={role === 'admin' ? s.active : ''}
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

        <div className={`card ${s.centeredCard}`}>
          <h3 className={s.cardTitleSm}>Current Users</h3>
          {users.map((u) => (
            <div key={u.id} className={s.userRow}>
              <div className={s.userInfo}>
                <Avatar name={u.name} />
                <div>
                  <h4>{u.name}</h4>
                  <p>{u.email}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className={`${s.roleToggle} ${s.roleToggleSm}`}>
                  <button
                    className={u.role === 'operator' ? s.active : ''}
                    onClick={() => handleRoleChange(u.id, 'operator')}
                  >
                    Operator
                  </button>
                  <button
                    className={u.role === 'admin' ? s.active : ''}
                    onClick={() => handleRoleChange(u.id, 'admin')}
                  >
                    Admin
                  </button>
                </div>
                <button
                  className="btn btn-outline"
                  onClick={() => handleDelete(u.id)}
                  style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--error)' }}
                  title="Delete User"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
