import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import type { AppDispatch } from '../store';
import styles from './Footer.module.css';

interface FooterProps {
  role: 'operator' | 'admin';
  onAddChecklist?: () => void;
}

export default function Footer({ role, onAddChecklist }: FooterProps) {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  return (
    <div className={styles.footerBar}>
      <Link to="/settings">&#9881; Settings</Link>
      {role === 'operator' ? (
        <button onClick={onAddChecklist} style={{ fontWeight: 600 }}>
          + Add Checklist
        </button>
      ) : (
        <Link to="/templates/create" style={{ fontWeight: 600 }}>
          + Create Template
        </Link>
      )}
      <button onClick={handleLogout}>&rarr; Log Out</button>
    </div>
  );
}
