import { useEffect } from 'react';
import { TOAST_DISMISS_MS } from '../config/constants';
import s from './Toast.module.css';

export interface ToastData {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  action?: { label: string; onClick: () => void };
}

interface Props {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className={s.container}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, TOAST_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`${s.toast} ${s[toast.type]}`}>
      <div className={s.content}>
        <span className={s.message}>{toast.message}</span>
        {toast.action && (
          <button className={s.action} onClick={toast.action.onClick}>
            {toast.action.label}
          </button>
        )}
      </div>
      <button className={s.close} onClick={onDismiss}>&times;</button>
    </div>
  );
}
