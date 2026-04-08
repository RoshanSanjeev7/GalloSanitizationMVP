import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { type Checklist, type ChecklistMachine } from '../services/api';
import Modal from '../components/Modal';
import { formatStamp } from '../utils/checklist';
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
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [photoMenu, setPhotoMenu] = useState<string | null>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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

  const loadImageUrl = async (imageKey: string) => {
    if (!id) return;
    const url = await api.getImageUrl(id, imageKey);
    setImageUrls((prev) => ({ ...prev, [imageKey]: url }));
  };

  useEffect(() => {
    if (!machines.length) return;
    const machine = machines[activeMachine];
    if (!machine) return;
    const keys = machine.categories.flatMap(c => c.items.flatMap(i => i.images || []));
    const missing = keys.filter(k => !imageUrls[k]);
    missing.forEach(k => loadImageUrl(k));
  }, [machines, activeMachine]);

  const handlePhotoUpload = async (catIdx: number, itemIdx: number, files: FileList) => {
    if (!id) return;
    const key = itemKey(catIdx, itemIdx);
    setUploading((prev) => ({ ...prev, [key]: true }));

    const result = await api.uploadImages(id, activeMachine, catIdx, itemIdx, Array.from(files));

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
                return { ...item, images: result.images };
              }),
            };
          }),
        };
      })
    );

    setUploading((prev) => ({ ...prev, [key]: false }));
  };

  const handlePhotoDelete = async (catIdx: number, itemIdx: number, imageKey: string) => {
    if (!id) return;

    const result = await api.deleteImage(id, imageKey, activeMachine, catIdx, itemIdx);

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
                return { ...item, images: result.images };
              }),
            };
          }),
        };
      })
    );
  };

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    if (!id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      api.updateChecklistItems(id, buildMachines());
    }, 1000);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [machines, commentInputs, showComment]);

  const confirmSubmit = async () => {
    if (!id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
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

  return (
    <div className="page-container">
      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="back-link" style={{ marginBottom: 0 }} onClick={async () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            if (id) await api.updateChecklistItems(id, buildMachines());
            navigate('/');
          }}>
            &larr; Back
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSubmitConfirm(true)}>
            Submit Checklist
          </button>
        </div>

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
          <div className={s.machineNav}>
            <button
              className={s.machineNavBtn}
              onClick={() => { setActiveMachine((prev) => prev - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={activeMachine === 0}
            >
              &larr; {activeMachine > 0 ? machines[activeMachine - 1].name : ''}
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {activeMachine + 1} / {machines.length}
            </span>
            <button
              className={s.machineNavBtn}
              onClick={() => { setActiveMachine((prev) => prev + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={activeMachine === machines.length - 1}
            >
              {activeMachine < machines.length - 1 ? machines[activeMachine + 1].name : ''} &rarr;
            </button>
          </div>
        )}

        <div className="action-buttons" style={{ marginBottom: 40, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={() => setShowSubmitConfirm(true)}>
            Submit Checklist
          </button>
        </div>
      </div>

      {showSubmitConfirm && (() => {
        const allItems = machines.flatMap(m => m.categories.flatMap(c => c.items));
        const completed = allItems.filter(i => i.completed !== null).length;
        const total = allItems.length;
        return (
          <Modal onClose={() => setShowSubmitConfirm(false)}>
            <h2>Submit Checklist</h2>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {completed} out of {total} items completed.
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
              Are you sure you want to submit this checklist for review?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setShowSubmitConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={confirmSubmit}>
                Submit
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
