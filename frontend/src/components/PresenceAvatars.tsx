import s from './PresenceAvatars.module.css';

interface PresenceUser {
  name: string;
  [key: string]: unknown;
}

interface Props {
  users: PresenceUser[];
  max?: number;
  label?: boolean;
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const COLORS = ['#5B2333', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#dc2626'];

export default function PresenceAvatars({ users, max = 3, label = false }: Props) {
  if (users.length === 0) return null;

  const visible = users.slice(0, max);
  const overflow = users.length - max;

  return (
    <div className={s.container}>
      <div className={s.avatars}>
        {visible.map((u, i) => (
          <div
            key={u.name}
            className={s.avatar}
            style={{ backgroundColor: COLORS[i % COLORS.length], zIndex: max - i }}
            title={u.name}
          >
            {getInitials(u.name)}
          </div>
        ))}
        {overflow > 0 && (
          <div className={s.avatar} style={{ backgroundColor: '#6b7280', zIndex: 0 }}>
            +{overflow}
          </div>
        )}
      </div>
      {label && users.length > 0 && (
        <span className={s.label}>
          {users.length === 1
            ? `${users[0].name} also editing`
            : `${users.length} others editing`}
        </span>
      )}
    </div>
  );
}
