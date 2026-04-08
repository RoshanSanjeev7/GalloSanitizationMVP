import { useState, useEffect } from 'react';
import s from './Spinner.module.css';

export default function Spinner({ label = 'Loading...', delay = 300 }: { label?: string; delay?: number }) {
  const [show, setShow] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!show) return null;

  return (
    <div className={s.spinnerWrapper}>
      <div className={s.spinner} />
      <span className={s.label}>{label}</span>
    </div>
  );
}
