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

        <div className={`card ${s.profileCard} ${s.centeredCard}`}>
          <Avatar name={user.name} size="lg" />
          <h2>{user.name}</h2>
          <p className={s.email}>{user.email}</p>
          <span className={s.roleBadge}>
            {user.role === 'admin' ? 'Administrator' : 'Operator'}
          </span>
        </div>

        <div className={`card ${s.navCard} ${s.centeredCard}`}>
          <Link to={homeRoute}>Home</Link>
          {user.role === 'admin' && (
            <Link to="/settings/roles">Edit Role Assignments</Link>
          )}
        </div>
      </div>
    </div>
  );
}
