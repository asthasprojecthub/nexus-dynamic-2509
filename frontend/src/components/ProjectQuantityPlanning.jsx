import React from 'react';
import { Plus, SplitSquareHorizontal, Trash2 } from 'lucide-react';
import { Input, SecondaryButton } from './ui';

const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const makeGroups = (qty) => {
  const total = Math.max(1, Number(qty) || 1);
  if (total <= 1) return [];
  // Separate mode starts with one quantity group. The user explicitly adds
  // more planning grids, splitting this quantity until the required layout is reached.
  return [{ id: uid(), qty: total }];
};

export function normalizeProjectPanel(panel = {}, index = 0) {
  const qty = Math.max(1, Number(panel.qty) || 1);
  const planningMode = qty > 1 && panel.planning_mode === 'separate' ? 'separate' : 'common';
  let groups = Array.isArray(panel.planning_groups)
    ? panel.planning_groups.map((group) => ({ id: group.id || uid(), qty: Math.max(1, Number(group.qty) || 1) }))
    : [];

  if (planningMode === 'separate') {
    if (!groups.length) groups = makeGroups(qty);
  } else {
    groups = [];
  }

  return {
    ...panel,
    qty,
    planning_mode: planningMode,
    planning_groups: groups,
    planning_key: panel.planning_key || `${panel.panel_id || panel.panel_master_id || 'panel'}::${panel.panel_no || index + 1}`,
  };
}

export function normalizeProjectPanels(panels = []) {
  return (panels || []).map((panel, index) => normalizeProjectPanel(panel, index));
}

export function setProjectPanelQty(panel, qty) {
  const nextQty = Math.max(1, Number(qty) || 1);
  const current = normalizeProjectPanel(panel);
  if (nextQty <= 1) return normalizeProjectPanel({ ...current, qty: 1, planning_mode: 'common', planning_groups: [] });
  if (current.planning_mode !== 'separate') return normalizeProjectPanel({ ...current, qty: nextQty, planning_mode: 'common', planning_groups: [] });

  let groups = current.planning_groups.map((group) => ({ ...group }));
  if (groups.length > nextQty || !groups.length) groups = makeGroups(nextQty);
  else {
    const beforeLast = groups.slice(0, -1).reduce((total, group) => total + Math.max(1, Number(group.qty) || 1), 0);
    if (beforeLast >= nextQty) groups = makeGroups(nextQty);
    else groups[groups.length - 1].qty = nextQty - beforeLast;
  }
  return normalizeProjectPanel({ ...current, qty: nextQty, planning_mode: 'separate', planning_groups: groups });
}

export function setProjectPanelMode(panel, mode) {
  const current = normalizeProjectPanel(panel);
  if (current.qty <= 1 || mode !== 'separate') return normalizeProjectPanel({ ...current, planning_mode: 'common', planning_groups: [] });
  return normalizeProjectPanel({ ...current, planning_mode: 'separate', planning_groups: current.planning_groups?.length ? current.planning_groups : makeGroups(current.qty) });
}

export function addProjectPlanningGroup(panel) {
  const current = setProjectPanelMode(panel, 'separate');
  if (current.qty <= 1 || current.planning_groups.length >= current.qty) return current;
  const groups = current.planning_groups.map((group) => ({ ...group }));
  let splitIndex = -1;
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (groups[i].qty > 1) { splitIndex = i; break; }
  }
  if (splitIndex < 0) return current;
  groups[splitIndex].qty -= 1;
  groups.push({ id: uid(), qty: 1 });
  return { ...current, planning_groups: groups };
}

export function updateProjectPlanningGroupQty(panel, groupId, qty) {
  const current = setProjectPanelMode(panel, 'separate');
  const groups = current.planning_groups.map((group) => ({ ...group, qty: Math.max(1, Number(group.qty) || 1) }));
  const changedIndex = groups.findIndex((group) => group.id === groupId);
  if (changedIndex < 0) return current;
  const maxForTarget = Math.max(1, current.qty - (groups.length - 1));
  groups[changedIndex].qty = Math.max(1, Math.min(maxForTarget, Number.parseInt(qty, 10) || 1));
  let remaining = current.qty - groups[changedIndex].qty;
  const others = groups.map((_, index) => index).filter((index) => index !== changedIndex);
  for (let pos = 0; pos < others.length; pos += 1) {
    const index = others[pos];
    const remainingSlots = others.length - pos - 1;
    const maxHere = Math.max(1, remaining - remainingSlots);
    groups[index].qty = Math.max(1, Math.min(groups[index].qty, maxHere));
    remaining -= groups[index].qty;
  }
  if (remaining > 0 && others.length) groups[others[others.length - 1]].qty += remaining;
  return { ...current, planning_groups: groups };
}

