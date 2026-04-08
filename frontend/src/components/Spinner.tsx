import s from './Spinner.module.css';

export default function Spinner({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className={s.spinnerWrapper}>
      <div className={s.spinner} />
      <span className={s.label}>{label}</span>
    </div>
  );
}
