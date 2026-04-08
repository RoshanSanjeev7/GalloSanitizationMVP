import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type Line, type Template, type MachineTemplate } from '../services/api';
import Spinner from '../components/Spinner';
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
  const [lines, setLines] = useState<Line[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lineId, setLineId] = useState('');
  const [title, setTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [machines, setMachines] = useState<MachineState[]>([emptyMachine()]);
  const [activeMachine, setActiveMachine] = useState(0);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getLines(), api.getTemplates()]).then(([lns, tpls]) => {
      setLines(lns);
      setTemplates(tpls);
      setInitialLoading(false);
    });
  }, []);

  const handleLineSelect = (newLineId: string) => {
    setLineId(newLineId);
    if (!newLineId) {
      setEditingId(null);
      setTitle('');
      setMachines([emptyMachine()]);
      setActiveMachine(0);
      return;
    }

    const existing = templates.find(t => t.lineId === newLineId);
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

  const handleSave = async () => {
    if (!title || !lineId) return;
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
        <button className="back-link" onClick={() => navigate('/admin')}>
          &larr; Back
        </button>

        <h2 className={s.pageTitle}>Checklist Template</h2>

        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Select a Line</h3>
          <div className="form-group">
            <label className="form-label">Production Line</label>
            <select
              className="form-select"
              value={lineId}
              onChange={(e) => handleLineSelect(e.target.value)}
            >
              <option value="">Choose a line...</option>
              {lines.map((l) => {
                const hasTemplate = templates.some(t => t.lineId === l.id);
                return (
                  <option key={l.id} value={l.id}>
                    {l.name}{hasTemplate ? ' — edit existing template' : ' — create new template'}
                  </option>
                );
              })}
            </select>
          </div>

          {lineId && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
              {isEditing
                ? `Editing existing template for ${selectedLine?.name}`
                : `Creating new template for ${selectedLine?.name}`}
            </p>
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
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={!title || loading}
              >
                {loading ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Template'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