export function removeProjectPlanningGroup(panel, groupId) {
  const current = setProjectPanelMode(panel, 'separate');
  if (current.planning_groups.length <= 2) return current;
  const index = current.planning_groups.findIndex((group) => group.id === groupId);
  if (index < 0) return current;
  const groups = current.planning_groups.map((group) => ({ ...group }));
  const [removed] = groups.splice(index, 1);
  const target = Math.max(0, index - 1);
  groups[target].qty += removed.qty;
  return { ...current, planning_groups: groups };
}

export function validateProjectPanelPlanning(panels = []) {
  for (const rawPanel of panels || []) {
    const panel = normalizeProjectPanel(rawPanel);
    if (panel.qty > 1 && panel.planning_mode === 'separate') {
      const groups = panel.planning_groups || [];
      if (groups.length < 2) return `${panel.panel_no || panel.panel || 'Panel'} requires at least two planning grids in Separate mode.`;
      if (groups.some((group) => Number(group.qty) < 1)) return `${panel.panel_no || panel.panel || 'Panel'} planning-grid quantity must be at least 1.`;
      const sum = groups.reduce((total, group) => total + Number(group.qty || 0), 0);
      if (sum !== panel.qty) return `${panel.panel_no || panel.panel || 'Panel'} separate planning-grid quantities total ${sum}, but panel Qty is ${panel.qty}.`;
    }
  }
  return '';
}

export function expandPanelsForPlanning(panels = []) {
  return normalizeProjectPanels(panels).flatMap((panel, index) => {
    const panelName = panel.panel || panel.panel_type || 'Panel';
    const panelNo = panel.panel_no || `P-${String(index + 1).padStart(2, '0')}`;
    const baseKey = panel.planning_key || `${panel.panel_id || panel.panel_master_id || 'panel'}::${panelNo}`;

    if (panel.qty <= 1 || panel.planning_mode !== 'separate') {
      return [{
        ...panel,
        planning_base_key: baseKey,
        planning_key: `${baseKey}::common`,
        planning_label: `${panelNo} · ${panelName} · Common · Qty ${panel.qty}`,
        planning_grid_no: 1,
      }];
    }

    return panel.planning_groups.map((group, groupIndex) => ({
      ...panel,
      planning_base_key: baseKey,
      planning_key: `${baseKey}::${group.id}`,
      planning_label: `${panelNo} · ${panelName} · Planning Grid ${groupIndex + 1} · Qty ${group.qty}`,
      planning_grid_no: groupIndex + 1,
      planning_group_id: group.id,
      planning_group_qty: group.qty,
    }));
  });
}

export default function ProjectQuantityPlanning({ panel, onChange, compact = false }) {
  const current = normalizeProjectPanel(panel);
  if (current.qty <= 1) return null;

  const sum = (current.planning_groups || []).reduce((total, group) => total + Number(group.qty || 0), 0);
  const sumValid = current.planning_mode !== 'separate' || sum === current.qty;

  return (
    <div className={`mt-2 rounded-xl border border-slate-200 bg-white ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">Planning Mode</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Qty {current.qty}: use one common grid or split the quantity into separate planning grids.</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          {['common', 'separate'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(setProjectPanelMode(current, mode))}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${current.planning_mode === mode ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}
            >
              {mode === 'common' ? 'Common' : 'Separate'}
            </button>
          ))}
        </div>
      </div>

      {current.planning_mode === 'separate' && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><SplitSquareHorizontal size={14} className="text-indigo-600" /> Separate Planning Grids</div>
            {current.qty > 1 && (
              <SecondaryButton
                type="button"
                onClick={() => onChange(addProjectPlanningGroup(current))}
                disabled={current.planning_groups.length >= current.qty}
                className="!px-2.5 !py-1.5 !text-xs"
                title="Adds the same quantity split to every selected department for this panel."
              >
                <Plus size={13} /> Add Planning Grid ({current.planning_groups.length}/{current.qty})
              </SecondaryButton>
            )}
          </div>
          <p className="mb-2 text-[11px] text-slate-500">The split is applied to every selected department for this panel, so each department gets the same Common/Separate planning-grid structure.</p>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {current.planning_groups.map((group, index) => (
              <div key={group.id} className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-indigo-700">Planning Grid {index + 1}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">Qty</span>
                    <Input type="number" min="1" value={group.qty} onChange={(e) => onChange(updateProjectPlanningGroupQty(current, group.id, e.target.value))} className="!h-8 !w-20 !px-2 !py-1 !text-xs" />
                  </div>
                </div>
                {current.planning_groups.length > 2 && (
                  <button type="button" onClick={() => onChange(removeProjectPlanningGroup(current, group.id))} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 hover:border-rose-200 hover:text-rose-600" title="Remove planning grid"><Trash2 size={14} /></button>
                )}
              </div>
            ))}
          </div>

          <div className={`mt-2 rounded-lg px-2.5 py-2 text-[11px] font-medium ${sumValid ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
            Separate grid Qty total: {sum} / Panel Qty: {current.qty}{sumValid ? ' ✓' : ' — quantities must match before saving.'}
          </div>
        </div>
      )}
    </div>
  );
}
