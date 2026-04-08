import React from 'react';
import styles from './Avatar.module.css';

interface AvatarProps {
  name: string;
  size?: 'sm' | 'lg';
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Avatar({ name, size }: AvatarProps) {
  const cls = size === 'lg' ? `${styles.avatar} ${styles.avatarLg}` : styles.avatar;
  return <div className={cls}>{getInitials(name)}</div>;
}
