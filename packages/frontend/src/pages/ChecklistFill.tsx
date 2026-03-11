import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { type Checklist, type ChecklistMachine } from '../services/api';
import cl from '../styles/checklist.module.css';
import s from './ChecklistFill.module.css';

export default function ChecklistFill() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [machines, setMachines] = useState<ChecklistMachine[]>([]);
  const [activeMachine, setActiveMachine] = useState(0);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [showComment, setShowComment] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const currentUser = api.getStoredUser();

  useEffect(() => {
    loadChecklist();
  }, [id]);

  const loadChecklist = async () => {
    if (!id) return;
    const data = await api.getChecklist(id);
    setChecklist(data);
    setMachines(data.machines);
  };

  const setItemStatus = (catIdx: number, itemIdx: number, completed: boolean) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return {
          ...m,
          categories: m.categories.map((c, ci) => {
            if (ci !== catIdx) return c;
            return {
              ...c,
              items: c.items.map((item, ii) => {
                if (ii !== itemIdx) return item;
                const newStatus = item.completed === completed ? null : completed;
                return {
                  ...item,
                  completed: newStatus,
                  completedBy: newStatus !== null ? (currentUser?.name || 'Unknown') : null,
                  completedAt: newStatus !== null ? new Date().toISOString() : null,
                };
              }),
            };
          }),
        };
      })
    );
  };

  const itemKey = (catIdx: number, itemIdx: number) =>
    `${activeMachine}-${catIdx}-${itemIdx}`;

  const collapseKey = (catIdx: number) => `${activeMachine}-${catIdx}`;

  const toggleCollapse = (catIdx: number) => {
    const key = collapseKey(catIdx);
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleComment = (catIdx: number, itemIdx: number) => {
    const key = itemKey(catIdx, itemIdx);
    setShowComment((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setCommentText = (catIdx: number, itemIdx: number, text: string) => {
    const key = itemKey(catIdx, itemIdx);
    setCommentInputs((prev) => ({ ...prev, [key]: text }));
  };

  const buildMachines = (): ChecklistMachine[] => {
    return machines.map((machine, mi) => ({
      ...machine,
      categories: machine.categories.map((cat, catIdx) => ({
        ...cat,
        items: cat.items.map((item, itemIdx) => {
          const key = `${mi}-${catIdx}-${itemIdx}`;
          return {
            ...item,
            issue: showComment[key] ? commentInputs[key] || item.issue : item.issue,
          };
        }),
      })),
    }));
  };

  const handleSave = async () => {
    if (!id) return;
    await api.updateChecklistItems(id, buildMachines());
    navigate('/');
  };

  const handleSubmit = async () => {
    if (!id) return;
    await api.updateChecklistItems(id, buildMachines());
    await api.submitChecklist(id);
    navigate('/');
  };

  if (!checklist || machines.length === 0) {
    return (
      <div className="page-container">
        <div className="main-content">Loading...</div>
      </div>
    );
  }

  const currentMachine = machines[activeMachine];

  const formatStamp = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/')}>
          &larr; Back
        </button>

        <h2 style={{ marginBottom: 4 }}>{checklist.lineName} &mdash; Deep Clean</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          {checklist.operatorName} &middot; Started{' '}
          {new Date(checklist.startTime).toLocaleString()}
        </p>

        <select
          className="form-select"
          value={activeMachine}
          onChange={(e) => setActiveMachine(Number(e.target.value))}
          style={{ marginBottom: 16 }}
        >
          {machines.map((m, idx) => {
            const total = m.categories.reduce((sum, c) => sum + c.items.length, 0);
            const done = m.categories.reduce((sum, c) => sum + c.items.filter(i => i.completed !== null).length, 0);
            return (
              <option key={idx} value={idx}>
                {m.name} ({done}/{total})
              </option>
            );
          })}
        </select>

        {currentMachine.categories.map((cat, catIdx) => {
          const isCollapsed = collapsed[collapseKey(catIdx)] ?? false;
          const doneCount = cat.items.filter((i) => i.completed !== null).length;

          return (
            <div key={catIdx} className={cl.fillCategory}>
              <button
                className={cl.fillCategoryHeader}
                onClick={() => toggleCollapse(catIdx)}
              >
                <div className={cl.fillCategoryLeft}>
                  <span className={`${cl.fillChevron} ${isCollapsed ? '' : cl.fillChevronOpen}`}>
                    &#9654;
                  </span>
                  <span className={cl.fillCategoryName}>{cat.name}</span>
                </div>
                <span className={cl.fillCategoryCount}>
                  {doneCount}/{cat.items.length}
                </span>
              </button>

              {!isCollapsed &&
                cat.items.map((item, itemIdx) => {
                  const key = itemKey(catIdx, itemIdx);

                  return (
                    <div key={itemIdx} className={s.fillItem}>
                      <div className={s.fillItemRow}>
                        <div className={s.fillItemDesc}>
                          <span className={s.fillItemNum}>{itemIdx + 1}.</span>
                          <span className={s.fillItemText}>{item.description}</span>
                        </div>
                        <div className={s.fillItemActions}>
                          <button
                            className={`${s.fillBtn} ${item.completed === true ? s.fillBtnDoneActive : ''}`}
                            onClick={() => setItemStatus(catIdx, itemIdx, true)}
                            title="Mark as done"
                          >
                            &#10003;
                          </button>
                          <button
                            className={`${s.fillBtn} ${item.completed === false ? s.fillBtnSkipActive : ''}`}
                            onClick={() => setItemStatus(catIdx, itemIdx, false)}
                            title="Mark with issue"
                          >
                            &#10005;
                          </button>
                        </div>
                      </div>

                      <div className={s.fillItemFooter}>
                        {item.completed !== null && item.completedBy && (
                          <span className={cl.fillStamp}>
                            {item.completedBy}{item.completedAt ? ` at ${formatStamp(item.completedAt)}` : ''}
                          </span>
                        )}
                        <button
                          className={s.fillCommentToggle}
                          onClick={() => toggleComment(catIdx, itemIdx)}
                        >
                          {showComment[key] ? 'Hide comment' : '+ Add comment'}
                        </button>
                      </div>

                      {showComment[key] && (
                        <input
                          className={s.fillCommentInput}
                          placeholder="Leave a comment..."
                          value={commentInputs[key] ?? item.issue ?? ''}
                          onChange={(e) => setCommentText(catIdx, itemIdx, e.target.value)}
                        />
                      )}

                      {item.issue && !showComment[key] && (
                        <div className={s.fillCommentBox}>
                          <strong>Comment:</strong> {item.issue}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}

        {machines.length > 1 && (
          <div className={s.machineNav}>
            <button
              className={s.machineNavBtn}
              onClick={() => setActiveMachine((prev) => prev - 1)}
              disabled={activeMachine === 0}
            >
              &larr; {activeMachine > 0 ? machines[activeMachine - 1].name : ''}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {activeMachine + 1} / {machines.length}
            </span>
            <button
              className={s.machineNavBtn}
              onClick={() => setActiveMachine((prev) => prev + 1)}
              disabled={activeMachine === machines.length - 1}
            >
              {activeMachine < machines.length - 1 ? machines[activeMachine + 1].name : ''} &rarr;
            </button>
          </div>
        )}

        <div className="action-buttons" style={{ marginBottom: 40, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Submit Checklist
          </button>
          <button className="btn btn-outline" onClick={handleSave}>
            Save &amp; Exit
          </button>
        </div>
      </div>
    </div>
  );
}
