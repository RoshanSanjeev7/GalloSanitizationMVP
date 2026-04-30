/**
 * WsDebugPanel
 * -----------------------------------------------------------------------------
 * Floating, dev-only panel that taps `wsClient.onFrame` and shows every
 * WebSocket frame (both sent and received) with direction, timestamp,
 * type, and an expandable JSON body. Useful for poking at presence,
 * item_update, status_change, etc. without leaving the app.
 *
 * Activation (either works, state persists via localStorage):
 *   - Visit any page with `?debug=ws` to turn it on; `?debug=off` turns it off.
 *   - Press Cmd/Ctrl+Shift+W anywhere to toggle.
 */

import { useEffect, useRef, useState } from 'react';
import { wsClient } from '../services/websocket';
import s from './WsDebugPanel.module.css';

interface Frame {
  id: number;
  dir: 'in' | 'out';
  ts: number;
  type: string;
  body: unknown;
}

const MAX_FRAMES = 200;
const STORAGE_KEY = 'ws_debug';

function readEnabledFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('debug');
  if (flag === 'ws') {
    localStorage.setItem(STORAGE_KEY, '1');
    return true;
  }
  if (flag === 'off') {
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
  return localStorage.getItem(STORAGE_KEY) === '1';
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export default function WsDebugPanel() {
  const [enabled, setEnabled] = useState<boolean>(readEnabledFromUrl);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [open, setOpen] = useState<boolean>(true);
  const [filter, setFilter] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const nextId = useRef<number>(1);

  // Subscribe to the client's frame tap while the panel is enabled.
  useEffect(() => {
    if (!enabled) return;
    return wsClient.onFrame((dir, msg) => {
      const type = (msg && typeof msg === 'object' && 'type' in msg && typeof (msg as { type: unknown }).type === 'string')
        ? (msg as { type: string }).type
        : '?';
      const frame: Frame = { id: nextId.current++, dir, ts: Date.now(), type, body: msg };
      // Newest first; bounded so memory doesn't grow forever during long sessions.
      setFrames((prev) => {
        const next = [frame, ...prev];
        return next.length > MAX_FRAMES ? next.slice(0, MAX_FRAMES) : next;
      });
    });
  }, [enabled]);

  // Global toggle shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        setEnabled((prev) => {
          const next = !prev;
          if (next) localStorage.setItem(STORAGE_KEY, '1');
          else localStorage.removeItem(STORAGE_KEY);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!enabled) return null;

  const needle = filter.trim().toLowerCase();
  const visible = needle ? frames.filter((f) => f.type.toLowerCase().includes(needle)) : frames;

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const disable = () => {
    localStorage.removeItem(STORAGE_KEY);
    setEnabled(false);
  };

  return (
    <div className={s.panel}>
      <div className={s.header}>
        <span className={s.title}>WS · {visible.length}{filter ? `/${frames.length}` : ''}</span>
        <input
          className={s.filter}
          placeholder="filter type…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className={s.btn} onClick={() => setFrames([])} title="Clear log">Clear</button>
        <button className={s.btn} onClick={() => setOpen((v) => !v)} title="Collapse / expand">
          {open ? '─' : '▢'}
        </button>
        <button className={s.btn} onClick={disable} title="Close (Cmd/Ctrl+Shift+W to reopen)">×</button>
      </div>
      {open && (
        <div className={s.log}>
          {visible.length === 0 && (
            <div className={s.empty}>
              {frames.length === 0 ? 'Waiting for WebSocket frames…' : 'No frames match filter.'}
            </div>
          )}
          {visible.map((f) => {
            const isOpen = expanded.has(f.id);
            return (
              <div key={f.id} className={s.row} data-dir={f.dir}>
                <button className={s.rowHead} onClick={() => toggle(f.id)}>
                  <span className={s.arrow}>{f.dir === 'in' ? '↓' : '↑'}</span>
                  <span className={s.time}>{formatTime(f.ts)}</span>
                  <span className={s.type}>{f.type}</span>
                </button>
                {isOpen && <pre className={s.body}>{JSON.stringify(f.body, null, 2)}</pre>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
