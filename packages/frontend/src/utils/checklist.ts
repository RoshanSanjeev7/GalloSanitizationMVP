import type { ChecklistMachine } from '../services/api';

export const STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  submitted: 'Submitted',
  approved: 'Approved',
  denied: 'Denied',
};

export const formatTime = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

export const formatStamp = (iso: string) => formatTime(new Date(iso));

export const formatDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export const formatFullDate = (d: Date) =>
  d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

export const formatDateTime = (d: Date) =>
  `${d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}, ${formatTime(d)}`;

export const statusColor = (completed: boolean | null) =>
  completed === true ? 'var(--green)' : completed === false ? 'var(--red)' : 'var(--text-muted)';

export const statusIcon = (completed: boolean | null) =>
  completed === true ? '\u2713' : completed === false ? '\u2717' : '\u2014';

export const itemKey = (activeMachine: number, catIdx: number, itemIdx: number) =>
  `${activeMachine}-${catIdx}-${itemIdx}`;

export const collapseKey = (activeMachine: number, catIdx: number) =>
  `${activeMachine}-${catIdx}`;

/** Immutably update a single item within the nested machines > categories > items structure. */
export function updateMachineItem(
  machines: ChecklistMachine[],
  activeMachine: number,
  catIdx: number,
  itemIdx: number,
  updater: (item: ChecklistMachine['categories'][0]['items'][0]) => ChecklistMachine['categories'][0]['items'][0],
): ChecklistMachine[] {
  return machines.map((m, mi) => {
    if (mi !== activeMachine) return m;
    return {
      ...m,
      categories: m.categories.map((c, ci) => {
        if (ci !== catIdx) return c;
        return {
          ...c,
          items: c.items.map((item, ii) => (ii !== itemIdx ? item : updater(item))),
        };
      }),
    };
  });
}
