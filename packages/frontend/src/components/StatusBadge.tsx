import React from 'react';
import styles from './StatusBadge.module.css';

interface StatusBadgeProps {
  status: string;
}

const LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  submitted: 'Pending Review',
  approved: 'Approved',
  denied: 'Denied',
  complete: 'Complete',
  incomplete: 'Incomplete',
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = LABELS[status] || status;
  return <span className={`${styles.badge} ${styles[`badge-${status}`] || ''}`}>{label}</span>;
}
