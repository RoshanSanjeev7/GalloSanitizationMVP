import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loginUser, clearError } from '../store/slices/authSlice';
import type { RootState, AppDispatch } from '../store';
import s from './Login.module.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { loading, error } = useSelector((st: RootState) => st.auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(clearError());
    const result = await dispatch(loginUser({ email, password }));
    if (loginUser.fulfilled.match(result)) {
      const user = result.payload;
      navigate(user.role === 'admin' ? '/admin' : '/');
    }
  };

  return (
    <div className={s.loginPage}>
      <div className={`card ${s.loginCard}`}>
        <h1>Sign In</h1>
        <p className={s.subtitle}>Bottling Sanitation Hub</p>

        {error && <p className={s.error}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="user@gallo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <a href="#" className={s.forgotLink}>Forgot password?</a>
        <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '8px', border: '1px solid #eee', fontSize: '14px', textAlign: 'left' }}>
          <strong>Demo Accounts:</strong>
          <ul style={{ margin: '10px 0 0', paddingLeft: '20px', color: '#555' }}>
            <li>Admin: <code>ymartinez@gallo.com</code> / <code>admin123</code></li>
            <li>Operator: <code>gsanchez@gallo.com</code> / <code>operator123</code></li>
            <li>Operator 2: <code>mrivera@gallo.com</code> / <code>operator123</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
