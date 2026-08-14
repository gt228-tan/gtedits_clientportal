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
  const [form,         setForm]         = useState(EMPTY);
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [busy,         setBusy]         = useState(false);
  const [errors,       setErrors]       = useState({});
  const [isDragging,   setIsDragging]   = useState(false);

  const typeOptions = form.category === 'Gaming' ? GAMING_TYPES
                    : form.category === 'Other'  ? OTHER_TYPES
                    : [];

  const set = (key, val) => {
    setForm(prev => {
      const next = { ...prev, [key]: val };
      if (key === 'category') next.type = '';
      if (key === 'category' && val !== 'Gaming') next.gameName = '';
      return next;
    });
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const processFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, image: '⚠️ Please select a valid image file (PNG, JPG, WEBP, etc.)' }));
      return;
    }

    const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
    if (file.size > MAX_SIZE) {
      setErrors(prev => ({
        ...prev,
        image: `⚠️ Image file must be less than 50 MB (Selected: ${(file.size / (1024 * 1024)).toFixed(1)} MB)`
      }));
      return;
    }

    setErrors(prev => ({ ...prev, image: '' }));
    setImageFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e) => {
    const files = e.target.files;
    if (files && files.length) {
      processFile(files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview('');
    setErrors(prev => ({ ...prev, image: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.category) e.category = 'Please select a category';
    if (!form.type)     e.type     = 'Please select a type';
    if (form.category === 'Gaming' && !form.gameName.trim())
      e.gameName = 'Enter the game name';
    if (!form.budget || Number(form.budget) <= 0)
      e.budget = 'Enter a valid budget amount';
    if (!form.deadline) e.deadline = 'Select a required deadline date';
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
        image:     imagePreview || '',
        budget:    Number(form.budget),
        deadline:  form.deadline,
        remarks:   form.remarks.trim(),
      });
      showToast('✅ Work request submitted successfully!');
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

        {/* Modal Header */}
        <div className="wr-modal-header">
          <div className="wr-header-content">
            <div className="wr-title-badge">📝</div>
            <div>
              <h2 className="wr-modal-title">New Work Request</h2>
              <p className="wr-modal-sub">Submit your design or video editing request details</p>
            </div>
          </div>
          <button className="wr-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Form Body */}
        <form className="wr-form" onSubmit={handleSubmit} noValidate>

          {/* ── Request Title (Optional) ─────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label" htmlFor="wr-title">
              Request Title <span className="wr-hint">(Optional)</span>
            </label>
            <div className="wr-input-wrapper">
              <span className="wr-input-icon">📌</span>
              <input
                id="wr-title"
                className="wr-input"
                type="text"
                placeholder="e.g. Summer Festival Promo Reel"
                value={form.title}
                onChange={e => set('title', e.target.value)}
              />
            </div>
          </div>

          {/* ── Category ───────────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label">
              Category <span className="wr-required">*</span>
            </label>
            <div className="wr-category-row">
              {['Gaming', 'Other'].map(cat => {
                const isActive = form.category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`wr-cat-btn${isActive ? ' active' : ''}`}
                    onClick={() => set('category', cat)}
                  >
                    <span className="wr-cat-icon">{cat === 'Gaming' ? '🎮' : '🎬'}</span>
                    <span className="wr-cat-text">{cat}</span>
                    {isActive && <span className="wr-check-badge">✓</span>}
                  </button>
                );
              })}
            </div>
            {errors.category && <span className="wr-error">⚠️ {errors.category}</span>}
          </div>

          {/* ── Type (conditional on category) ─────────────── */}
          {form.category && (
            <div className="wr-field">
              <label className="wr-label">
                Content Type <span className="wr-required">*</span>
              </label>
              <div className="wr-type-grid">
                {typeOptions.map(t => {
                  const isActive = form.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      className={`wr-type-btn${isActive ? ' active' : ''}`}
                      onClick={() => set('type', t)}
                    >
                      {isActive && <span className="wr-type-check">✓</span>}
                      {t}
                    </button>
                  );
                })}
              </div>
              {errors.type && <span className="wr-error">⚠️ {errors.type}</span>}
            </div>
          )}

          {/* ── Game Name (Gaming only) ────────────────────── */}
          {form.category === 'Gaming' && (
            <div className="wr-field">
              <label className="wr-label" htmlFor="wr-gameName">
                Game Name <span className="wr-required">*</span>
              </label>
              <div className="wr-input-wrapper">
                <span className="wr-input-icon">🎯</span>
                <input
                  id="wr-gameName"
                  className={`wr-input${errors.gameName ? ' wr-input-err' : ''}`}
                  type="text"
                  placeholder="e.g. Valorant, BGMI, Free Fire, Minecraft…"
                  value={form.gameName}
                  onChange={e => set('gameName', e.target.value)}
                />
              </div>
              {errors.gameName && <span className="wr-error">⚠️ {errors.gameName}</span>}
            </div>
          )}

          {/* ── Materials Link ─────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label" htmlFor="wr-materials">
              Materials / Raw Clips <span className="wr-hint">(YT / Google Drive / Dropbox link)</span>
            </label>
            <div className="wr-input-wrapper">
              <span className="wr-input-icon">🔗</span>
              <input
                id="wr-materials"
                className="wr-input"
                type="url"
                placeholder="https://drive.google.com/drive/folders/…"
                value={form.materials}
                onChange={e => set('materials', e.target.value)}
              />
            </div>
          </div>

          {/* ── Reference Image Attachment (< 50 MB) ───────────── */}
          <div className="wr-field">
            <label className="wr-label">
              Reference Image <span className="wr-hint">(Optional, max 50 MB)</span>
            </label>
            {!imagePreview ? (
              <div
                className={`wr-file-upload-box${isDragging ? ' dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  id="wr-image-input"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
                <label htmlFor="wr-image-input" className="wr-file-upload-label">
                  <div className="wr-upload-icon-circle">
                    🖼️
                  </div>
                  <div className="wr-upload-text-group">
                    <span className="wr-upload-main-text">Click or Drag & Drop Reference Image</span>
                    <span className="wr-upload-sub-text">PNG, JPG, WEBP, GIF up to 50 MB</span>
                  </div>
                </label>
              </div>
            ) : (
              <div className="wr-image-preview-wrap">
                <div className="wr-preview-img-container">
                  <img src={imagePreview} alt="Reference preview" className="wr-image-preview-img" />
                </div>
                <div className="wr-image-preview-meta">
                  <span className="wr-image-preview-name">{imageFile?.name || 'Attached Reference Image'}</span>
                  {imageFile?.size && (
                    <span className="wr-image-preview-badge">
                      📦 {(imageFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  )}
                  <button type="button" className="wr-image-remove-btn" onClick={removeImage}>
                    ✕ Remove Image
                  </button>
                </div>
              </div>
            )}
            {errors.image && <span className="wr-error">{errors.image}</span>}
          </div>

          {/* ── Budget + Deadline (Side by Side Grid) ──────────── */}
          <div className="wr-row-2">
            <div className="wr-field">
              <label className="wr-label" htmlFor="wr-budget">
                Budget <span className="wr-required">*</span>
              </label>
              <div className="wr-input-wrapper">
                <span className="wr-currency-badge">₹</span>
                <input
                  id="wr-budget"
                  className={`wr-input wr-input-currency${errors.budget ? ' wr-input-err' : ''}`}
                  type="number"
                  min="1"
                  placeholder="500"
                  value={form.budget}
                  onChange={e => set('budget', e.target.value)}
                />
              </div>
              {errors.budget && <span className="wr-error">⚠️ {errors.budget}</span>}
            </div>

            <div className="wr-field">
              <label className="wr-label" htmlFor="wr-deadline">
                Deadline <span className="wr-required">*</span>
              </label>
              <div className="wr-input-wrapper">
                <span className="wr-input-icon">📅</span>
                <input
                  id="wr-deadline"
                  className={`wr-input${errors.deadline ? ' wr-input-err' : ''}`}
                  type="date"
                  value={form.deadline}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => set('deadline', e.target.value)}
                />
              </div>
              {errors.deadline && <span className="wr-error">⚠️ {errors.deadline}</span>}
            </div>
          </div>

          {/* ── Remarks ───────────────────────────────────── */}
          <div className="wr-field">
            <label className="wr-label" htmlFor="wr-remarks">
              Special Instructions / Remarks
              <span className="wr-hint"> (Color palette, game character, song preferences)</span>
            </label>
            <textarea
              id="wr-remarks"
              className="wr-textarea"
              rows={3}
              placeholder="e.g. Use dark neon theme, highlight clutch kills at 01:20, add fast sync edits..."
              value={form.remarks}
              onChange={e => set('remarks', e.target.value)}
            />
          </div>

          {/* ── Footer Actions ────────────────────────────── */}
          <div className="wr-actions">
            <button type="button" className="wr-btn-cancel" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="wr-btn-submit" disabled={busy}>
              {busy ? (
                <>
                  <span className="wr-spinner"></span> Submitting Request...
                </>
              ) : (
                '🚀 Submit Request'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
