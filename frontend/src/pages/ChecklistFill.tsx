import { useEffect, useState, useRef } from 'react';
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
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [photoViewer, setPhotoViewer] = useState<string | null>(null);
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

  const handlePhotoUpload = async (catIdx: number, itemIdx: number, file: File) => {
    const key = itemKey(catIdx, itemIdx);
    setUploading((prev) => ({ ...prev, [key]: true }));

    try {
      const { url } = await api.uploadPhoto(file);
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
                  return {
                    ...item,
                    photos: [...(item.photos || []), url],
                  };
                }),
              };
            }),
          };
        })
      );
    } catch {
      // upload failed silently
    } finally {
      setUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const removePhoto = (catIdx: number, itemIdx: number, photoIdx: number) => {
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
                return {
                  ...item,
                  photos: (item.photos || []).filter((_, pi) => pi !== photoIdx),
                };
              }),
            };
          }),
        };
      })
    );
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
        <button className="back-link" onClick={handleSave}>
          &larr; Back
        </button>

        <h2 className={s.fillTitle}>{checklist.lineName} &mdash; Deep Clean</h2>
        <p className={s.fillSubtitle}>
          {checklist.operatorName} &middot; Started{' '}
          {new Date(checklist.startTime).toLocaleString()}
        </p>

        <select
          className={`form-select ${s.machineSelect}`}
          value={activeMachine}
          onChange={(e) => setActiveMachine(Number(e.target.value))}
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
                  const photos = item.photos || [];
                  const isUploading = uploading[key];

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
                        <div className={s.fillFooterButtons}>
                          <button
                            className={s.fillCommentToggle}
                            onClick={() => toggleComment(catIdx, itemIdx)}
                          >
                            {showComment[key] ? 'Hide comment' : '+ Comment'}
                          </button>
                          <button
                            className={s.fillPhotoBtn}
                            onClick={() => fileInputRefs.current[key]?.click()}
                            disabled={isUploading}
                          >
                            {isUploading ? 'Uploading...' : '+ Photo'}
                          </button>
                          <input
                            ref={(el) => { fileInputRefs.current[key] = el; }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                handlePhotoUpload(catIdx, itemIdx, file);
                                e.target.value = '';
                              }
                            }}
                          />
                        </div>
                        {item.completed !== null && item.completedBy && (
                          <span className={cl.fillStamp}>
                            {item.completedBy}{item.completedAt ? ` at ${formatStamp(item.completedAt)}` : ''}
                          </span>
                        )}
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

                      {photos.length > 0 && (
                        <div className={s.photoGrid}>
                          {photos.map((url, photoIdx) => (
                            <div key={photoIdx} className={s.photoThumb}>
                              <img
                                src={url}
                                alt={`Photo ${photoIdx + 1}`}
                                onClick={() => setPhotoViewer(url)}
                              />
                              <button
                                className={s.photoRemove}
                                onClick={() => removePhoto(catIdx, itemIdx, photoIdx)}
                                title="Remove photo"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
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
            <span className={s.machineNavCounter}>
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

        <div className={`action-buttons ${s.fillActions}`}>
          <button className="btn btn-primary" onClick={handleSubmit}>
            Submit Checklist
          </button>
          <button className="btn btn-outline" onClick={handleSave}>
            Save &amp; Exit
          </button>
        </div>
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
