import s from './ReconnectBanner.module.css';

export default function ReconnectBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className={s.banner}>
      <span className={s.dot} />
      Reconnecting...
    </div>
  );
}
