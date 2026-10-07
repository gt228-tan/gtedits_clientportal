import { useState } from 'react';
import { submitWorkRequest, analyzeWorkPrompt } from '../api/workRequests';
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
  const [tab, setTab] = useState('ai'); // 'ai' | 'manual'

  // ── Standard Form State ──────────────────────────────────────────
  const [form,         setForm]         = useState(EMPTY);
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [busy,         setBusy]         = useState(false);
  const [errors,       setErrors]       = useState({});
  const [isDragging,   setIsDragging]   = useState(false);

  // ── AI Planner State ────────────────────────────────────────────
  const [aiPrompt,         setAiPrompt]         = useState('');
  const [aiMaterials,      setAiMaterials]      = useState('');
  const [aiLoading,        setAiLoading]        = useState(false);
  const [aiMissingQuestions, setAiMissingQuestions] = useState([]);
  const [clarificationAnswers, setClarificationAnswers] = useState({});
  const [aiPlan,           setAiPlan]           = useState(null);
  const [aiConfidence,     setAiConfidence]     = useState(null);
  const [planForm,         setPlanForm]         = useState({
    title: '',
    budget: '',
    deadline: '',
    materials: '',
  });

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

  // ── AI Planner Handlers ─────────────────────────────────────────
  const handleGenerateAiPlan = async (isFollowUp = false) => {
    if (!aiPrompt.trim()) {
      showToast('⚠️ Please describe your project requirements first', 'warn');
      return;
    }

    setAiLoading(true);
    try {
      // Build clarifications array if answering follow-up questions
      const clarifications = isFollowUp
        ? aiMissingQuestions.map(q => ({
            question: q,
            answer: clarificationAnswers[q] || 'Default / Standard',
          }))
        : [];

      const res = await analyzeWorkPrompt({
        prompt: aiPrompt.trim(),
        clarifications,
        clientName,
      });

      if (!res.isComplete && res.missingQuestions && res.missingQuestions.length > 0) {
        setAiMissingQuestions(res.missingQuestions);
        setAiPlan(null);
      } else if (res.plan) {
        setAiMissingQuestions([]);
        setAiPlan(res.plan);
        setAiConfidence(res.confidenceScore || 94);

        // Prepopulate plan confirmation values
        const defaultDeadline = res.plan.deadlineSuggested
          ? res.plan.deadlineSuggested.split('T')[0]
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        setPlanForm({
          title: res.plan.title || `${res.plan.type} Project`,
          budget: res.plan.estimatedBudget ? String(res.plan.estimatedBudget) : '1500',
          deadline: defaultDeadline,
          materials: aiMaterials || '',
        });
      }
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirmAiPlan = async (e) => {
    e.preventDefault();
    if (!aiPlan) return;

    if (!planForm.deadline) {
      showToast('⚠️ Please select a required deadline date', 'warn');
      return;
    }

    setBusy(true);
    try {
      await submitWorkRequest({
        clientId,
        clientFirebaseUid,
        clientName,
        title: planForm.title.trim() || aiPlan.title,
        category: aiPlan.category || 'Other',
        type: aiPlan.type || 'Reels',
        materials: planForm.materials.trim() || aiMaterials.trim(),
        image: imagePreview || '',
        budget: Number(planForm.budget) || 0,
        deadline: planForm.deadline,
        remarks: aiPlan.summary || aiPrompt,
        // AI Structured Fields
        aiGenerated: true,
        aiConfidence: aiConfidence || 94,
        aiOriginalPrompt: aiPrompt.trim(),
        quantity: aiPlan.quantity || 1,
        specifications: aiPlan.specifications || {},
        requiredAssets: aiPlan.requiredAssets || [],
        suggestedWorkflow: aiPlan.suggestedWorkflow || [],
        deliverablesList: aiPlan.deliverablesList || [],
      });

      showToast('🎉 AI Project Plan submitted successfully!');
      onSubmitted?.();
      onClose();
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setBusy(false);
    }
  };

  // ── Standard Validation & Submit ────────────────────────────────
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

  const handleStandardSubmit = async (e) => {
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
        aiGenerated: false,
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
            <div className="wr-title-badge">{tab === 'ai' ? '✨' : '📝'}</div>
            <div>
              <h2 className="wr-modal-title">New Work Request</h2>
              <p className="wr-modal-sub">
                {tab === 'ai' ? 'Tell us what you need in plain English — Gemini AI creates the plan' : 'Submit your request using the standard form'}
              </p>
            </div>
          </div>
          <button className="wr-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="ai-planner-tabs">
          <button
            type="button"
            className={`ai-planner-tab-btn ${tab === 'ai' ? 'active' : ''}`}
            onClick={() => setTab('ai')}
          >
            ✨ AI Project Planner
          </button>
          <button
            type="button"
            className={`ai-planner-tab-btn ${tab === 'manual' ? 'active' : ''}`}
            onClick={() => setTab('manual')}
          >
            📝 Standard Form
          </button>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            MODE A: AI PROJECT PLANNER
            ═══════════════════════════════════════════════════════════ */}
        {tab === 'ai' && (
          <div>
            {!aiPlan ? (
              <div>
                <div className="ai-prompt-hero">
                  <div className="ai-prompt-hero-title">
                    <span>💡</span> What do you need?
                  </div>
                  <div className="ai-prompt-hero-sub">
                    Tell us what you need in your own words. For example: <em>“I need 3 Instagram reels from our college event footage. Each should be around 30 seconds, energetic, with subtitles. We need them before October 15.”</em>
                  </div>
                </div>

                <div className="wr-field">
                  <label className="wr-label" htmlFor="ai-prompt-input">
                    Project Description / Brief <span className="wr-required">*</span>
                  </label>
                  <textarea
                    id="ai-prompt-input"
                    className="wr-textarea"
                    rows={4}
                    placeholder="Describe what you want us to create or edit..."
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={aiLoading}
                  />
                </div>

                {/* Optional Materials / Drive Link */}
                <div className="wr-field">
                  <label className="wr-label" htmlFor="ai-materials-input">
                    Raw Footage / Drive Link <span className="wr-hint">(Optional, can be added later)</span>
                  </label>
                  <div className="wr-input-wrapper">
                    <span className="wr-input-icon">🔗</span>
                    <input
                      id="ai-materials-input"
                      className="wr-input"
                      type="url"
                      placeholder="https://drive.google.com/drive/folders/…"
                      value={aiMaterials}
                      onChange={e => setAiMaterials(e.target.value)}
                      disabled={aiLoading}
                    />
                  </div>
                </div>

                {/* Clarifying Questions Step (Step 3 in newiddea.txt) */}
                {aiMissingQuestions.length > 0 && (
                  <div className="ai-clarify-banner">
                    <strong style={{ display: 'block', marginBottom: '8px', color: '#92400e' }}>
                      🤔 I understand your request, but I need {aiMissingQuestions.length} detail{aiMissingQuestions.length > 1 ? 's' : ''} to finalize your plan:
                    </strong>
                    {aiMissingQuestions.map((q, idx) => (
                      <div key={idx} className="ai-clarify-q-card">
                        <label className="ai-clarify-q-label">{idx + 1}. {q}</label>
                        <input
                          type="text"
                          className="wr-input"
                          placeholder="Your answer..."
                          value={clarificationAnswers[q] || ''}
                          onChange={e => setClarificationAnswers(prev => ({ ...prev, [q]: e.target.value }))}
                          disabled={aiLoading}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: '20px' }}>
                  <button
                    type="button"
                    className="ai-btn-generate"
                    onClick={() => handleGenerateAiPlan(aiMissingQuestions.length > 0)}
                    disabled={aiLoading || !aiPrompt.trim()}
                  >
                    {aiLoading ? (
                      <>
                        <span className="wr-spinner"></span> Gemini AI is Analyzing & Planning...
                      </>
                    ) : aiMissingQuestions.length > 0 ? (
                      '🔄 Update Brief & Generate Plan'
                    ) : (
                      '✨ Generate Project Plan with AI'
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* ── Step 4: AI Plan Confirmation Screen ── */
              <form onSubmit={handleConfirmAiPlan}>
                <div className="ai-plan-preview-box">
                  <div className="ai-plan-header">
                    <div>
                      <span style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
                        AI Generated Project Plan
                      </span>
                      <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', color: '#0f1714', fontWeight: 800 }}>
                        {aiPlan.title}
                      </h3>
                      {aiPlan.summary && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
                          {aiPlan.summary}
                        </p>
                      )}
                    </div>
                    {aiConfidence && (
                      <div className="ai-confidence-chip">
                        <span>✨</span> {aiConfidence}% Confidence
                      </div>
                    )}
                  </div>

                  {/* Deliverables Breakdown */}
                  <div style={{ marginBottom: '14px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                      📦 Deliverables ({aiPlan.deliverablesList?.length || aiPlan.quantity} Items)
                    </span>
                    <div className="ai-deliverables-list" style={{ marginTop: '8px' }}>
                      {(aiPlan.deliverablesList || []).map((d, idx) => (
                        <div key={idx} className="ai-deliverable-item">
                          <span>🎬 {d.name || `Item ${idx + 1}`}</span>
                          <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>{d.notes || d.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Specifications Grid */}
                  <div style={{ marginBottom: '14px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                      ⚙️ Specifications
                    </span>
                    <div className="ai-specs-grid" style={{ marginTop: '8px' }}>
                      {aiPlan.specifications?.duration && (
                        <div className="ai-spec-pill">
                          <span className="ai-spec-pill-label">Duration</span>
                          <span className="ai-spec-pill-val">{aiPlan.specifications.duration}</span>
                        </div>
                      )}
                      {aiPlan.specifications?.style && (
                        <div className="ai-spec-pill">
                          <span className="ai-spec-pill-label">Style</span>
                          <span className="ai-spec-pill-val">{aiPlan.specifications.style}</span>
                        </div>
                      )}
                      {aiPlan.specifications?.platform && (
                        <div className="ai-spec-pill">
                          <span className="ai-spec-pill-label">Platform</span>
                          <span className="ai-spec-pill-val">{aiPlan.specifications.platform}</span>
                        </div>
                      )}
                      <div className="ai-spec-pill">
                        <span className="ai-spec-pill-label">Subtitles</span>
                        <span className="ai-spec-pill-val">{aiPlan.specifications?.subtitles ? 'Yes (Included)' : 'No'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Required Assets */}
                  {aiPlan.requiredAssets && aiPlan.requiredAssets.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                        📁 Required Assets
                      </span>
                      <div style={{ marginTop: '6px' }}>
                        {aiPlan.requiredAssets.map((asset, idx) => (
                          <span key={idx} className="ai-asset-tag">
                            ✓ {asset}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggested Workflow */}
                  {aiPlan.suggestedWorkflow && aiPlan.suggestedWorkflow.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase' }}>
                        🚀 Suggested Workflow
                      </span>
                      <div className="ai-workflow-timeline" style={{ marginTop: '6px' }}>
                        {aiPlan.suggestedWorkflow.map((step, idx) => (
                          <div key={idx} className="ai-workflow-step">
                            <span style={{ color: '#059669', fontWeight: 700 }}>•</span> {step}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Editable Submission Details */}
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '16px' }}>
                    <div className="wr-field">
                      <label className="wr-label">Project Title</label>
                      <input
                        type="text"
                        className="wr-input"
                        value={planForm.title}
                        onChange={e => setPlanForm(prev => ({ ...prev, title: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="wr-row-2">
                      <div className="wr-field">
                        <label className="wr-label">Budget Estimate (₹)</label>
                        <div className="wr-input-wrapper">
                          <span className="wr-currency-badge">₹</span>
                          <input
                            type="number"
                            className="wr-input wr-input-currency"
                            value={planForm.budget}
                            onChange={e => setPlanForm(prev => ({ ...prev, budget: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="wr-field">
                        <label className="wr-label">Deadline <span className="wr-required">*</span></label>
                        <input
                          type="date"
                          className="wr-input"
                          min={new Date().toISOString().split('T')[0]}
                          value={planForm.deadline}
                          onChange={e => setPlanForm(prev => ({ ...prev, deadline: e.target.value }))}
                          required
                        />
                      </div>
                    </div>

                    <div className="wr-field">
                      <label className="wr-label">Raw Footage / Assets Link</label>
                      <input
                        type="url"
                        className="wr-input"
                        placeholder="Google Drive, Dropbox, or YouTube footage link..."
                        value={planForm.materials}
                        onChange={e => setPlanForm(prev => ({ ...prev, materials: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                <div className="wr-actions">
                  <button
                    type="button"
                    className="wr-btn-cancel"
                    onClick={() => setAiPlan(null)}
                    disabled={busy}
                  >
                    ← Edit Prompt
                  </button>
                  <button type="submit" className="wr-btn-submit" disabled={busy}>
                    {busy ? (
                      <>
                        <span className="wr-spinner"></span> Confirming Request...
                      </>
                    ) : (
                      '🚀 Confirm & Submit Request'
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            MODE B: STANDARD MANUAL FORM
            ═══════════════════════════════════════════════════════════ */}
        {tab === 'manual' && (
          <form className="wr-form" onSubmit={handleStandardSubmit} noValidate>
            {/* Request Title */}
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

            {/* Category */}
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

            {/* Type */}
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

            {/* Game Name */}
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

            {/* Materials Link */}
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

            {/* Image Upload */}
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
                    <div className="wr-upload-icon-circle">🖼️</div>
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

            {/* Budget & Deadline */}
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

            {/* Remarks */}
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

            {/* Footer Actions */}
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
        )}
      </div>
    </div>
  );
}
