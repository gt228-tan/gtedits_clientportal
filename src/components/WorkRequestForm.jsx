import { useState } from 'react';
import { submitWorkRequest } from '../api/workRequests';
import { showToast } from './Toast';

const GAMING_TYPES = ['Gaming Highlights', 'Shorts', 'Reel', 'Thumbnail', 'Banner', 'Poster'];
const OTHER_TYPES  = ['Reels', 'Shorts', 'Video', 'Thumbnail', 'Poster'];

const EMPTY = {
  title:    '',
  category: '',
  type:     '',
  gameName: '',
  materials: '',
  budget:   '',
  deadline: '',
  remarks:  '',
};

export default function WorkRequestForm({ clientId, clientFirebaseUid, clientName, onClose, onSubmitted }) {
  const [form,   setForm]   = useState(EMPTY);
  const [busy,   setBusy]   = useState(false);
  const [errors, setErrors] = useState({});

  const typeOptions = form.category === 'Gaming' ? GAMING_TYPES
                    : form.category === 'Other'  ? OTHER_TYPES
                    : [];

  const set = (key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      // Reset type when category changes
      if (key === 'category') next.type = '';
      // Reset gameName when category is no longer Gaming
      if (key === 'category' && val !== 'Gaming') next.gameName = '';
      return next;
    });
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.category) e.category = 'Select a category';
    if (!form.type)     e.type     = 'Select a type';
    if (form.category === 'Gaming' && !form.gameName.trim())
      e.gameName = 'Enter the game name';
    if (!form.budget || Number(form.budget) <= 0)
      e.budget = 'Enter a valid budget';
    if (!form.deadline) e.deadline = 'Select a deadline';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setBusy(true);
    try {
      await submitWorkRequest({
        clientId,
        clientFirebaseUid,
        clientName,
        title:     form.title.trim(),
        category:  form.category,
        type:      form.type,
        gameName:  form.category === 'Gaming' ? form.gameName.trim() : '',
        materials: form.materials.trim(),
        budget:    Number(form.budget),
        deadline:  form.deadline,
        remarks:   form.remarks.trim(),
      });
      showToast('✅ Request submitted!');
      onSubmitted?.();
      onClose();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="wr-modal">

        {/* Header */}
        <div className="wr-modal-header">
          <div>
            <h2 className="wr-modal-title">📝 New Work Request</h2>
            <p className="wr-modal-sub">Fill in the details and we'll get back to you soon.</p>
          </div>
          <button className="wr-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="wr-form" onSubmit={handleSubmit} noValidate>

          {/* ── Title (Optional) ─────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label" htmlFor="wr-title">
              Request Title <span className="wr-hint">(optional)</span>
            </label>
            <input
              id="wr-title"
              className="wr-input"
              type="text"
              placeholder="e.g. Summer Festival Promo Reel"
              value={form.title}
              onChange={e => set('title', e.target.value)}
            />
          </div>

          {/* ── Category ───────────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label">Category <span className="wr-required">*</span></label>
            <div className="wr-category-row">
              {['Gaming', 'Other'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  className={`wr-cat-btn${form.category === cat ? ' active' : ''}`}
                  onClick={() => set('category', cat)}
                >
                  {cat === 'Gaming' ? '🎮 Gaming' : '🎬 Other'}
                </button>
              ))}
            </div>
            {errors.category && <span className="wr-error">{errors.category}</span>}
          </div>

          {/* ── Type (conditional on category) ─────────────── */}
          {form.category && (
            <div className="wr-field">
              <label className="wr-label">Type <span className="wr-required">*</span></label>
              <div className="wr-type-grid">
                {typeOptions.map(t => (
                  <button
                    key={t}
                    type="button"
                    className={`wr-type-btn${form.type === t ? ' active' : ''}`}
                    onClick={() => set('type', t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {errors.type && <span className="wr-error">{errors.type}</span>}
            </div>
          )}

          {/* ── Game Name (Gaming only) ────────────────────── */}
          {form.category === 'Gaming' && (
            <div className="wr-field">
              <label className="wr-label" htmlFor="wr-gameName">
                Game Name <span className="wr-required">*</span>
              </label>
              <input
                id="wr-gameName"
                className={`wr-input${errors.gameName ? ' wr-input-err' : ''}`}
                type="text"
                placeholder="e.g. Valorant, BGMI, Free Fire…"
                value={form.gameName}
                onChange={e => set('gameName', e.target.value)}
              />
              {errors.gameName && <span className="wr-error">{errors.gameName}</span>}
            </div>
          )}

          {/* ── Materials ─────────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label" htmlFor="wr-materials">
              Materials
              <span className="wr-hint"> (YT / Drive / Dropbox link)</span>
            </label>
            <input
              id="wr-materials"
              className="wr-input"
              type="url"
              placeholder="https://drive.google.com/…"
              value={form.materials}
              onChange={e => set('materials', e.target.value)}
            />
          </div>

          {/* ── Budget + Deadline (side by side) ──────────── */}
          <div className="wr-row-2">
            <div className="wr-field">
              <label className="wr-label" htmlFor="wr-budget">
                Budget (₹) <span className="wr-required">*</span>
              </label>
              <input
                id="wr-budget"
                className={`wr-input${errors.budget ? ' wr-input-err' : ''}`}
                type="number"
                min="1"
                placeholder="e.g. 500"
                value={form.budget}
                onChange={e => set('budget', e.target.value)}
              />
              {errors.budget && <span className="wr-error">{errors.budget}</span>}
            </div>

            <div className="wr-field">
              <label className="wr-label" htmlFor="wr-deadline">
                Deadline <span className="wr-required">*</span>
              </label>
              <input
                id="wr-deadline"
                className={`wr-input${errors.deadline ? ' wr-input-err' : ''}`}
                type="date"
                value={form.deadline}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => set('deadline', e.target.value)}
              />
              {errors.deadline && <span className="wr-error">{errors.deadline}</span>}
            </div>
          </div>

          {/* ── Remarks ───────────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label" htmlFor="wr-remarks">
              Remarks
              <span className="wr-hint"> (color theme, game character, special notes…)</span>
            </label>
            <textarea
              id="wr-remarks"
              className="wr-textarea"
              rows={3}
              placeholder="e.g. Use red & black theme, include Jett from Valorant…"
              value={form.remarks}
              onChange={e => set('remarks', e.target.value)}
            />
          </div>

          {/* ── Submit ────────────────────────────────────── */}
          <div className="wr-actions">
            <button type="button" className="wr-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="wr-btn-submit" disabled={busy}>
              {busy ? '⏳ Submitting…' : '🚀 Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
