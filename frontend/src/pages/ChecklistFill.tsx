import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { type Checklist, type ChecklistMachine } from '../services/api';
import Modal from '../components/Modal';
import { formatStamp, itemKey as getItemKey, collapseKey as getCollapseKey, updateMachineItem } from '../utils/checklist';
import { useImageUrlsForMachines } from '../hooks/useImageUrls';
import { useChecklistSync } from '../hooks/useChecklistSync';
import PresenceAvatars from '../components/PresenceAvatars';
import { wsClient } from '../services/websocket';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import cl from '../styles/checklist.module.css';
import s from './ChecklistFill.module.css';
import Spinner from '../components/Spinner';

export default function ChecklistFill() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [machines, setMachines] = useState<ChecklistMachine[]>([]);
  const [activeMachine, setActiveMachine] = useState(0);
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [showComment, setShowComment] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [photoMenu, setPhotoMenu] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'conflict'>('idle');
  const [version, setVersion] = useState<number | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const remoteUpdateRef = useRef(false); // true when setMachines is from WebSocket, not user action
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const imageUrls = useImageUrlsForMachines(id, machines, activeMachine);

  // Wrap setMachines for WebSocket sync — marks updates as remote so auto-save skips them
  const setMachinesRemote = useRef((fn: React.SetStateAction<ChecklistMachine[]>) => {
    remoteUpdateRef.current = true;
    setMachines(fn);
  }).current;
  const { presence, isDeleted, statusChanged } = useChecklistSync(id, machines, setMachinesRemote, setVersion);

  const { queueCount, syncing, enqueue, syncQueue } = useOfflineQueue();
  const currentUser = api.getStoredUser();

  useEffect(() => {
    loadChecklist();
  }, [id]);

  const loadChecklist = async () => {
    if (!id) return;
    const data = await api.getChecklist(id);
    setChecklist(data);
    setMachines(data.machines);
    setVersion(data.version);
  };

  const setItemStatus = (catIdx: number, itemIdx: number, completed: boolean) => {
    setMachines((prev) =>
      updateMachineItem(prev, activeMachine, catIdx, itemIdx, (item) => {
        const newStatus = item.completed === completed ? null : completed;
        return {
          ...item,
          completed: newStatus,
          completedBy: newStatus !== null ? (currentUser?.name || 'Unknown') : null,
          completedAt: newStatus !== null ? new Date().toISOString() : null,
        };
      })
    );
  };

  const itemKey = (catIdx: number, itemIdx: number) =>
    getItemKey(activeMachine, catIdx, itemIdx);

  const collapseKey = (catIdx: number) => getCollapseKey(activeMachine, catIdx);

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

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    // Skip auto-save when machines changed from a remote WebSocket update
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }
    if (!id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveStatus('saving');
      const p = (async () => {
        try {
          const result = await api.updateChecklistItems(id, buildMachines(), version);
          setVersion(result.version);
          setSaveStatus('saved');
        } catch (err: unknown) {
          if (err instanceof Error && (err as Error & { status?: number }).status === 409) {
            setSaveStatus('conflict');
          } else {
            setSaveStatus('error');
            // Only queue for offline sync on actual network failures (no status code)
            const status = err instanceof Error ? (err as Error & { status?: number }).status : undefined;
            if (!status && !navigator.onLine) {
              enqueue(id, activeMachine, machines[activeMachine], version || 0);
            }
          }
        } finally {
          savingRef.current = false;
          savePromiseRef.current = null;
        }
      })();
      savePromiseRef.current = p;
    }, 500);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [machines, commentInputs, showComment]);

  useEffect(() => {
    if (id) wsClient.machineChange(id, activeMachine);
  }, [id, activeMachine]);

  const confirmSubmit = async () => {
    if (!id || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Cancel pending auto-save and wait for any in-flight save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (savePromiseRef.current) await savePromiseRef.current;
      // Final save + submit
      await api.updateChecklistItems(id, buildMachines(), version);
      await api.submitChecklist(id);
      navigate('/');
    } catch (err: unknown) {
      setSubmitting(false);
      if (err instanceof Error && (err as Error & { status?: number }).status === 409) {
        setSubmitError('This checklist was modified by another user. Please reload.');
      } else if (err instanceof Error && (err as Error & { status?: number }).status === 404) {
        setSubmitError('This checklist has been deleted.');
      } else {
        setSubmitError('Submit failed. Please try again.');
      }
    }
  };

  if (!checklist || machines.length === 0) {
    return (
      <div className="page-container">
        <div className="main-content"><Spinner label="Loading checklist..." delay={0} /></div>
      </div>
    );
  }

  const currentMachine = machines[activeMachine];

  return (
    <div className="page-container">
      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="back-link" style={{ marginBottom: 0 }} onClick={async () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            try {
              if (id) await api.updateChecklistItems(id, buildMachines(), version);
            } catch {
              // Best effort save on back navigation
            }
            navigate('/');
          }}>
            &larr; Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {saveStatus === 'saving' && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Saving...</span>}
            {saveStatus === 'saved' && <span style={{ fontSize: 12, color: 'var(--success)' }}>Saved</span>}
            {saveStatus === 'error' && <span style={{ fontSize: 12, color: 'var(--error)' }}>Save failed</span>}
            <PresenceAvatars users={presence} label />
            <button className="btn btn-primary btn-sm" onClick={() => setShowSubmitConfirm(true)} disabled={submitting || saveStatus === 'saving'}>
              Submit Checklist
            </button>
          </div>
        </div>

        {saveStatus === 'conflict' && (
          <div style={{ padding: '12px 16px', marginBottom: 12, background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8, fontSize: 14 }}>
            This checklist has been modified by another user. <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => { setSaveStatus('idle'); loadChecklist(); }}>Reload</button>
          </div>
        )}
        {statusChanged && (
          <div style={{ padding: '12px 16px', marginBottom: 12, background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, fontSize: 14 }}>
            This checklist was {statusChanged.status} by {statusChanged.by}.
            <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/')}>Go to Dashboard</button>
          </div>
        )}
        {isDeleted && (
          <div style={{ padding: '12px 16px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 14, color: '#dc2626' }}>
            This checklist has been deleted.
            <button className="btn btn-outline btn-sm" style={{ marginLeft: 8 }} onClick={() => navigate('/')}>Go to Dashboard</button>
          </div>
        )}
        {queueCount > 0 && (
          <div style={{ padding: '12px 16px', marginBottom: 12, background: '#fef3c7', border: '1px solid #fde047', borderRadius: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{queueCount} unsaved change{queueCount > 1 ? 's' : ''} queued{syncing ? ' (syncing...)' : ''}</span>
            {!syncing && navigator.onLine && (
              <button className="btn btn-outline btn-sm" onClick={syncQueue}>Sync Now</button>
            )}
          </div>
        )}

        <h2 style={{ marginBottom: 4 }}>{checklist.lineName} &mdash; Deep Clean</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
          {checklist.operatorName} &middot; Started{' '}
          {new Date(checklist.startTime).toLocaleString()}
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {machines.map((m, idx) => {
            const total = m.categories.reduce((sum, c) => sum + c.items.length, 0);
            const done = m.categories.reduce((sum, c) => sum + c.items.filter(i => i.completed !== null).length, 0);
            const isActive = idx === activeMachine;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <button
                key={idx}
                onClick={() => setActiveMachine(idx)}
                style={{
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: isActive ? '2px solid var(--primary, #5B2333)' : '1px solid var(--border, #e5e5e5)',
                  background: isActive ? 'var(--primary, #5B2333)' : '#fff',
                  color: isActive ? '#fff' : 'var(--text, #333)',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 90,
                  transition: 'all 0.15s',
                }}
              >
                <span>{m.name}</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>
                  {done}/{total} {pct === 100 ? '✓' : `${pct}%`}
                </span>
              </button>
            );
          })}
        </div>

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
                        <div className={s.cameraWrapper}>
                          <button
                            className={s.cameraBtn}
                            onClick={() => setPhotoMenu(photoMenu === key ? null : key)}
                            title="Add photo"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                              <circle cx="12" cy="13" r="4"/>
                            </svg>
                          </button>
                          {photoMenu === key && (
                            <div className={s.photoPopover}>
                              <button
                                className={s.photoPopoverItem}
                                onClick={() => {
                                  setPhotoMenu(null);
                                  fileInputRefs.current[`${key}-camera`]?.click();
                                }}
                              >
                                Take Photo
                              </button>
                              <button
                                className={s.photoPopoverItem}
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
                        <button
                          className={s.fillCommentToggle}
                          onClick={() => toggleComment(catIdx, itemIdx)}
                        >
                          {showComment[key] ? 'Hide comment' : '+ Add comment'}
                        </button>
                        {item.completed !== null && item.completedBy && (
                          <span className={s.fillStampRight}>
                            {item.completedBy}{item.completedAt ? ` at ${formatStamp(item.completedAt)}` : ''}
                          </span>
                        )}
                        {/* Hidden file inputs */}
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

                      {uploading[key] && (
                        <div className={s.photoUploading}>Uploading...</div>
                      )}

                      {item.images && item.images.length > 0 && (
                        <div className={s.photoThumbs}>
                          {item.images.map((imgKey) => {
                            return (
                              <div key={imgKey} className={s.photoThumbWrapper}>
                                {imageUrls[imgKey] ? (
                                  <img
                                    className={s.photoThumb}
                                    src={imageUrls[imgKey]}
                                    alt="Uploaded"
                                    onClick={() => window.open(imageUrls[imgKey], '_blank')}
                                    style={{ cursor: 'pointer' }}
                                  />
                                ) : (
                                  <div className={s.photoThumb} style={{ background: '#f3f4f6' }} />
                                )}
                                <button
                                  className={s.photoRemoveBtn}
                                  onClick={() => handlePhotoDelete(catIdx, itemIdx, imgKey)}
                                >
                                  &times;
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          );
        })}

        {machines.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
            {machines.map((m, idx) => {
              const total = m.categories.reduce((sum, c) => sum + c.items.length, 0);
              const done = m.categories.reduce((sum, c) => sum + c.items.filter(i => i.completed !== null).length, 0);
              const isActive = idx === activeMachine;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <button
                  key={idx}
                  onClick={() => { setActiveMachine(idx); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: isActive ? '2px solid var(--primary, #5B2333)' : '1px solid var(--border, #e5e5e5)',
                    background: isActive ? 'var(--primary, #5B2333)' : '#fff',
                    color: isActive ? '#fff' : 'var(--text, #333)',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 90,
                    transition: 'all 0.15s',
                  }}
                >
                  <span>{m.name}</span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    {done}/{total} {pct === 100 ? '✓' : `${pct}%`}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="action-buttons" style={{ marginBottom: 40, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => setShowSubmitConfirm(true)} disabled={submitting || saveStatus === 'saving'}>
            Submit Checklist
          </button>
        </div>
      </div>

      {showSubmitConfirm && (() => {
        const allItems = machines.flatMap(m => m.categories.flatMap(c => c.items));
        const completed = allItems.filter(i => i.completed !== null).length;
        const total = allItems.length;
        const isComplete = completed === total;

        // Build list of incomplete items grouped by machine > category
        const incompleteItems: { machine: string; machineIdx: number; category: string; catIdx: number; description: string; itemIdx: number }[] = [];
        machines.forEach((m, mi) => {
          m.categories.forEach((c, ci) => {
            c.items.forEach((item, ii) => {
              if (item.completed === null) {
                incompleteItems.push({ machine: m.name, machineIdx: mi, category: c.name, catIdx: ci, description: item.description, itemIdx: ii });
              }
            });
          });
        });

        const jumpTo = (machineIdx: number, catIdx: number) => {
          setActiveMachine(machineIdx);
          setCollapsed((prev) => ({ ...prev, [getCollapseKey(machineIdx, catIdx)]: false }));
          setShowSubmitConfirm(false);
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 50);
        };

        return (
          <Modal onClose={() => setShowSubmitConfirm(false)}>
            {isComplete ? (
              <>
                <h2>Submit Checklist</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  All {total} items completed.
                </p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
                  Are you sure you want to submit this checklist for review?
                </p>
                {submitError && (
                  <div style={{ padding: '8px 12px', marginBottom: 12, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13, color: '#dc2626' }}>
                    {submitError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowSubmitConfirm(false)}>
                    Cancel
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={confirmSubmit} disabled={submitting}>
                    {submitting ? 'Submitting...' : 'Submit'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Cannot Submit</h2>
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {completed} out of {total} items completed.
                </p>
                <p style={{ fontSize: 13, color: 'var(--red, #dc2626)', marginBottom: 16 }}>
                  All items must be checked or marked before submitting.
                </p>
                <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                  {(() => {
                    // Group by machine
                    const grouped: Record<string, typeof incompleteItems> = {};
                    for (const item of incompleteItems) {
                      const key = item.machine;
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(item);
                    }
                    return Object.entries(grouped).map(([machineName, items]) => (
                      <div key={machineName} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 6 }}>
                          {machineName} ({items.length} remaining)
                        </div>
                        {items.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border-light, #f0f0f0)' }}>
                            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                              {item.category} &rsaquo; {item.description.length > 60 ? item.description.slice(0, 60) + '...' : item.description}
                            </span>
                            <button
                              className="btn btn-outline btn-sm"
                              style={{ flexShrink: 0, fontSize: 11, padding: '2px 8px' }}
                              onClick={() => jumpTo(item.machineIdx, item.catIdx)}
                            >
                              Go to
                            </button>
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setShowSubmitConfirm(false)}>
                    Close
                  </button>
                </div>
              </>
            )}
          </Modal>
        );
      })()}
    </div>
  );
}
