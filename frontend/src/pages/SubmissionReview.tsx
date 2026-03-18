import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import api, { type Checklist, type ChecklistMachine } from '../services/api';
import cl from '../styles/checklist.module.css';
import s from './SubmissionReview.module.css';

export default function SubmissionReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [machines, setMachines] = useState<ChecklistMachine[]>([]);
  const [activeMachine, setActiveMachine] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [photoViewer, setPhotoViewer] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteInputs, setNoteInputs] = useState<Record<string, string>>({});
  const exportRef = useRef<HTMLDivElement>(null);

  const currentUser = api.getStoredUser();

  useEffect(() => {
    const loadChecklist = () => {
      if (id) {
        api.getChecklist(id).then((data) => {
          setChecklist(data);
          // Only update machines if admin hasn't made local changes
          if (!dirty) {
            setMachines(data.machines);
          }
        });
      }
    };

    loadChecklist();

    // Poll for live updates every 3 seconds
    const interval = setInterval(loadChecklist, 3000);
    return () => clearInterval(interval);
  }, [id, dirty]);

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
                  completedBy: newStatus !== null ? (currentUser?.name || 'Admin') : null,
                  completedAt: newStatus !== null ? new Date().toISOString() : null,
                };
              }),
            };
          }),
        };
      })
    );
    setDirty(true);
  };

  const itemKey = (mIdx: number, catIdx: number, itemIdx: number) =>
    `${mIdx}-${catIdx}-${itemIdx}`;

  const updateNote = (mIdx: number, catIdx: number, itemIdx: number, note: string) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== mIdx) return m;
        return {
          ...m,
          categories: m.categories.map((c, ci) => {
            if (ci !== catIdx) return c;
            return {
              ...c,
              items: c.items.map((item, ii) => {
                if (ii !== itemIdx) return item;
                return { ...item, issue: note || null };
              }),
            };
          }),
        };
      })
    );
    setDirty(true);
  };

  const handleDownloadPDF = async () => {
    if (dirty) await saveChanges();
    const element = exportRef.current;
    if (!element) return;
    html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `${checklist?.lineName || 'checklist'}-review.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(element)
      .save();
  };

  const saveChanges = async () => {
    if (!id) return;
    await api.updateChecklistItems(id, machines);
    setDirty(false);
  };

  const handleApprove = async () => {
    if (!id) return;
    if (dirty) await saveChanges();
    await api.approveChecklist(id);
    navigate('/admin');
  };

  const handleDeny = async () => {
    if (!id) return;
    if (dirty) await saveChanges();
    await api.denyChecklist(id);
    navigate('/admin');
  };

  if (!checklist || machines.length === 0) {
    return (
      <div className="page-container">
        <div className="main-content">Loading...</div>
      </div>
    );
  }

  const allItems = machines.flatMap((m) =>
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

  const formatShortDate = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const machineStats = machines.map((m) => {
    const items = m.categories.flatMap((c) => c.items);
    return {
      name: m.name,
      total: items.length,
      done: items.filter((i) => i.completed !== null).length,
    };
  });

  const allNotes = machines.flatMap((m) =>
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

  const currentMachine = machines[activeMachine];

  const collapseKey = (catIdx: number) => `${activeMachine}-${catIdx}`;

  const toggleCollapse = (catIdx: number) => {
    const key = collapseKey(catIdx);
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isEditable = checklist.status === 'submitted';

  return (
    <div className="page-container">
      <div className="main-content">
        <div className={s.reviewTopbar}>
          <button className="back-link" onClick={() => navigate('/admin')}>
            &larr; Back
          </button>
          <button className="btn btn-green btn-sm" onClick={handleDownloadPDF}>
            Download PDF
          </button>
        </div>

        <h2 className={s.reviewTitle}>
          {checklist.lineName} - Submission Review
        </h2>
        <p className={s.reviewSubtitle}>
          {formatDate(start)} - {formatTime(start)}
        </p>

        <select
          className={`form-select ${s.reviewMachineSelect}`}
          value={activeMachine}
          onChange={(e) => setActiveMachine(Number(e.target.value))}
        >
          {machines.map((m, idx) => {
            const total = m.categories.reduce((sum, c) => sum + c.items.length, 0);
            const done = m.categories.reduce(
              (sum, c) => sum + c.items.filter((i) => i.completed !== null).length, 0
            );
            return (
              <option key={idx} value={idx}>
                {m.name} ({done}/{total})
              </option>
            );
          })}
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
                    cat.items.map((item, itemIdx) => {
                      const key = itemKey(activeMachine, catIdx, itemIdx);
                      const isEditingThisNote = editingNote === key;

                      return (
                        <div key={itemIdx} className={s.reviewItem}>
                          <div className={s.reviewItemRow}>
                            <div className={s.reviewItemDesc}>
                              <span className={s.reviewItemNum}>{itemIdx + 1}.</span>
                              <span className={s.reviewItemText}>{item.description}</span>
                            </div>
                            {isEditable && (
                              <div className={s.reviewItemActions}>
                                <button
                                  className={`${s.reviewBtn} ${item.completed === true ? s.reviewBtnDoneActive : ''}`}
                                  onClick={() => setItemStatus(catIdx, itemIdx, true)}
                                  title="Mark as done"
                                >
                                  &#10003;
                                </button>
                                <button
                                  className={`${s.reviewBtn} ${item.completed === false ? s.reviewBtnSkipActive : ''}`}
                                  onClick={() => setItemStatus(catIdx, itemIdx, false)}
                                  title="Mark with issue"
                                >
                                  &#10005;
                                </button>
                              </div>
                            )}
                            {!isEditable && (
                              <span className={`${s.reviewStatusIcon} ${item.completed === true ? s.statusPass : item.completed === false ? s.statusFail : s.statusPending}`}>
                                {item.completed === true ? '\u2713' : item.completed === false ? '\u2717' : '\u2014'}
                              </span>
                            )}
                          </div>

                          <div className={s.reviewItemFooter}>
                            {isEditable && (
                              <button
                                className={s.reviewNoteToggle}
                                onClick={() => {
                                  if (isEditingThisNote) {
                                    updateNote(activeMachine, catIdx, itemIdx, noteInputs[key] || '');
                                    setEditingNote(null);
                                  } else {
                                    setNoteInputs((prev) => ({ ...prev, [key]: item.issue || '' }));
                                    setEditingNote(key);
                                  }
                                }}
                              >
                                {isEditingThisNote ? 'Save Note' : item.issue ? 'Edit Note' : '+ Add Note'}
                              </button>
                            )}
                            {item.completed !== null && item.completedBy && (
                              <span className={cl.fillStamp}>
                                {item.completedBy}
                                {item.completedAt
                                  ? ` at ${new Date(item.completedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
                                  : ''}
                              </span>
                            )}
                          </div>

                          {isEditingThisNote && (
                            <input
                              className={s.reviewNoteInput}
                              placeholder="Add a note..."
                              value={noteInputs[key] ?? ''}
                              onChange={(e) => setNoteInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                              autoFocus
                            />
                          )}

                          {item.issue && !isEditingThisNote && (
                            <div className={s.reviewNoteBox}>
                              <strong>Note:</strong> {item.issue}
                            </div>
                          )}

                          {(item.photos || []).length > 0 && (
                            <div className={s.reviewPhotos}>
                              {(item.photos || []).map((url, pi) => (
                                <img
                                  key={pi}
                                  src={url}
                                  alt={`Photo ${pi + 1}`}
                                  className={s.reviewPhotoThumb}
                                  onClick={() => setPhotoViewer(url)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {isEditable && (
              <div className="action-buttons">
                {dirty && (
                  <button className="btn btn-outline" onClick={saveChanges}>
                    Save Changes
                  </button>
                )}
                <button className="btn btn-red-outline" onClick={handleDeny}>
                  Deny
                </button>
                <button className="btn btn-green" onClick={handleApprove}>
                  Approve
                </button>
              </div>
            )}
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
                <span className={`${s.value} ${s.statusCapitalize}`}>
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

      {/* PDF Export Template */}
      <div
        ref={exportRef}
        style={{ position: 'absolute', visibility: 'hidden', width: '800px', background: '#fff', padding: '24px', zIndex: -1 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#888', paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px solid #ddd' }}>
          <span>{formatShortDate(start)} - {formatTime(start)}</span>
          <span>{checklist.lineName} Review</span>
        </div>

        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#5B2333', marginBottom: '4px' }}>
          {checklist.lineName} — Submission Review
        </h1>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Gallo Bottling Sanitation Hub</p>

        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>OPERATOR</div>
            <div style={{ fontSize: '11px', fontWeight: 600 }}>{checklist.operatorName}</div>
          </div>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>DATE</div>
            <div style={{ fontSize: '11px', fontWeight: 600 }}>{formatShortDate(start)}</div>
          </div>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>START</div>
            <div style={{ fontSize: '11px', fontWeight: 600 }}>{formatTime(start)}</div>
          </div>
          {end && (
            <div>
              <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>END</div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{formatTime(end)}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>DURATION</div>
            <div style={{ fontSize: '11px', fontWeight: 600 }}>{durationMin} min</div>
          </div>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>STATUS</div>
            <div style={{ fontSize: '11px', fontWeight: 600 }}>{checklist.status === 'submitted' ? 'Submitted' : checklist.status}</div>
          </div>
        </div>

        {machines.map((machine, mIdx) => (
          <div key={mIdx} style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#5B2333', padding: '4px 0', borderBottom: '2px solid #5B2333', marginBottom: '8px' }}>
              {machine.name}
            </div>

            {machine.categories.map((cat, catIdx) => (
              <div key={catIdx} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, padding: '3px 0', marginBottom: '2px' }}>
                  {cat.name} ({cat.items.length})
                </div>

                {cat.items.map((item, itemIdx) => (
                  <div key={itemIdx} style={{ marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '3px 0', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '11px', flexShrink: 0, marginTop: '1px', color: item.completed === true ? '#16a34a' : item.completed === false ? '#dc2626' : '#9ca3af' }}>
                          {item.completed === true ? '\u2713' : item.completed === false ? '\u2717' : '\u2014'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '11px', lineHeight: 1.3, color: '#374151' }}>{item.description}</span>
                          {item.completed !== null && item.completedBy && (
                            <span style={{ display: 'block', fontSize: '9px', color: '#9ca3af', fontStyle: 'italic', marginTop: '1px' }}>
                              {item.completedBy}
                              {item.completedAt
                                ? ` — ${new Date(item.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`
                                : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap', color: item.completed === true ? '#16a34a' : item.completed === false ? '#dc2626' : '#9ca3af' }}>
                        {item.completed === true ? 'Complete' : item.completed === false ? 'Issue' : 'Pending'}
                      </span>
                    </div>
                    {item.issue && (
                      <div style={{ marginLeft: '19px', padding: '4px 8px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '4px', fontSize: '10px', color: '#92400e', marginTop: '2px' }}>
                        <strong>Note:</strong> {item.issue}
                      </div>
                    )}
                    {(item.photos || []).length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '4px 0 4px 19px' }}>
                        {(item.photos || []).map((url, pi) => (
                          <img key={pi} src={url} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #e5e7eb' }} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}

        {/* Notes Summary Section */}
        {allNotes.length > 0 && (
          <div style={{ marginTop: '20px', padding: '12px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '6px' }}>
            <h3 style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '8px' }}>Notes &amp; Issues ({allNotes.length})</h3>
            {allNotes.map((n, idx) => (
              <div key={idx} style={{ padding: '6px 0', borderBottom: idx < allNotes.length - 1 ? '1px solid #fcd34d' : 'none' }}>
                <div style={{ fontSize: '9px', fontWeight: 600, color: '#78350f', textTransform: 'uppercase' }}>
                  {n.machine} {n.completedBy && `• ${n.completedBy}`}
                </div>
                <div style={{ fontSize: '10px', color: '#78350f', marginTop: '2px' }}>{n.task}</div>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', marginTop: '2px' }}>{n.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {photoViewer && (
        <div className={s.photoOverlay} onClick={() => setPhotoViewer(null)}>
          <img src={photoViewer} alt="Full size" className={s.photoFull} />
          <button className={s.photoOverlayClose} onClick={() => setPhotoViewer(null)}>
            &times;
          </button>
        </div>
      )}
    </div>
  );
}
