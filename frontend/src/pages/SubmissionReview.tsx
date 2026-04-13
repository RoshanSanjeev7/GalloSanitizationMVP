import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { type Checklist, type ChecklistMachine } from '../services/api';
import { formatTime, formatFullDate, formatStamp, statusColor, statusIcon, STATUS_LABELS, itemKey as getItemKey, collapseKey as getCollapseKey, updateMachineItem } from '../utils/checklist';
import { useImageUrlsForMachines } from '../hooks/useImageUrls';
import { useChecklistSync } from '../hooks/useChecklistSync';
import PresenceAvatars from '../components/PresenceAvatars';
import MachineSelector from '../components/MachineSelector';
import { HIGHLIGHT_DURATION_MS } from '../config/constants';
import cl from '../styles/checklist.module.css';
import s from '../styles/sidebar.module.css';
import fillStyles from './ChecklistFill.module.css';
import Spinner from '../components/Spinner';

export default function SubmissionReview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [machines, setMachines] = useState<ChecklistMachine[]>([]);
  const [activeMachine, setActiveMachine] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [editMode, setEditMode] = useState(false);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [showComment, setShowComment] = useState<Record<string, boolean>>({});
  const [reviewedNotes, setReviewedNotes] = useState<Record<number, boolean>>({});
  const [photoMenu, setPhotoMenu] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [version, setVersion] = useState<number | undefined>();
  const [actionInProgress, setActionInProgress] = useState<'approve' | 'deny' | 'saving' | null>(null);
  const [deleted, setDeleted] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const imageUrls = useImageUrlsForMachines(id, machines);

  const handlePhotoUpload = async (catIdx: number, itemIdx: number, files: FileList) => {
    if (!id) return;
    const key = itemKey(catIdx, itemIdx);
    setUploading((prev) => ({ ...prev, [key]: true }));
    const result = await api.uploadImages(id, activeMachine, catIdx, itemIdx, Array.from(files));
    setMachines((prev) => updateMachineItem(prev, activeMachine, catIdx, itemIdx, (item) => ({ ...item, images: result.images })));
    setUploading((prev) => ({ ...prev, [key]: false }));
  };

  const handlePhotoDelete = async (catIdx: number, itemIdx: number, imageKey: string) => {
    if (!id) return;
    const result = await api.deleteImage(id, imageKey, activeMachine, catIdx, itemIdx);
    setMachines((prev) => updateMachineItem(prev, activeMachine, catIdx, itemIdx, (item) => ({ ...item, images: result.images })));
  };

  const currentUser = api.getStoredUser();

  useEffect(() => {
    if (id) {
      api.getChecklist(id).then((data) => {
        setChecklist(data);
        setMachines(data.machines);
        setVersion(data.version);
      });
    }
  }, [id]);

  const { presence, isDeleted: wsIsDeleted, statusChanged } = useChecklistSync(id, machines, setMachines, setVersion);

  const handleApprove = async () => {
    if (!id || actionInProgress) return;
    setActionInProgress('approve');
    setSaveError(null);
    try {
      if (editMode) {
        const result = await api.updateChecklistItems(id, machines, version);
        setVersion(result.version);
      }
      await api.approveChecklist(id);
      navigate('/admin');
    } catch (err: unknown) {
      setActionInProgress(null);
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      if (status === 409) {
        setSaveError('This checklist has been modified by another user. Please reload.');
      } else if (status === 404) {
        setDeleted(true);
      } else {
        setSaveError('Failed to approve. Please try again.');
      }
    }
  };

  const handleDeny = async () => {
    if (!id || actionInProgress) return;
    setActionInProgress('deny');
    setSaveError(null);
    try {
      await api.denyChecklist(id);
      navigate('/admin');
    } catch (err: unknown) {
      setActionInProgress(null);
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      if (status === 409) {
        setSaveError('This checklist has already been reviewed by another admin.');
      } else if (status === 404) {
        setDeleted(true);
      } else {
        setSaveError('Failed to deny. Please try again.');
      }
    }
  };

  const handleSaveEdits = async () => {
    if (!id || actionInProgress) return;
    setActionInProgress('saving');
    try {
      setSaveError(null);
      const result = await api.updateChecklistItems(id, buildMachinesPayload(), version);
      setVersion(result.version);
      setEditMode(false);
      const data = await api.getChecklist(id);
      setChecklist(data);
      setMachines(data.machines);
      setVersion(data.version);
    } catch (err: unknown) {
      const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
      if (status === 409) {
        setSaveError('This checklist has been modified by another user. Please reload.');
      } else if (status === 404) {
        setDeleted(true);
      } else {
        setSaveError('Failed to save. Please try again.');
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const itemKey = (catIdx: number, itemIdx: number) =>
    getItemKey(activeMachine, catIdx, itemIdx);

  const setItemStatus = (catIdx: number, itemIdx: number, completed: boolean) => {
    setMachines((prev) =>
      updateMachineItem(prev, activeMachine, catIdx, itemIdx, (item) => {
        const newStatus = item.completed === completed ? null : completed;
        return {
          ...item,
          completed: newStatus,
          completedBy: newStatus !== null ? (currentUser?.name || 'Admin') : null,
          completedAt: newStatus !== null ? new Date().toISOString() : null,
        };
      })
    );
  };

  const toggleComment = (catIdx: number, itemIdx: number) => {
    const key = itemKey(catIdx, itemIdx);
    setShowComment((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const setCommentText = (catIdx: number, itemIdx: number, text: string) => {
    const key = itemKey(catIdx, itemIdx);
    setCommentInputs((prev) => ({ ...prev, [key]: text }));
  };

  const deleteComment = (catIdx: number, itemIdx: number) => {
    setMachines((prev) => updateMachineItem(prev, activeMachine, catIdx, itemIdx, (item) => ({ ...item, issue: null })));
  };

  const buildMachinesPayload = (): ChecklistMachine[] => {
    return machines.map((machine, mi) => ({
      ...machine,
      categories: machine.categories.map((cat, catIdx) => ({
        ...cat,
        items: cat.items.map((item, itemIdx) => {
          const key = `${mi}-${catIdx}-${itemIdx}`;
          // Use commentInputs if key exists (even if empty string to allow deletion)
          const hasCommentInput = key in commentInputs;
          return {
            ...item,
            issue: hasCommentInput ? (commentInputs[key] || null) : item.issue,
          };
        }),
      })),
    }));
  };

  if (!checklist) {
    return (
      <div className="page-container">
        <div className="main-content"><Spinner label="Loading review..." delay={0} /></div>
      </div>
    );
  }

  if (deleted || wsIsDeleted) {
    return (
      <div className="page-container">
        <div className="main-content" style={{ textAlign: 'center', paddingTop: 80 }}>
          <h2>Checklist Deleted</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>This checklist has been deleted by another admin.</p>
          <button className="btn btn-primary" onClick={() => navigate('/admin')}>
            Back to Dashboard
          </button>
        </div>
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

  const machineStats = machines.map((m) => {
    const items = m.categories.flatMap((c) => c.items);
    return {
      name: m.name,
      total: items.length,
      done: items.filter((i) => i.completed !== null).length,
    };
  });

  const allNotes = machines.flatMap((m, mIdx) =>
    m.categories.flatMap((c, cIdx) =>
      c.items
        .filter((i) => i.issue)
        .map((i, iIdx) => ({
          machine: m.name,
          machineIdx: mIdx,
          categoryIdx: cIdx,
          itemIdx: c.items.indexOf(i),
          task: i.description,
          note: i.issue!,
          completedBy: i.completedBy,
        }))
    )
  );

  const jumpToNote = (machineIdx: number, categoryIdx: number, itemIdx: number) => {
    setActiveMachine(machineIdx);
    // Expand the category
    const key = `${machineIdx}-${categoryIdx}`;
    setCollapsed((prev) => ({ ...prev, [key]: false }));
    // Scroll to the task after state updates
    setTimeout(() => {
      const taskId = `task-${machineIdx}-${categoryIdx}-${itemIdx}`;
      const element = document.getElementById(taskId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = '#fef9c3';
        setTimeout(() => {
          element.style.backgroundColor = '';
        }, HIGHLIGHT_DURATION_MS);
      }
    }, 100);
  };

  const allContributors = Array.from(
    new Set(
      allItems
        .map((i) => i.completedBy)
        .filter((name): name is string => name !== null)
    )
  );

  const currentMachine = machines[activeMachine];

  const collapseKey = (catIdx: number) => getCollapseKey(activeMachine, catIdx);

  const toggleCollapse = (catIdx: number) => {
    const key = collapseKey(catIdx);
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };


  return (
    <div className="page-container">
      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="back-link" onClick={() => navigate('/admin')} style={{ marginBottom: 0 }}>
            &larr; Back
          </button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {editMode ? (
              <>
                <button className="btn btn-outline btn-sm" disabled={actionInProgress !== null} onClick={() => setEditMode(false)}>
                  Cancel
                </button>
                <button className="btn btn-green btn-sm" disabled={actionInProgress !== null} onClick={handleSaveEdits}>
                  {actionInProgress === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-outline btn-sm" onClick={() => setEditMode(true)}>
                  Edit Checklist
                </button>
                <button className="btn btn-red-outline btn-sm" disabled={actionInProgress !== null} onClick={handleDeny}>
                  {actionInProgress === 'deny' ? 'Denying...' : 'Deny'}
                </button>
                <button className="btn btn-green btn-sm" disabled={actionInProgress !== null} onClick={handleApprove}>
                  {actionInProgress === 'approve' ? 'Approving...' : 'Approve'}
                </button>
              </>
            )}
          </div>
        </div>

        <h2 style={{ marginBottom: 2 }}>
          {checklist.lineName} - {editMode ? 'Edit Submission' : 'Submission Review'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
          {formatFullDate(start)} - {formatTime(start)}
        </p>

        {saveError && (
          <div style={{ padding: '12px 16px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 14, color: '#dc2626' }}>
            {saveError}
            {saveError.includes('reload') && (
              <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => { setSaveError(null); window.location.reload(); }}>Reload</button>
            )}
          </div>
        )}
        {statusChanged && (
          <div style={{ padding: '12px 16px', marginBottom: 12, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 14 }}>
            This checklist was {statusChanged.status} by {statusChanged.by}.
            <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/admin')}>Go to Dashboard</button>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <MachineSelector machines={machines} activeMachine={activeMachine} onSelect={setActiveMachine} />
        </div>

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
                      const key = itemKey(catIdx, itemIdx);

                      if (editMode) {
                        return (
                          <div key={itemIdx} id={`task-${activeMachine}-${catIdx}-${itemIdx}`} className={fillStyles.fillItem} style={{ transition: 'background-color 0.3s' }}>
                            <div className={fillStyles.fillItemRow}>
                              <div className={fillStyles.fillItemDesc}>
                                <span className={fillStyles.fillItemNum}>{itemIdx + 1}.</span>
                                <span className={fillStyles.fillItemText}>{item.description}</span>
                              </div>
                              <div className={fillStyles.fillItemActions}>
                                <button
                                  className={`${fillStyles.fillBtn} ${item.completed === true ? fillStyles.fillBtnDoneActive : ''}`}
                                  onClick={() => setItemStatus(catIdx, itemIdx, true)}
                                  title="Mark as done"
                                >
                                  &#10003;
                                </button>
                                <button
                                  className={`${fillStyles.fillBtn} ${item.completed === false ? fillStyles.fillBtnSkipActive : ''}`}
                                  onClick={() => setItemStatus(catIdx, itemIdx, false)}
                                  title="Mark with issue"
                                >
                                  &#10005;
                                </button>
                              </div>
                            </div>

                            <div className={fillStyles.fillItemFooter}>
                              <div className={fillStyles.cameraWrapper}>
                                <button
                                  className={fillStyles.cameraBtn}
                                  onClick={() => setPhotoMenu(photoMenu === key ? null : key)}
                                  title="Add photo"
                                >
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                                    <circle cx="12" cy="13" r="4"/>
                                  </svg>
                                </button>
                                {photoMenu === key && (
                                  <div className={fillStyles.photoPopover}>
                                    <button
                                      className={fillStyles.photoPopoverItem}
                                      onClick={() => {
                                        setPhotoMenu(null);
                                        fileInputRefs.current[`${key}-camera`]?.click();
                                      }}
                                    >
                                      Take Photo
                                    </button>
                                    <button
                                      className={fillStyles.photoPopoverItem}
                                      onClick={() => {
                                        setPhotoMenu(null);
                                        fileInputRefs.current[key]?.click();
                                      }}
                                    >
                                      Photo Library
                                    </button>
                                  </div>
                                )}
                              </div>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                ref={(el) => { fileInputRefs.current[`${key}-camera`] = el; }}
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    handlePhotoUpload(catIdx, itemIdx, e.target.files);
                                    e.target.value = '';
                                  }
                                }}
                              />
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                style={{ display: 'none' }}
                                ref={(el) => { fileInputRefs.current[key] = el; }}
                                onChange={(e) => {
                                  if (e.target.files && e.target.files.length > 0) {
                                    handlePhotoUpload(catIdx, itemIdx, e.target.files);
                                    e.target.value = '';
                                  }
                                }}
                              />
                              {item.completed !== null && item.completedBy && (
                                <span className={fillStyles.fillStampRight}>
                                  {item.completedBy}{item.completedAt ? ` at ${formatStamp(item.completedAt)}` : ''}
                                </span>
                              )}
                            </div>

                            {uploading[key] && (
                              <div className={fillStyles.photoUploading}>Uploading...</div>
                            )}

                            {item.images && item.images.length > 0 && (
                              <div className={fillStyles.photoThumbs}>
                                {item.images.map((imgKey) => {
                                  return (
                                    <div key={imgKey} className={fillStyles.photoThumbWrapper}>
                                      {imageUrls[imgKey] ? (
                                        <img
                                          className={fillStyles.photoThumb}
                                          src={imageUrls[imgKey]}
                                          alt="Uploaded"
                                          onClick={() => window.open(imageUrls[imgKey], '_blank')}
                                          style={{ cursor: 'pointer' }}
                                        />
                                      ) : (
                                        <div className={fillStyles.photoThumb} style={{ background: '#f3f4f6' }} />
                                      )}
                                      <button
                                        className={fillStyles.photoRemoveBtn}
                                        onClick={() => handlePhotoDelete(catIdx, itemIdx, imgKey)}
                                      >
                                        &times;
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {showComment[key] ? (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                                <input
                                  className={fillStyles.fillCommentInput}
                                  style={{ flex: 1, marginBottom: 0, marginLeft: 0, marginTop: 0 }}
                                  placeholder="Leave a comment..."
                                  value={commentInputs[key] ?? item.issue ?? ''}
                                  onChange={(e) => setCommentText(catIdx, itemIdx, e.target.value)}
                                />
                                <button
                                  className="btn btn-outline btn-sm"
                                  style={{ flexShrink: 0 }}
                                  onClick={() => toggleComment(catIdx, itemIdx)}
                                >
                                  Done
                                </button>
                                {(item.issue || commentInputs[key]) && (
                                  <button
                                    className="btn btn-red-outline btn-sm"
                                    style={{ flexShrink: 0 }}
                                    onClick={() => {
                                      setCommentText(catIdx, itemIdx, '');
                                      deleteComment(catIdx, itemIdx);
                                      toggleComment(catIdx, itemIdx);
                                    }}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            ) : (item.issue || commentInputs[key]) ? (
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                                <div className={fillStyles.fillCommentBox} style={{ flex: 1, marginTop: 0, marginLeft: 0 }}>
                                  <strong>Comment:</strong> {commentInputs[key] ?? item.issue}
                                </div>
                                <button
                                  className="btn btn-outline btn-sm"
                                  style={{ flexShrink: 0 }}
                                  onClick={() => toggleComment(catIdx, itemIdx)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-red-outline btn-sm"
                                  style={{ flexShrink: 0 }}
                                  onClick={() => {
                                    setCommentText(catIdx, itemIdx, '');
                                    deleteComment(catIdx, itemIdx);
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            ) : (
                              <button
                                className={fillStyles.fillCommentToggle}
                                style={{ marginTop: 4 }}
                                onClick={() => toggleComment(catIdx, itemIdx)}
                              >
                                + Add comment
                              </button>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div key={itemIdx} id={`task-${activeMachine}-${catIdx}-${itemIdx}`} className={cl.fillTask} style={{ transition: 'background-color 0.3s' }}>
                          <div className={cl.fillTaskLeft}>
                            <div className={cl.fillTaskContent}>
                              <span className={cl.fillTaskText}>{item.description}</span>
                              {item.completed !== null && item.completedBy && (
                                <span className={cl.fillStamp}>
                                  {item.completedBy}
                                  {item.completedAt
                                    ? ` at ${formatStamp(item.completedAt)}`
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
                            style={{ color: statusColor(item.completed) }}
                          >
                            {statusIcon(item.completed)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            <div className="action-buttons">
              {editMode ? (
                <>
                  <button className="btn btn-outline" disabled={actionInProgress !== null} onClick={() => setEditMode(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-green" disabled={actionInProgress !== null} onClick={handleSaveEdits}>
                    {actionInProgress === 'saving' ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-red-outline" disabled={actionInProgress !== null} onClick={handleDeny}>
                    {actionInProgress === 'deny' ? 'Denying...' : 'Deny'}
                  </button>
                  <button className="btn btn-green" disabled={actionInProgress !== null} onClick={handleApprove}>
                    {actionInProgress === 'approve' ? 'Approving...' : 'Approve'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div>
            <div className={s.summaryPanel}>
              <h3>Summary</h3>
              <div className={s.summaryRow}>
                <span className={s.label}>Created By</span>
                <span className={s.value}>{checklist.operatorName}</span>
              </div>
              {allContributors.length > 0 && (
                <div className={s.summaryRow}>
                  <span className={s.label}>Contributors</span>
                  <span className={s.value}>{allContributors.join(', ')}</span>
                </div>
              )}
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
                  {STATUS_LABELS[checklist.status] || checklist.status}
                </span>
              </div>
              {presence.length > 0 && (
                <div className={s.summaryRow}>
                  <span className={s.label}>Currently Viewing</span>
                  <span className={s.value}><PresenceAvatars users={presence} /></span>
                </div>
              )}
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
                <h3>Notes &amp; Issues ({Object.values(reviewedNotes).filter(Boolean).length}/{allNotes.length})</h3>
                {allNotes.map((n, idx) => (
                  <div
                    key={idx}
                    className={s.noteItem}
                    style={{
                      opacity: reviewedNotes[idx] ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={reviewedNotes[idx] || false}
                        onChange={() => setReviewedNotes((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                        style={{ marginTop: 2, cursor: 'pointer' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div className={s.noteMeta}>
                          {n.machine} {n.completedBy && <span>&middot; {n.completedBy}</span>}
                        </div>
                        <div className={s.noteTask}>{n.task}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                          <div className={s.noteText} style={{ flex: 1, margin: 0 }}>{n.note}</div>
                          <button
                            className="btn btn-outline btn-sm"
                            style={{ flexShrink: 0, fontSize: 11, padding: '4px 10px' }}
                            onClick={() => jumpToNote(n.machineIdx, n.categoryIdx, n.itemIdx)}
                          >
                            Go to &rarr;
                          </button>
                        </div>
                      </div>
                    </div>
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
