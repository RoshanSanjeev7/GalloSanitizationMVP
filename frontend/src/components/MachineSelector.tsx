import type { ChecklistMachine } from '../services/api';
import s from './MachineSelector.module.css';

interface Props {
  machines: ChecklistMachine[];
  activeMachine: number;
  onSelect: (index: number) => void;
  scrollToTop?: boolean;
}

export default function MachineSelector({ machines, activeMachine, onSelect, scrollToTop }: Props) {
  return (
    <div className={s.container}>
      {machines.map((m, idx) => {
        const total = m.categories.reduce((sum, c) => sum + c.items.length, 0);
        const done = m.categories.reduce((sum, c) => sum + c.items.filter(i => i.completed !== null).length, 0);
        const isActive = idx === activeMachine;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <button
            key={idx}
            className={`${s.button} ${isActive ? s.active : ''}`}
            onClick={() => {
              onSelect(idx);
              if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <span className={s.name}>{m.name}</span>
            <span className={s.progress}>
              {done}/{total} {pct === 100 ? '✓' : `${pct}%`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
