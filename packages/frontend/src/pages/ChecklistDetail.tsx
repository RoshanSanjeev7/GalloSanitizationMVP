import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { type Checklist } from '../services/api';
import cl from '../styles/checklist.module.css';
import s from './ChecklistDetail.module.css';
import sr from './SubmissionReview.module.css';

export default function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [activeMachine, setActiveMachine] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const loadImageUrl = async (imageKey: string) => {
    if (imageUrls[imageKey]) return;
    if (!id) return;
    const url = await api.getImageUrl(id, imageKey);
    setImageUrls((prev) => ({ ...prev, [imageKey]: url }));
  };

  useEffect(() => {
    if (id) api.getChecklist(id).then(setChecklist);
  }, [id]);

  if (!checklist) {
    return (
      <div className="page-container">
        <div className="main-content">Loading...</div>
      </div>
    );
  }

  const start = new Date(checklist.startTime);
  const end = checklist.endTime ? new Date(checklist.endTime) : null;
  const durationMs = end ? end.getTime() - start.getTime() : 0;
  const durationMin = Math.round(durationMs / 60000);

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const formatTime = (d: Date) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const formatDateTime = (d: Date) =>
    `${d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })}, ${formatTime(d)}`;

  const formatFullDate = (d: Date) =>
    d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const statusLabel: Record<string, string> = {
    in_progress: 'In Progress',
    submitted: 'Submitted',
    approved: 'Approved',
    denied: 'Denied',
  };

  const currentMachine = checklist.machines[activeMachine];

  const collapseKey = (catIdx: number) => `${activeMachine}-${catIdx}`;

  const toggleCollapse = (catIdx: number) => {
    const key = collapseKey(catIdx);
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allItems = checklist.machines.flatMap((m) =>
    m.categories.flatMap((c) => c.items)
  );
  const completeCount = allItems.filter((i) => i.completed !== null).length;
  const incompleteCount = allItems.length - completeCount;

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

  const allContributors = Array.from(
    new Set(
      allItems
        .map((i) => i.completedBy)
        .filter((name): name is string => name !== null)
    )
  );

  return (
    <div className="page-container">
      <div className={`main-content ${s.detailPage}`}>
        <div className={`${s.detailTopbar} no-print`}>
          <button className="back-link" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>
            &larr; Back
          </button>
          <button className="btn btn-green btn-sm" onClick={() => id && api.downloadChecklistPdf(id)}>
            Export PDF
          </button>
        </div>

        <div className={s.printHeader}>
          <span>{formatDateTime(start)}</span>
          <span>{checklist.lineName} Checklist</span>
        </div>

        <h2 style={{ marginBottom: 2 }}>
          {checklist.lineName} - {statusLabel[checklist.status] || checklist.status}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          {formatFullDate(start)} - {formatTime(start)}
        </p>

        <div className="no-print">
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

          <div className={sr.reviewLayout}>
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
                                  <strong>Comment:</strong>
                                  {item.issue}
                                </div>
                              )}
                              {item.images && item.images.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                  {item.images.map((imgKey) => {
                                    if (!imageUrls[imgKey]) loadImageUrl(imgKey);
                                    return (
                                      <img
                                        key={imgKey}
                                        src={imageUrls[imgKey] || ''}
                                        alt="Checklist photo"
                                        style={{
                                          width: 48,
                                          height: 48,
                                          objectFit: 'cover',
                                          borderRadius: 4,
                                          border: '1px solid var(--border)',
                                          cursor: 'pointer',
                                        }}
                                        onClick={() => imageUrls[imgKey] && window.open(imageUrls[imgKey], '_blank')}
                                      />
                                    );
                                  })}
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
            </div>

            <div>
              <div className={sr.summaryPanel}>
                <h3>Summary</h3>
                <div className={sr.summaryRow}>
                  <span className={sr.label}>Created By</span>
                  <span className={sr.value}>{checklist.operatorName}</span>
                </div>
                {allContributors.length > 0 && (
                  <div className={sr.summaryRow}>
                    <span className={sr.label}>Contributors</span>
                    <span className={sr.value}>{allContributors.join(', ')}</span>
                  </div>
                )}
                <div className={sr.summaryRow}>
                  <span className={sr.label}>Start</span>
                  <span className={sr.value}>{formatTime(start)}</span>
                </div>
                {end && (
                  <div className={sr.summaryRow}>
                    <span className={sr.label}>End</span>
                    <span className={sr.value}>{formatTime(end)}</span>
                  </div>
                )}
                <div className={sr.summaryRow}>
                  <span className={sr.label}>Duration</span>
                  <span className={sr.value}>{durationMin} min</span>
                </div>
                <div className={sr.summaryRow}>
                  <span className={sr.label}>Status</span>
                  <span className={sr.value} style={{ textTransform: 'capitalize' }}>
                    {statusLabel[checklist.status] || checklist.status}
                  </span>
                </div>
              </div>

              <div className={sr.completionPanel}>
                <h3>Completion</h3>
                <div className={sr.completionStat}>
                  <span className={sr.statComplete}>&#10003; Filled</span>
                  <span className={sr.statComplete}>{completeCount}</span>
                </div>
                <div className={sr.completionStat}>
                  <span className={sr.statIncomplete}>&#10005; Unfilled</span>
                  <span className={sr.statIncomplete}>{incompleteCount}</span>
                </div>
              </div>

              <div className={sr.machinePanel}>
                <h3>Machine Progress</h3>
                {machineStats.map((ms, idx) => (
                  <div key={idx} className={sr.machineRow}>
                    <div className={sr.machineRowTop}>
                      <span className={sr.machineName}>{ms.name}</span>
                      <span className={sr.machineCount}>{ms.done}/{ms.total}</span>
                    </div>
                    <div className={sr.progressBar}>
                      <div
                        className={sr.progressFill}
                        style={{ width: `${ms.total > 0 ? (ms.done / ms.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {allNotes.length > 0 && (
                <div className={sr.notesPanel}>
                  <h3>Notes &amp; Issues ({allNotes.length})</h3>
                  {allNotes.map((n, idx) => (
                    <div key={idx} className={sr.noteItem}>
                      <div className={sr.noteMeta}>
                        {n.machine} {n.completedBy && <span>&middot; {n.completedBy}</span>}
                      </div>
                      <div className={sr.noteTask}>{n.task}</div>
                      <div className={sr.noteText}>{n.note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.printOnly}>
          {checklist.machines.map((machine, mIdx) => (
            <div key={mIdx} className={s.printMachine}>
              <div className={s.printMachineHeader}>
                {machine.name}
              </div>

              {machine.categories.map((cat, catIdx) => (
                <div key={catIdx} className={s.printCategory}>
                  <div className={s.printCategoryHeader}>
                    {cat.name} ({cat.items.length})
                  </div>

                  {cat.items.map((item, itemIdx) => (
                    <div key={itemIdx} className={s.printTask}>
                      <div className={s.printTaskLeft}>
                        <span
                          className={s.printTaskIcon}
                          style={{ color: item.completed === true ? '#16a34a' : item.completed === false ? '#dc2626' : '#9ca3af' }}
                        >
                          {item.completed === true ? '\u2713' : item.completed === false ? '\u2717' : '\u2014'}
                        </span>
                        <div className={s.printTaskInfo}>
                          <span className={s.printTaskText}>{item.description}</span>
                          {item.completed !== null && item.completedBy && (
                            <span className={s.printTaskStamp}>
                              {item.completedBy}
                              {item.completedAt
                                ? ` \u2014 ${new Date(item.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`
                                : ''}
                            </span>
                          )}
                          {item.issue && (
                            <div className={s.printIssue}>
                              <strong>Issue:</strong> {item.issue}
                            </div>
                          )}
                          {item.images && item.images.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                              {item.images.map((imgKey) => {
                                if (!imageUrls[imgKey]) loadImageUrl(imgKey);
                                return (
                                  <img
                                    key={imgKey}
                                    src={imageUrls[imgKey] || ''}
                                    alt="Checklist photo"
                                    style={{
                                      width: 48,
                                      height: 48,
                                      objectFit: 'cover',
                                      borderRadius: 4,
                                      border: '1px solid var(--border)',
                                      cursor: 'pointer',
                                    }}
                                    onClick={() => imageUrls[imgKey] && window.open(imageUrls[imgKey], '_blank')}
                                  />
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`${s.printTaskLabel} ${item.completed === true ? s.printComplete : item.completed === false ? s.printIncomplete : s.printPending}`}>
                        {item.completed === true ? 'Complete' : item.completed === false ? 'Incomplete' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
