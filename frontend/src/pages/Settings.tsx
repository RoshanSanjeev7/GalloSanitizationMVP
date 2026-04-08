import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import Avatar from '../components/Avatar';
import s from './Settings.module.css';

export default function Settings() {
  const user = useSelector((st: RootState) => st.auth.user);
  const navigate = useNavigate();

  if (!user) {
    navigate('/login');
    return null;
  }

  const homeRoute = user.role === 'admin' ? '/admin' : '/';

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate(homeRoute)}>
          &larr; Settings
        </button>

        <div className={`card ${s.profileCard}`} style={{ maxWidth: 400, margin: '0 auto' }}>
          <Avatar name={user.name} size="lg" />
          <h2>{user.name}</h2>
          <p className={s.email}>{user.email}</p>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 14px',
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 600,
              backgroundColor: 'var(--green-light)',
              color: 'var(--green)',
              border: '1px solid var(--green-border)',
            }}
          >
            {user.role === 'admin' ? 'Administrator' : 'Operator'}
          </span>
        </div>

        <div className={`card ${s.navCard}`} style={{ maxWidth: 400, margin: '16px auto 0' }}>
          <Link to={homeRoute}>Home</Link>
          {user.role === 'admin' && (
            <Link to="/settings/roles">Edit Role Assignments</Link>
          )}
        </div>
      </div>
    </div>
  );
}
