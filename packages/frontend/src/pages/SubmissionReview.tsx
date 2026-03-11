import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { type Checklist } from '../services/api';
import cl from '../styles/checklist.module.css';
import s from './SubmissionReview.module.css';

export default function SubmissionReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [activeMachine, setActiveMachine] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id) api.getChecklist(id).then(setChecklist);
  }, [id]);

  const handleApprove = async () => {
    if (!id) return;
    await api.approveChecklist(id);
    navigate('/admin');
  };

  const handleDeny = async () => {
    if (!id) return;
    await api.denyChecklist(id);
    navigate('/admin');
  };

  if (!checklist) {
    return (
      <div className="page-container">
        <div className="main-content">Loading...</div>
      </div>
    );
  }

  const allItems = checklist.machines.flatMap((m) =>
    m.categories.flatMap((c) => c.items)
  );
  const completeCount = allItems.filter((i) => i.completed !== null).length;
  const incompleteCount = allItems.length - completeCount;

  const start = new Date(checklist.startTime);
  const end = checklist.endTime ? new Date(checklist.endTime) : null;
  const durationMs = end ? end.getTime() - start.getTime() : 0;
  const durationMin = Math.round(durationMs / 60000);

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const machineStats = checklist.machines.map((m) => {
    const items = m.categories.flatMap((c) => c.items);
    return {
      name: m.name,
      total: items.length,
      done: items.filter((i) => i.completed !== null).length,
    };
  });

  const allNotes = checklist.machines.flatMap((m) =>
    m.categories.flatMap((c) =>
      c.items
        .filter((i) => i.issue)
        .map((i) => ({
          machine: m.name,
          task: i.description,
          note: i.issue!,
          completedBy: i.completedBy,
        }))
    )
  );

  const currentMachine = checklist.machines[activeMachine];

  const collapseKey = (catIdx: number) => `${activeMachine}-${catIdx}`;

  const toggleCollapse = (catIdx: number) => {
    const key = collapseKey(catIdx);
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/admin')}>
          &larr; Back
        </button>

        <h2 style={{ marginBottom: 2 }}>
          {checklist.lineName} - Submission Review
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          {formatDate(start)} - {formatTime(start)}
        </p>

        <select
          className="form-select"
          value={activeMachine}
          onChange={(e) => setActiveMachine(Number(e.target.value))}
          style={{ marginBottom: 16 }}
        >
          {checklist.machines.map((m, idx) => (
            <option key={idx} value={idx}>
              {m.name}
            </option>
          ))}
        </select>

        <div className={s.reviewLayout}>
          <div>
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
                    cat.items.map((item, itemIdx) => (
                      <div key={itemIdx} className={cl.fillTask}>
                        <div className={cl.fillTaskLeft}>
                          <div className={cl.fillTaskContent}>
                            <span className={cl.fillTaskText}>{item.description}</span>
                            {item.completed !== null && item.completedBy && (
                              <span className={cl.fillStamp}>
                                {item.completedBy}
                                {item.completedAt
                                  ? ` at ${new Date(item.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                                  : ''}
                              </span>
                            )}
                            {item.issue && (
                              <div className={cl.issueBox} style={{ marginTop: 4, padding: '6px 10px', fontSize: 12 }}>
                                <strong>Issue Reported</strong>
                                {item.issue}
                              </div>
                            )}
                          </div>
                        </div>
                        <span
                          className={cl.fillTaskStatus}
                          style={{ color: item.completed === true ? 'var(--green)' : item.completed === false ? 'var(--red)' : 'var(--text-muted)' }}
                        >
                          {item.completed === true ? '\u2713' : item.completed === false ? '\u2717' : '\u2014'}
                        </span>
                      </div>
                    ))}
                </div>
              );
            })}

            <div className="action-buttons">
              <button className="btn btn-red-outline" onClick={handleDeny}>
                Deny
              </button>
              <button className="btn btn-green" onClick={handleApprove}>
                Approve
              </button>
            </div>
          </div>

          <div>
            <div className={s.summaryPanel}>
              <h3>Summary</h3>
              <div className={s.summaryRow}>
                <span className={s.label}>Operator</span>
                <span className={s.value}>{checklist.operatorName}</span>
              </div>
              <div className={s.summaryRow}>
                <span className={s.label}>Start</span>
                <span className={s.value}>{formatTime(start)}</span>
              </div>
              {end && (
                <div className={s.summaryRow}>
                  <span className={s.label}>End</span>
                  <span className={s.value}>{formatTime(end)}</span>
                </div>
              )}
              <div className={s.summaryRow}>
                <span className={s.label}>Duration</span>
                <span className={s.value}>{durationMin} min</span>
              </div>
              <div className={s.summaryRow}>
                <span className={s.label}>Status</span>
                <span className={s.value} style={{ textTransform: 'capitalize' }}>
                  {checklist.status === 'submitted' ? 'Submitted' : checklist.status}
                </span>
              </div>
            </div>

            <div className={s.completionPanel}>
              <h3>Completion</h3>
              <div className={s.completionStat}>
                <span className={s.statComplete}>&#10003; Filled</span>
                <span className={s.statComplete}>{completeCount}</span>
              </div>
              <div className={s.completionStat}>
                <span className={s.statIncomplete}>&#10005; Unfilled</span>
                <span className={s.statIncomplete}>{incompleteCount}</span>
              </div>
            </div>

            <div className={s.machinePanel}>
              <h3>Machine Progress</h3>
              {machineStats.map((ms, idx) => (
                <div key={idx} className={s.machineRow}>
                  <div className={s.machineRowTop}>
                    <span className={s.machineName}>{ms.name}</span>
                    <span className={s.machineCount}>{ms.done}/{ms.total}</span>
                  </div>
                  <div className={s.progressBar}>
                    <div
                      className={s.progressFill}
                      style={{ width: `${ms.total > 0 ? (ms.done / ms.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {allNotes.length > 0 && (
              <div className={s.notesPanel}>
                <h3>Notes &amp; Issues ({allNotes.length})</h3>
                {allNotes.map((n, idx) => (
                  <div key={idx} className={s.noteItem}>
                    <div className={s.noteMeta}>
                      {n.machine} {n.completedBy && <span>&middot; {n.completedBy}</span>}
                    </div>
                    <div className={s.noteTask}>{n.task}</div>
                    <div className={s.noteText}>{n.note}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
