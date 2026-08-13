// ── Date helpers ──────────────────────────────────────────
export function formatDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${day} ${months[parseInt(m) - 1]} ${y}`;
}

export function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeDate(dateValue) {
  if (!dateValue) return null;
  const [y, m, d] = String(dateValue).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function compareWorkDates(a, b) {
  const da = normalizeDate(a?.date);
  const db = normalizeDate(b?.date);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return da - db;
}

function getIsoWeekKey(dateValue) {
  const date = normalizeDate(dateValue) || new Date();
  const temp = new Date(date);
  temp.setHours(0, 0, 0, 0);
  const day = temp.getDay() || 7;
  temp.setDate(temp.getDate() + 4 - day);
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((temp - yearStart) / 86400000) + 1;
  const week      = Math.ceil(dayOfYear / 7);
  return `${temp.getFullYear()}-${week}`;
}

function getMonthKey(dateValue) {
  const date = normalizeDate(dateValue) || new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildSectionLabel(dateValue, type) {
  const date = normalizeDate(dateValue) || new Date();
  if (type === 'month') {
    return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  const week = getIsoWeekKey(dateValue);
  const [, weekNo] = week.split('-');
  return `Week ${weekNo} • ${date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`;
}

export function getWorkSectionMeta(dateValue, previousItem) {
  const monthKey = getMonthKey(dateValue);
  const weekKey  = getIsoWeekKey(dateValue);

  if (!previousItem) {
    return { key: `month:${monthKey}`, label: buildSectionLabel(dateValue, 'month'), type: 'month' };
  }
  const prevMonthKey = getMonthKey(previousItem.date);
  const prevWeekKey  = getIsoWeekKey(previousItem.date);

  if (monthKey !== prevMonthKey)
    return { key: `month:${monthKey}`, label: buildSectionLabel(dateValue, 'month'), type: 'month' };
  if (weekKey !== prevWeekKey)
    return { key: `week:${weekKey}`, label: buildSectionLabel(dateValue, 'week'), type: 'week' };

  return {
    key:   previousItem.sectionKey   || `week:${weekKey}`,
    label: previousItem.sectionLabel || buildSectionLabel(dateValue, 'week'),
    type:  previousItem.sectionType  || 'week'
  };
}

export function getSectionMetaForSave(dateValue, existingWorkEntries, currentWorkId) {
  const items  = existingWorkEntries
    .filter(([id]) => id !== currentWorkId)
    .map(([id, item]) => ({ id, ...item }));
  const latest = [...items].sort(compareWorkDates).pop();
  return getWorkSectionMeta(dateValue, latest || null);
}

export function buildWorkSections(items) {
  const sorted = [...items].sort(compareWorkDates);
  const sections = [];
  let currentSection = null;
  let previousItem   = null;

  sorted.forEach((item) => {
    const meta = getWorkSectionMeta(item.date, previousItem);
    if (!currentSection || currentSection.key !== meta.key) {
      currentSection = { key: meta.key, label: meta.label, rows: [] };
      sections.push(currentSection);
    }
    currentSection.rows.push(item);
    previousItem = item;
  });

  return sections;
}

// Compute paid / pending / total from work items array
export function computeTotals(work) {
  let paid = 0, pending = 0, total = 0;
  work.forEach(w => {
    const amt = Number(w.qty || 1) * Number(w.price || w.amt || 0);
    total += amt;
    if (w.status === 'Paid')    { paid += amt; }
    else if (w.status === 'Advance') { const adv = Number(w.advance || 0); paid += adv; pending += (amt - adv); }
    else { pending += amt; }
  });
  return { paid, pending, total };
}
