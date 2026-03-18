import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { type Line, type MachineTemplate } from '../services/api';
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

export default function CreateTemplate() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [lineId, setLineId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [machines, setMachines] = useState<MachineState[]>([
    { name: '', categories: [{ name: '', tasks: [{ description: '' }] }] },
  ]);
  const [activeMachine, setActiveMachine] = useState(0);

  useEffect(() => {
    api.getLines().then(setLines);
  }, []);

  const updateMachineName = (idx: number, name: string) => {
    setMachines((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, name } : m))
    );
  };

  const addMachine = () => {
    setMachines((prev) => [
      ...prev,
      { name: '', categories: [{ name: '', tasks: [{ description: '' }] }] },
    ]);
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
        return {
          ...m,
          categories: m.categories.map((c, ci) =>
            ci === catIdx ? { ...c, name } : c
          ),
        };
      })
    );
  };

  const addCategory = () => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return {
          ...m,
          categories: [...m.categories, { name: '', tasks: [{ description: '' }] }],
        };
      })
    );
  };

  const removeCategory = (catIdx: number) => {
    setMachines((prev) =>
      prev.map((m, mi) => {
        if (mi !== activeMachine) return m;
        return {
          ...m,
          categories: m.categories.filter((_, ci) => ci !== catIdx),
        };
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
            return {
              ...c,
              tasks: c.tasks.map((t, ti) =>
                ti === taskIdx ? { ...t, description } : t
              ),
            };
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

  const handleCreate = async () => {
    if (!title || !lineId) return;
    const builtMachines: MachineTemplate[] = machines
      .filter((m) => m.name.trim())
      .map((m) => ({
        name: m.name,
        categories: m.categories
          .filter((c) => c.name.trim())
          .map((c) => ({
            name: c.name,
            tasks: c.tasks
              .filter((t) => t.description.trim())
              .map((t) => ({
                description: t.description,
                machine: null,
              })),
          })),
      }));

    await api.createTemplate({ title, lineId, machines: builtMachines });
    navigate('/admin');
  };

  const currentMachine = machines[activeMachine];

  return (
    <div className="page-container">
      <div className="main-content">
        <button className="back-link" onClick={() => navigate('/admin')}>
          &larr; Back
        </button>

        <h2 className={s.pageTitle}>Create Checklist Template</h2>

        <div className={`card ${s.detailsCard}`}>
          <h3 className={s.sectionTitle}>Template Details</h3>
          <div className="form-group">
            <label className="form-label">Template Title</label>
            <input
              className="form-input"
              placeholder="Deep Clean Checklist"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Assign to Line</label>
            <select
              className="form-select"
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
            >
              <option value="">Select a line...</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={s.sectionRow}>
          <h3 className={s.sectionTitle}>Machines</h3>
          <button className={s.addLink} onClick={addMachine}>
            + Add Machine
          </button>
        </div>

        <div className={s.machineTabs}>
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

        <div className={`card ${s.machineCard}`}>
          <div className={s.sectionRow}>
            <span className={s.sectionHeader}>MACHINE NAME</span>
            {machines.length > 1 && (
              <button className={s.removeBtn} onClick={() => removeMachine(activeMachine)}>
                &times;
              </button>
            )}
          </div>
          <input
            className={`form-input ${s.machineNameInput}`}
            placeholder="e.g. Filler"
            value={currentMachine.name}
            onChange={(e) => updateMachineName(activeMachine, e.target.value)}
          />

          <div className={s.sectionRow}>
            <h3 className={s.sectionSubtitle}>Categories</h3>
            <button className={s.addLink} onClick={addCategory}>
              + Add Category
            </button>
          </div>

          {currentMachine.categories.map((cat, catIdx) => (
            <div key={catIdx} className={s.templateSection}>
              <div className={s.sectionRow}>
                <span className={s.sectionHeader}>CATEGORY NAME</span>
                {currentMachine.categories.length > 1 && (
                  <button className={s.removeBtn} onClick={() => removeCategory(catIdx)}>
                    &times;
                  </button>
                )}
              </div>
              <input
                className={`form-input ${s.categoryNameInput}`}
                placeholder="e.g. Prep"
                value={cat.name}
                onChange={(e) => updateCategory(catIdx, e.target.value)}
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

        <div className={`action-buttons ${s.createActions}`}>
          <button className="btn btn-outline" onClick={() => navigate('/admin')}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={!title || !lineId}
          >
            Create Template
          </button>
        </div>
      </div>
    </div>
  );
}
