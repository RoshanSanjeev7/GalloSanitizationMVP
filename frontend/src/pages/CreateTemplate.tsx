import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api, { type Line, type Template, type MachineTemplate, type Factory } from '../services/api';
import type { RootState } from '../store';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { TEMPLATE_RETENTION_DAYS } from '../config/constants';
import s from './CreateTemplate.module.css';

interface TaskState {
  description: string;
}

interface CategoryState {
  name: string;
  tasks: TaskState[];
}

interface MachineState {
  name: string;
  categories: CategoryState[];
}

const emptyMachine = (): MachineState => ({
  name: '',
  categories: [{ name: '', tasks: [{ description: '' }] }],
});

export default function CreateTemplate() {
  const navigate = useNavigate();
  const user = useSelector((st: RootState) => st.auth.user);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [factoryFilter, setFactoryFilter] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lineId, setLineId] = useState('');
  const [title, setTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineState[]>([emptyMachine()]);
  const [activeMachine, setActiveMachine] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [newLineName, setNewLineName] = useState('');
  const [showNewLine, setShowNewLine] = useState(false);
  const [creatingLine, setCreatingLine] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Manage-factories modal state. Co-located here (vs. its own page)
  // because admins almost always manage factories in the same flow as
  // setting one for a template.
  const [showFactoryModal, setShowFactoryModal] = useState(false);
  const [newFactoryName, setNewFactoryName] = useState('');
  const [newFactoryLocation, setNewFactoryLocation] = useState('');
  const [creatingFactory, setCreatingFactory] = useState(false);
  const [deleteFactoryTarget, setDeleteFactoryTarget] = useState<Factory | null>(null);
  const [factoryError, setFactoryError] = useState('');

  useEffect(() => {
    Promise.all([api.getLines(), api.getTemplates({ includeDeleted: 'true' }), api.getFactories()]).then(([lns, tpls, fcts]) => {
      setLines(lns);
      setTemplates(tpls);
      setFactories(fcts);
      // Autofill factory selector with the admin's primary factory.
      // Admins are scoped to their assigned factories; if they have
      // multiple, default to the first and let them switch.
      if (!factoryFilter) {
        const adminFactories = user?.factoryIds ?? [];
        const visible = fcts.filter(f => adminFactories.length === 0 || adminFactories.includes(f.id));
        if (visible.length > 0) setFactoryFilter(visible[0].id);
      }
      setInitialLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Factories the current admin is allowed to author templates for.
  // Admins with no assignment see all (legacy behavior); otherwise
  // filtered to their assigned set.
  const allowedFactories = (user?.factoryIds && user.factoryIds.length > 0)
    ? factories.filter(f => user.factoryIds!.includes(f.id))
    : factories;

  const handleLineSelect = (newLineId: string) => {
    setLineId(newLineId);
    if (!newLineId) {
      setEditingId(null);
      setTitle('');
      setMachines([emptyMachine()]);
      setActiveMachine(0);
      return;
    }

    const existing = templates.find(t => t.lineId === newLineId && !t.deleted);
    if (existing) {
      setEditingId(existing.id);
      setTitle(existing.title);
      setMachines(
        existing.machines.map(m => ({
          name: m.name,
          categories: m.categories.map(c => ({
            name: c.name,
            tasks: c.tasks.map(t => ({ description: t.description })),
          })),
        }))
      );
      setActiveMachine(0);
    } else {
      setEditingId(null);
      setTitle('');
      setMachines([emptyMachine()]);
      setActiveMachine(0);
    }
  };

  const handleCreateFactory = async () => {
    if (!newFactoryName.trim() || !newFactoryLocation.trim()) return;
    setCreatingFactory(true);
    setFactoryError('');
    try {
      const created = await api.createFactory({ name: newFactoryName.trim(), location: newFactoryLocation.trim() });
      const refreshed = await api.getFactories();
      setFactories(refreshed);
      setNewFactoryName('');
      setNewFactoryLocation('');
      // Auto-switch the dropdown to the just-created factory so the
      // admin can immediately start authoring a template under it.
      setFactoryFilter(created.id);
      if (lineId) handleLineSelect('');
    } catch (err) {
      setFactoryError((err as Error).message);
    } finally {
      setCreatingFactory(false);
    }
  };

  const handleDeleteFactory = async () => {
    if (!deleteFactoryTarget) return;
    try {
      await api.deleteFactory(deleteFactoryTarget.id);
      const refreshed = await api.getFactories();
      setFactories(refreshed);
      // If we deleted the currently-selected factory, fall back to the
      // first remaining one the admin is allowed to see.
      if (factoryFilter === deleteFactoryTarget.id) {
        const adminFactories = user?.factoryIds ?? [];
        const visible = refreshed.filter(f => adminFactories.length === 0 || adminFactories.includes(f.id));
        setFactoryFilter(visible[0]?.id ?? '');
        if (lineId) handleLineSelect('');
      }
      setDeleteFactoryTarget(null);
    } catch (err) {
      setFactoryError((err as Error).message);
      setDeleteFactoryTarget(null);
    }
  };

  const handleCreateLine = async () => {
    if (!newLineName.trim()) return;
    setCreatingLine(true);
    try {
      // Stamp the new line with the currently-selected factory so any
      // checklist created from this template inherits the right scope.
      // Without this, the line would be unscoped and visible to no one.
      const newLine = await api.createLine(newLineName.trim(), factoryFilter || undefined);
      setLines(prev => [...prev, newLine]);
      setNewLineName('');
      setShowNewLine(false);
      handleLineSelect(newLine.id);
    } finally {
      setCreatingLine(false);
    }
  };

  const filteredLines = factoryFilter
    ? lines.filter(l => l.factoryId === factoryFilter)
    : lines;

  const selectedLine = lines.find(l => l.id === lineId);
  const isEditing = editingId !== null;

  const updateMachineName = (idx: number, name: string) => {
    setMachines((prev) => prev.map((m, i) => (i === idx ? { ...m, name } : m)));
  };

  const addMachine = () => {
    setMachines((prev) => [...prev, emptyMachine()]);
    setActiveMachine(machines.length);
  };

  const removeMachine = (idx: number) => {
    setMachines((prev) => prev.filter((_, i) => i !== idx));
    if (activeMachine >= machines.length - 1) {
      setActiveMachine(Math.max(0, machines.length - 2));
    }
  };

  const updateCategory = (catIdx: number, name: string) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return { ...m, categories: m.categories.map((c, ci) => ci === catIdx ? { ...c, name } : c) };
      })
    );
  };

  const addCategory = () => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return { ...m, categories: [...m.categories, { name: '', tasks: [{ description: '' }] }] };
      })
    );
  };

  const removeCategory = (catIdx: number) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return { ...m, categories: m.categories.filter((_, ci) => ci !== catIdx) };
      })
    );
  };

  const updateTask = (catIdx: number, taskIdx: number, description: string) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return {
          ...m,
          categories: m.categories.map((c, ci) => {
            if (ci !== catIdx) return c;
            return { ...c, tasks: c.tasks.map((t, ti) => ti === taskIdx ? { ...t, description } : t) };
          }),
        };
      })
    );
  };

  const addTask = (catIdx: number) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return {
          ...m,
          categories: m.categories.map((c, ci) => {
            if (ci !== catIdx) return c;
            return { ...c, tasks: [...c.tasks, { description: '' }] };
          }),
        };
      })
    );
  };

  const removeTask = (catIdx: number, taskIdx: number) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return {
          ...m,
          categories: m.categories.map((c, ci) => {
            if (ci !== catIdx) return c;
            return { ...c, tasks: c.tasks.filter((_, ti) => ti !== taskIdx) };
          }),
        };
      })
    );
  };

  const buildMachines = (): MachineTemplate[] =>
    machines
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name,
        categories: m.categories
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name,
            tasks: c.tasks
              .filter((t) => t.description.trim())
              .map((t) => ({ description: t.description, machine: null })),
          })),
      }));

  // Validate that every field is filled: title, all machine names, all category names, all task descriptions
  const isValid = (() => {
    if (!title.trim() || !lineId) return false;
    for (const m of machines) {
      if (!m.name.trim()) return false;
      if (m.categories.length === 0) return false;
      for (const c of m.categories) {
        if (!c.name.trim()) return false;
        if (c.tasks.length === 0) return false;
        for (const t of c.tasks) {
          if (!t.description.trim()) return false;
        }
      }
    }
    return machines.length > 0;
  })();

  const handleSave = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      if (editingId) {
        await api.updateTemplate(editingId, { title, lineId, machines: buildMachines() });
      } else {
        await api.createTemplate({ title, lineId, machines: buildMachines() });
      }
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    setDeleting(true);
    try {
      await api.deleteTemplate(editingId);
      const fresh = await api.getTemplates({ includeDeleted: 'true' });
      setTemplates(fresh);
      setEditingId(null);
      setTitle('');
      setMachines([emptyMachine()]);
      setActiveMachine(0);
      setLineId('');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="page-container">
        <div className="main-content"><Spinner label="Loading..." /></div>
      </div>
    );
  }

  const currentMachine = machines[activeMachine];

  return (
    <div className="page-container">
      <div className="main-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <button className="back-link" style={{ marginBottom: 0 }} onClick={() => navigate('/admin')}>
            &larr; Back
          </button>
          {lineId && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isEditing && (() => {
                const tpl = templates.find(t => t.lineId === lineId && !t.deleted);
                const isPublished = tpl?.published !== false;
                return (
                  <button
                    className={isPublished ? 'btn btn-outline btn-sm' : 'btn btn-green btn-sm'}
                    onClick={async () => {
                      if (!editingId) return;
                      const result = await api.publishTemplate(editingId, !isPublished);
                      setTemplates(prev => prev.map(t => t.id === editingId ? { ...t, published: result.published } : t));
                    }}
                    style={!isPublished ? { background: '#16a34a', color: '#fff', border: 'none' } : {}}
                  >
                    {isPublished ? 'Unpublish' : 'Publish'}
                  </button>
                );
              })()}
              <button
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={!isValid || loading}
              >
                {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          )}
        </div>

        <h2 className={s.pageTitle}>Checklist Template</h2>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Select a Line</h3>
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label className="form-label">Factory</label>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: 11, padding: '2px 8px' }}
                onClick={() => { setFactoryError(''); setShowFactoryModal(true); }}
              >
                Manage factories
              </button>
            </div>
            {allowedFactories.length > 1 ? (
              <select
                className="form-select"
                value={factoryFilter}
                onChange={(e) => {
                  setFactoryFilter(e.target.value);
                  // Clear line selection when factory changes — the
                  // currently-picked line probably belongs to a
                  // different factory and the dropdown won't show it.
                  if (lineId) handleLineSelect('');
                }}
              >
                {allowedFactories.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            ) : allowedFactories.length === 1 ? (
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', padding: '8px 0' }}>
                {allowedFactories[0].name}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '8px 0' }}>
                No factories yet — click "Manage factories" to add one.
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Production Line</label>
            <select
              className="form-select"
              value={lineId}
              onChange={(e) => handleLineSelect(e.target.value)}
            >
              <option value="">Choose a line...</option>
              {filteredLines.map((l) => {
                const hasTemplate = templates.some(t => t.lineId === l.id && !t.deleted);
                return (
                  <option key={l.id} value={l.id}>
                    {l.name}{hasTemplate ? ' — edit existing template' : ' — create new template'}
                  </option>
                );
              })}
            </select>
          </div>

          {lineId && isEditing && (() => {
            const tpl = templates.find(t => t.lineId === lineId && !t.deleted);
            return tpl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: tpl.published !== false ? '#dcfce7' : '#fef3c7',
                  color: tpl.published !== false ? '#166534' : '#92400e',
                }}>
                  {tpl.published !== false ? 'Published' : 'Draft'}
                </span>
                {tpl.updatedAt && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Updated {new Date(tpl.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            ) : null;
          })()}

          {lineId && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              {isEditing
                ? `Editing existing template for ${selectedLine?.name}`
                : `Creating new template for ${selectedLine?.name}`}
            </p>
          )}

          {!showNewLine ? (
            <button className={s.addLink} style={{ marginTop: 12 }} onClick={() => setShowNewLine(true)}>
              + Create New Line
            </button>
          ) : (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="form-input"
                placeholder="e.g. Line 94"
                value={newLineName}
                onChange={(e) => setNewLineName(e.target.value)}
                style={{ flex: 1, marginBottom: 0 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreateLine}
                disabled={!newLineName.trim() || creatingLine}
              >
                {creatingLine ? 'Creating...' : 'Create'}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() => { setShowNewLine(false); setNewLineName(''); }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {lineId && (
          <>
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="form-group">
                <label className="form-label">Template Title</label>
                <input
                  className="form-input"
                  placeholder="e.g. Weekly Deep Clean Checklist"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15 }}>Machines</h3>
              <button className={s.addLink} onClick={addMachine}>
                + Add Machine
              </button>
            </div>

            <div className={s.machineTabs} style={{ marginBottom: 20 }}>
              {machines.map((m, idx) => (
                <button
                  key={idx}
                  className={`${s.machineTab} ${idx === activeMachine ? s.machineTabActive : ''}`}
                  onClick={() => setActiveMachine(idx)}
                >
                  {m.name || `Machine ${idx + 1}`}
                </button>
              ))}
            </div>

            <div className="card" style={{ marginBottom: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className={s.sectionHeader}>MACHINE NAME</span>
                {machines.length > 1 && (
                  <button className={s.removeBtn} onClick={() => removeMachine(activeMachine)}>
                    &times;
                  </button>
                )}
              </div>
              <input
                className="form-input"
                placeholder="e.g. Filler"
                value={currentMachine.name}
                onChange={(e) => updateMachineName(activeMachine, e.target.value)}
                style={{ marginBottom: 20 }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: 14 }}>Categories</h3>
                <button className={s.addLink} onClick={addCategory}>
                  + Add Category
                </button>
              </div>

              {currentMachine.categories.map((cat, catIdx) => (
                <div key={catIdx} className={s.templateSection}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={s.sectionHeader}>CATEGORY NAME</span>
                    {currentMachine.categories.length > 1 && (
                      <button className={s.removeBtn} onClick={() => removeCategory(catIdx)}>
                        &times;
                      </button>
                    )}
                  </div>
                  <input
                    className="form-input"
                    placeholder="e.g. Prep"
                    value={cat.name}
                    onChange={(e) => updateCategory(catIdx, e.target.value)}
                    style={{ marginBottom: 12 }}
                  />

                  <span className={s.sectionHeader}>TASKS</span>
                  {cat.tasks.map((task, taskIdx) => (
                    <div key={taskIdx} className={s.taskInputRow}>
                      <input
                        className="form-input"
                        placeholder="Enter task description..."
                        value={task.description}
                        onChange={(e) => updateTask(catIdx, taskIdx, e.target.value)}
                      />
                      {cat.tasks.length > 1 && (
                        <button
                          className={s.removeBtn}
                          onClick={() => removeTask(catIdx, taskIdx)}
                        >
                          &times;
                        </button>
                      )}
                    </div>
                  ))}
                  <button className={s.addLink} onClick={() => addTask(catIdx)}>
                    + Add Task
                  </button>
                </div>
              ))}
            </div>

            <div className="action-buttons" style={{ marginTop: 24, marginBottom: 40 }}>
              <button className="btn btn-outline" onClick={() => navigate('/admin')}>
                Cancel
              </button>
              {isEditing && (
                <button
                  className="btn btn-red-outline"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Template
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!isValid || loading}
              >
                {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </>
        )}
      </div>

      {showFactoryModal && (
        <Modal onClose={() => setShowFactoryModal(false)}>
          <h2 style={{ marginBottom: 16 }}>Manage Factories</h2>

          {factoryError && (
            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'var(--red-light)', border: '1px solid var(--red-border)', borderRadius: 'var(--radius)', color: 'var(--red)', fontSize: 12 }}>
              {factoryError}
            </div>
          )}

          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>Add New Factory</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="form-input"
                placeholder="Name (e.g. Modesto Plant)"
                value={newFactoryName}
                onChange={(e) => setNewFactoryName(e.target.value)}
                style={{ flex: 1, minWidth: 140, fontSize: 13 }}
              />
              <input
                className="form-input"
                placeholder="Location (e.g. Modesto, CA)"
                value={newFactoryLocation}
                onChange={(e) => setNewFactoryLocation(e.target.value)}
                style={{ flex: 1, minWidth: 140, fontSize: 13 }}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleCreateFactory}
                disabled={!newFactoryName.trim() || !newFactoryLocation.trim() || creatingFactory}
              >
                {creatingFactory ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>Existing Factories</h3>
            {factories.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No factories yet.</p>
            ) : (
              factories.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border-light)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.location}</div>
                  </div>
                  <button
                    className="btn btn-red-outline btn-sm"
                    style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => setDeleteFactoryTarget(f)}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setShowFactoryModal(false)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {deleteFactoryTarget && (
        <Modal onClose={() => setDeleteFactoryTarget(null)}>
          <h2>Delete Factory</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Are you sure you want to delete <strong>{deleteFactoryTarget.name}</strong>?
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
            Lines and checklists tied to this factory keep their data but stop being grouped under it.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setDeleteFactoryTarget(null)}>
              Cancel
            </button>
            <button className="btn btn-red-outline btn-sm" onClick={handleDeleteFactory}>
              Delete
            </button>
          </div>
        </Modal>
      )}

      {showDeleteConfirm && (
        <Modal onClose={() => setShowDeleteConfirm(false)}>
          <h2>Delete Template</h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Are you sure you want to delete the template for <strong>{selectedLine?.name}</strong>?
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>
            The template will be moved to the deleted section and can be restored within {TEMPLATE_RETENTION_DAYS} days. After {TEMPLATE_RETENTION_DAYS} days it will be permanently removed.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </button>
            <button className="btn btn-red-outline btn-sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}

      {(() => {
        const deletedTemplates = templates.filter(t => t.deleted);
        if (deletedTemplates.length === 0) return null;

        return (
          <div style={{ marginTop: 32, padding: 20, background: '#fef2f2', borderRadius: 12, border: '1px solid #fca5a5' }}>
            <h3 style={{ fontSize: 15, marginBottom: 12, color: '#dc2626' }}>Deleted Templates</h3>
            <p style={{ fontSize: 12, color: '#991b1b', marginBottom: 12 }}>
              These templates will be permanently deleted after {TEMPLATE_RETENTION_DAYS} days.
            </p>
            {deletedTemplates.map((t) => {
              const deletedDate = t.deletedAt ? new Date(t.deletedAt) : new Date();
              const daysLeft = Math.max(0, TEMPLATE_RETENTION_DAYS - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)));
              const lineName = lines.find(l => l.id === t.lineId)?.name || 'Unknown Line';
              return (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #fecaca' }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{t.title}</span>
                    <span style={{ fontSize: 12, color: '#991b1b', marginLeft: 8 }}>{lineName} — {daysLeft} days remaining</span>
                  </div>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={async () => {
                      await api.restoreTemplate(t.id);
                      const fresh = await api.getTemplates({ includeDeleted: 'true' });
                      setTemplates(fresh);
                    }}
                  >
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
