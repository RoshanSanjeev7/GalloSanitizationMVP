import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api, { type Checklist } from '../services/api';
import cl from '../styles/checklist.module.css';
import s from './ChecklistDetail.module.css';

export default function ChecklistDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [activeMachine, setActiveMachine] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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

  return (
    <div className="page-container">
      <div className={`main-content ${s.detailPage}`}>
        <div className={`${s.detailTopbar} no-print`}>
          <button className="back-link" onClick={() => navigate(-1)} style={{ marginBottom: 0 }}>
            &larr; Back
          </button>
          <button className="btn btn-green btn-sm" onClick={() => window.print()}>
            Export PDF
          </button>
        </div>

        <div className={s.printHeader}>
          <span>{formatDateTime(start)}</span>
          <span>{checklist.lineName} Checklist</span>
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
