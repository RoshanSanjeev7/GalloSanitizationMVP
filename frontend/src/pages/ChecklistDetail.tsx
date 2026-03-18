import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import api, { type Checklist } from '../services/api';
import cl from '../styles/checklist.module.css';
import s from './ChecklistDetail.module.css';

export default function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [activeMachine, setActiveMachine] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [photoViewer, setPhotoViewer] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

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

  const handleDownloadPDF = () => {
    const element = exportRef.current;
    if (!element) return;
    html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `${checklist.lineName}-checklist.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(element)
      .save();
  };

  return (
    <div className="page-container">
      <div className={`main-content ${s.detailPage}`}>
        <div className={`${s.detailTopbar} no-print`}>
          <button className="back-link" onClick={() => navigate(-1)}>
            &larr; Back
          </button>
          <button className="btn btn-green btn-sm" onClick={handleDownloadPDF}>
            Download PDF
          </button>
        </div>

        <div className={s.detailTitleBlock}>
          <h1 className={s.detailTitle}>
            {checklist.lineName} &mdash; Weekly Deep Clean Checklist
          </h1>
          <p className={s.detailSubtitle}>Gallo Bottling Sanitation Hub</p>
        </div>

        <div className={s.detailMeta}>
          <div className={s.detailMetaItem}>
            <span className={s.detailMetaLabel}>OPERATOR</span>
            <span className={s.detailMetaValue}>{checklist.operatorName}</span>
          </div>
          <div className={s.detailMetaItem}>
            <span className={s.detailMetaLabel}>DATE</span>
            <span className={s.detailMetaValue}>{formatDate(start)}</span>
          </div>
          <div className={s.detailMetaItem}>
            <span className={s.detailMetaLabel}>START</span>
            <span className={s.detailMetaValue}>{formatTime(start)}</span>
          </div>
          {end && (
            <div className={s.detailMetaItem}>
              <span className={s.detailMetaLabel}>END</span>
              <span className={s.detailMetaValue}>{formatTime(end)}</span>
            </div>
          )}
          <div className={s.detailMetaItem}>
            <span className={s.detailMetaLabel}>DURATION</span>
            <span className={s.detailMetaValue}>{durationMin} min</span>
          </div>
          <div className={s.detailMetaItem}>
            <span className={s.detailMetaLabel}>STATUS</span>
            <span className={s.detailMetaValue}>
              {statusLabel[checklist.status] || checklist.status}
            </span>
          </div>
        </div>

        <select
          className={`form-select ${s.detailMachineSelect}`}
          value={activeMachine}
          onChange={(e) => setActiveMachine(Number(e.target.value))}
        >
          {checklist.machines.map((m, idx) => {
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
                          <div className={`${cl.issueBox} ${s.detailIssueBox}`}>
                            <strong>Issue Reported</strong>
                            {item.issue}
                          </div>
                        )}
                        {(item.photos || []).length > 0 && (
                          <div className={s.detailPhotos}>
                            {(item.photos || []).map((url, pi) => (
                              <img
                                key={pi}
                                src={url}
                                alt={`Photo ${pi + 1}`}
                                className={s.detailPhotoThumb}
                                onClick={() => setPhotoViewer(url)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span
                      className={`${cl.fillTaskStatus} ${item.completed === true ? s.statusPass : item.completed === false ? s.statusFail : s.statusPending}`}
                    >
                      {item.completed === true ? '\u2713' : item.completed === false ? '\u2717' : '\u2014'}
                    </span>
                  </div>
                ))}
            </div>
          );
        })}

        {/* Off-screen content for PDF export - using visibility hidden instead of position off-screen for html2pdf compatibility */}
        <div
          ref={exportRef}
          style={{ position: 'absolute', visibility: 'hidden', width: '800px', background: '#fff', padding: '24px', zIndex: -1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#888', paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px solid #ddd' }}>
            <span>{formatDateTime(start)}</span>
            <span>{checklist.lineName} Checklist</span>
          </div>

          <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#5B2333', marginBottom: '4px' }}>
            {checklist.lineName} — Weekly Deep Clean Checklist
          </h1>
          <p style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Gallo Bottling Sanitation Hub</p>

          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>OPERATOR</div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{checklist.operatorName}</div>
            </div>
            <div>
              <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', color: '#888', letterSpacing: '0.5px' }}>DATE</div>
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{formatDate(start)}</div>
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
              <div style={{ fontSize: '11px', fontWeight: 600 }}>{statusLabel[checklist.status] || checklist.status}</div>
            </div>
          </div>

          {checklist.machines.map((machine, mIdx) => (
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
                    <div key={itemIdx}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '3px 0', borderBottom: (item.photos || []).length > 0 ? 'none' : '1px solid #f3f4f6', gap: '12px' }}>
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
                          {item.completed === true ? 'Complete' : item.completed === false ? 'Incomplete' : 'Pending'}
                        </span>
                      </div>
                      {(item.photos || []).length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '4px 0 4px 19px', borderBottom: '1px solid #f3f4f6' }}>
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
