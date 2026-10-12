import { useState, useRef, useEffect } from 'react';
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

export default function WorkRequestForm({ clientId, clientFirebaseUid, clientName, driveFolderUrl, onClose, onSubmitted }) {
  const [tab, setTab] = useState('ai'); // 'ai' | 'manual'

  // ── Speech / Voice Recognition State ─────────────────────────────
  const recognitionRef = useRef(null);
  const [listeningTarget, setListeningTarget] = useState(null); // 'prompt' | 'refine' | 'edit_brief' | `clarify_${idx}`

  const isSpeechRecognitionSupported = typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }
    setListeningTarget(null);
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  const handleToggleListening = (target, getCurrentText, onUpdate) => {
    if (listeningTarget === target) {
      stopListening();
      return;
    }

    if (!isSpeechRecognitionSupported) {
      showToast('⚠️ Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.', 'warn');
      return;
    }

    stopListening();

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      const initialText = (typeof getCurrentText === 'function' ? getCurrentText() : getCurrentText) || '';
      const basePrefix = initialText.trim() ? (initialText.trim() + ' ') : '';

      recognition.onstart = () => {
        setListeningTarget(target);
        showToast('🎙️ Microphone active. Speak out your requirements now...', 'info');
      };

      recognition.onresult = (event) => {
        let spokenTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          spokenTranscript += event.results[i][0].transcript;
        }
        const trimmedSpoken = spokenTranscript.trimStart();
        onUpdate(basePrefix + trimmedSpoken);
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          showToast('⚠️ Microphone access denied. Please allow mic permissions in your browser.', 'error');
        } else if (event.error === 'no-speech') {
          // silence
        } else if (event.error !== 'aborted') {
          showToast(`⚠️ Microphone notice: ${event.error}`, 'warn');
        }
        setListeningTarget(null);
      };

      recognition.onend = () => {
        setListeningTarget(null);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      showToast('⚠️ Could not activate microphone. Please try again.', 'error');
      setListeningTarget(null);
    }
  };

  const handleClose = () => {
    stopListening();
    onClose();
  };

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
  const getMinDateTime = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  };

  const getDefaultDeadline24h = () => {
    const target = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(target.getHours())}:${pad(target.getMinutes())}`;
  };

  const [planForm,         setPlanForm]         = useState({
    title: '',
    budget: '',
    deadline: '',
    materials: '',
  });
  const [refinePrompt,     setRefinePrompt]     = useState('');
  const [showEditBrief,    setShowEditBrief]    = useState(false);

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
    stopListening();
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

        // Prepopulate plan confirmation values (default 24h deadline with time)
        const defaultDeadline = getDefaultDeadline24h();

        const calculatedCost = res.plan.costEstimation?.totalEstimatedCost || res.plan.estimatedBudget || 800;
        setPlanForm({
          title: res.plan.title || `${res.plan.type} Project`,
          budget: String(calculatedCost),
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

  const handleRefineAiPlan = async (customInstruction = '') => {
    stopListening();
    const instruction = (customInstruction || refinePrompt).trim();
    if (!instruction) {
      showToast('⚠️ Please enter the changes or adjustments you need', 'warn');
      return;
    }

    setAiLoading(true);
    try {
      const res = await analyzeWorkPrompt({
        prompt: aiPrompt.trim(),
        clarifications: [],
        clientName,
        refinement: instruction,
        previousPlan: aiPlan,
      });

      if (res.plan) {
        setAiMissingQuestions([]);
        setAiPlan(res.plan);
        setAiConfidence(res.confidenceScore || 95);

        const calculatedCost = res.plan.costEstimation?.totalEstimatedCost || res.plan.estimatedBudget || 800;
        setPlanForm(prev => ({
          ...prev,
          title: res.plan.title || prev.title,
          budget: String(calculatedCost),
        }));

        setRefinePrompt('');
        setShowEditBrief(false);
        showToast('✨ AI Project Plan updated with your requested changes!');
      } else if (res.missingQuestions && res.missingQuestions.length > 0) {
        setAiMissingQuestions(res.missingQuestions);
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
        costEstimation: aiPlan.costEstimation || null,
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
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="wr-modal">

        {/* Modal Header */}
        <div className="wr-modal-header">
          <div className="wr-header-content">
            <div className="wr-title-badge">{tab === 'ai' ? '✨' : '📝'}</div>
            <div>
              <h2 className="wr-modal-title">New Work Request</h2>
              <p className="wr-modal-sub">
                {tab === 'ai' ? 'Tell us what you need in plain English or speak with your mic — Gemini AI creates the plan' : 'Submit your request using the standard form'}
              </p>
            </div>
          </div>
          <button className="wr-close-btn" onClick={handleClose} aria-label="Close">✕</button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="ai-planner-tabs">
          <button
            type="button"
            className={`ai-planner-tab-btn ${tab === 'ai' ? 'active' : ''}`}
            onClick={() => { stopListening(); setTab('ai'); }}
          >
            ✨ AI Project Planner
          </button>
          <button
            type="button"
            className={`ai-planner-tab-btn ${tab === 'manual' ? 'active' : ''}`}
            onClick={() => { stopListening(); setTab('manual'); }}
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
                    Tell us what you need in your own words, or click <strong>🎙️ Speak Brief</strong> to talk directly. For example: <em>“I need 3 Instagram reels from our college event footage. Each should be around 30 seconds, energetic, with subtitles. We need them before October 15.”</em>
                  </div>
                </div>

                <div className="wr-field">
                  <div className="ai-field-header-row">
                    <label className="wr-label" htmlFor="ai-prompt-input" style={{ marginBottom: 0 }}>
                      Project Description / Brief <span className="wr-required">*</span>
                    </label>
                    <button
                      type="button"
                      className={`ai-mic-btn ${listeningTarget === 'prompt' ? 'listening' : ''}`}
                      onClick={() => handleToggleListening('prompt', () => aiPrompt, setAiPrompt)}
                      disabled={aiLoading}
                      title={listeningTarget === 'prompt' ? 'Stop listening' : 'Click to speak out your project brief'}
                    >
                      {listeningTarget === 'prompt' ? (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="2" />
                          </svg>
                          <span>Listening... (Click to stop)</span>
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                            <line x1="12" y1="19" x2="12" y2="23"/>
                            <line x1="8" y1="23" x2="16" y2="23"/>
                          </svg>
                          <span>🎙️ Speak Brief</span>
                        </>
                      )}
                    </button>
                  </div>
                  <textarea
                    id="ai-prompt-input"
                    className="wr-textarea"
                    rows={4}
                    placeholder="Describe what you want us to create or edit... (or click 'Speak Brief' to talk)"
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                    disabled={aiLoading}
                  />
                  {listeningTarget === 'prompt' && (
                    <div className="ai-listening-indicator">
                      <div className="ai-listening-info">
                        <span className="ai-voice-pulse-dot"></span>
                        <span>Listening to your voice... Speak your project requirements now</span>
                        <div className="ai-sound-waves">
                          <span></span><span></span><span></span><span></span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ai-listening-stop-btn"
                        onClick={stopListening}
                      >
                        Done Speaking ✕
                      </button>
                    </div>
                  )}
                </div>

                {/* Optional Materials / Drive Link */}
                <div className="wr-field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="wr-label" htmlFor="ai-materials-input" style={{ marginBottom: 0 }}>
                      Raw Footage / Drive Link <span className="wr-hint">(Optional)</span>
                    </label>
                    {driveFolderUrl && (
                      <button
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                        onClick={() => setAiMaterials(driveFolderUrl)}
                      >
                        📂 Use My Drive Folder
                      </button>
                    )}
                  </div>
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
                    {aiMissingQuestions.map((q, idx) => {
                      const isThisListening = listeningTarget === `clarify_${idx}`;
                      return (
                        <div key={idx} className="ai-clarify-q-card">
                          <div className="ai-field-header-row" style={{ marginBottom: '4px' }}>
                            <label className="ai-clarify-q-label" style={{ marginBottom: 0 }}>{idx + 1}. {q}</label>
                            <button
                              type="button"
                              className={`ai-mic-btn-sm ${isThisListening ? 'listening' : ''}`}
                              onClick={() => handleToggleListening(
                                `clarify_${idx}`,
                                () => clarificationAnswers[q] || '',
                                (val) => setClarificationAnswers(prev => ({ ...prev, [q]: val }))
                              )}
                              disabled={aiLoading}
                              title={isThisListening ? 'Stop listening' : 'Speak answer'}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                                <line x1="8" y1="23" x2="16" y2="23"/>
                              </svg>
                              {isThisListening ? 'Listening...' : '🎙️ Speak'}
                            </button>
                          </div>
                          <input
                            type="text"
                            className="wr-input"
                            placeholder="Your answer..."
                            value={clarificationAnswers[q] || ''}
                            onChange={e => setClarificationAnswers(prev => ({ ...prev, [q]: e.target.value }))}
                            disabled={aiLoading}
                          />
                          {isThisListening && (
                            <div className="ai-listening-indicator" style={{ marginTop: '4px', padding: '6px 12px' }}>
                              <div className="ai-listening-info">
                                <span className="ai-voice-pulse-dot"></span>
                                <span>Listening to your answer... Speak now</span>
                                <div className="ai-sound-waves">
                                  <span></span><span></span><span></span><span></span>
                                </div>
                              </div>
                              <button type="button" className="ai-listening-stop-btn" onClick={stopListening}>Done ✕</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
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

                  {/* ── Refine / Edit Brief Section ── */}
                  <div className="ai-refine-panel">
                    <div className="ai-refine-header">
                      <div className="ai-refine-title-wrap">
                        <span className="ai-refine-icon">✨</span>
                        <div>
                          <strong className="ai-refine-title">
                            Need changes to this plan?
                          </strong>
                          <span className="ai-refine-sub">
                            Type adjustments below or speak with your mic (e.g. change quantity, style, or add items) — AI updates everything
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="ai-refine-toggle-btn"
                        onClick={() => { stopListening(); setShowEditBrief(prev => !prev); }}
                        disabled={aiLoading}
                      >
                        {showEditBrief ? '✕ Close Full Brief' : '📝 Edit Full Brief'}
                      </button>
                    </div>

                    {showEditBrief ? (
                      <div className="ai-refine-full-edit">
                        <div className="ai-field-header-row" style={{ marginBottom: '4px' }}>
                          <label className="wr-label" style={{ fontSize: '0.78rem', marginBottom: 0 }}>
                            Edit Original Prompt / Full Brief:
                          </label>
                          <button
                            type="button"
                            className={`ai-mic-btn-sm ${listeningTarget === 'edit_brief' ? 'listening' : ''}`}
                            onClick={() => handleToggleListening('edit_brief', () => aiPrompt, setAiPrompt)}
                            disabled={aiLoading}
                            title={listeningTarget === 'edit_brief' ? 'Stop listening' : 'Speak brief changes'}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                              <line x1="12" y1="19" x2="12" y2="23"/>
                              <line x1="8" y1="23" x2="16" y2="23"/>
                            </svg>
                            {listeningTarget === 'edit_brief' ? 'Listening...' : '🎙️ Speak'}
                          </button>
                        </div>
                        <textarea
                          className="wr-textarea"
                          rows={3}
                          value={aiPrompt}
                          onChange={e => setAiPrompt(e.target.value)}
                          placeholder="Edit your full project brief here..."
                          disabled={aiLoading}
                        />
                        {listeningTarget === 'edit_brief' && (
                          <div className="ai-listening-indicator" style={{ marginTop: '4px', padding: '6px 12px' }}>
                            <div className="ai-listening-info">
                              <span className="ai-voice-pulse-dot"></span>
                              <span>Listening to your voice... Speak brief updates now</span>
                              <div className="ai-sound-waves">
                                <span></span><span></span><span></span><span></span>
                              </div>
                            </div>
                            <button type="button" className="ai-listening-stop-btn" onClick={stopListening}>Done ✕</button>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                          <button
                            type="button"
                            className="ai-btn-refine"
                            onClick={() => handleGenerateAiPlan(false)}
                            disabled={aiLoading || !aiPrompt.trim()}
                          >
                            {aiLoading ? (
                              <><span className="wr-spinner"></span> Updating Plan with AI...</>
                            ) : (
                              '🔄 Regenerate Plan with Updated Brief'
                            )}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="ai-refine-input-row">
                          <div className="ai-input-with-mic">
                            <input
                              type="text"
                              className="wr-input"
                              placeholder="e.g. Actually make it 5 reels instead of 3, add 2 thumbnails, faster pacing…"
                              value={refinePrompt}
                              onChange={e => setRefinePrompt(e.target.value)}
                              disabled={aiLoading}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && refinePrompt.trim() && !aiLoading) {
                                  e.preventDefault();
                                  handleRefineAiPlan();
                                }
                              }}
                            />
                            <button
                              type="button"
                              className={`ai-inner-mic-btn ${listeningTarget === 'refine' ? 'listening' : ''}`}
                              onClick={() => handleToggleListening('refine', () => refinePrompt, setRefinePrompt)}
                              disabled={aiLoading}
                              title={listeningTarget === 'refine' ? 'Stop listening' : 'Click to speak adjustments'}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                                <line x1="12" y1="19" x2="12" y2="23"/>
                                <line x1="8" y1="23" x2="16" y2="23"/>
                              </svg>
                            </button>
                          </div>
                          <button
                            type="button"
                            className="ai-btn-refine"
                            onClick={() => handleRefineAiPlan()}
                            disabled={aiLoading || !refinePrompt.trim()}
                          >
                            {aiLoading ? (
                              <><span className="wr-spinner"></span> Updating...</>
                            ) : (
                              '✨ Update Plan'
                            )}
                          </button>
                        </div>
                        {listeningTarget === 'refine' && (
                          <div className="ai-listening-indicator" style={{ marginTop: '6px' }}>
                            <div className="ai-listening-info">
                              <span className="ai-voice-pulse-dot"></span>
                              <span>Listening to adjustment... Speak now</span>
                              <div className="ai-sound-waves">
                                <span></span><span></span><span></span><span></span>
                              </div>
                            </div>
                            <button type="button" className="ai-listening-stop-btn" onClick={stopListening}>Done ✕</button>
                          </div>
                        )}
                      </>
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

                  {/* ── AI Rate Card Cost Estimation Breakdown Card ── */}
                  {aiPlan.costEstimation && (
                    <div className="ai-cost-estimation-card" style={{ marginBottom: '18px' }}>
                      <div className="ai-cost-estimation-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.1rem' }}>💰</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Rate Card Cost Estimation
                          </span>
                        </div>
                        <span className="ai-rate-badge">
                          GT Edits Rate Card
                        </span>
                      </div>

                      <div className="ai-cost-items-table">
                        {(aiPlan.costEstimation.breakdown || []).map((b, idx) => (
                          <div key={idx} className="ai-cost-item-row">
                            <div className="ai-cost-item-name">
                              <strong>{b.item || b.type}</strong>
                              {b.notes && <span className="ai-cost-item-notes">{b.notes}</span>}
                            </div>
                            <div className="ai-cost-item-qty">
                              {b.quantity} × ₹{Number(b.unitRate).toLocaleString('en-IN')}
                            </div>
                            <div className="ai-cost-item-subtotal">
                              ₹{Number(b.total).toLocaleString('en-IN')}
                            </div>
                          </div>
                        ))}

                        {/* Free Subtitles Row */}
                        {(aiPlan.specifications?.subtitles || aiPlan.costEstimation.subtitlesIncludedFree) && (
                          <div className="ai-cost-item-row ai-cost-free-row">
                            <div className="ai-cost-item-name">
                              <strong>✨ Animated Subtitles & Captions</strong>
                              <span className="ai-cost-item-notes">Synced captions included for all deliverables</span>
                            </div>
                            <div className="ai-cost-item-qty">
                              Included
                            </div>
                            <div className="ai-cost-item-subtotal ai-cost-free-tag">
                              FREE (₹0)
                            </div>
                          </div>
                        )}

                        {/* Rush delivery fee if any */}
                        {Number(aiPlan.costEstimation.rushFee) > 0 && (
                          <div className="ai-cost-item-row">
                            <div className="ai-cost-item-name">
                              <strong>⚡ Express Turnaround</strong>
                              <span className="ai-cost-item-notes">Priority queue delivery</span>
                            </div>
                            <div className="ai-cost-item-qty">Rush</div>
                            <div className="ai-cost-item-subtotal">
                              +₹{Number(aiPlan.costEstimation.rushFee).toLocaleString('en-IN')}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="ai-cost-total-bar">
                        <div className="ai-cost-total-label">
                          <span>Total Estimated Cost</span>
                          {aiPlan.costEstimation.pricingExplanation && (
                            <small className="ai-cost-total-sub">{aiPlan.costEstimation.pricingExplanation}</small>
                          )}
                        </div>
                        <div className="ai-cost-total-val">
                          ₹{Number(aiPlan.costEstimation.totalEstimatedCost).toLocaleString('en-IN')}
                        </div>
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
                        <label className="wr-label">Deadline & Time <span className="wr-required">*</span></label>
                        <input
                          type="datetime-local"
                          className="wr-input"
                          min={getMinDateTime()}
                          value={planForm.deadline}
                          onChange={e => setPlanForm(prev => ({ ...prev, deadline: e.target.value }))}
                          required
                        />
                      </div>
                    </div>

                    <div className="wr-field">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="wr-label" style={{ marginBottom: 0 }}>Raw Footage / Assets Link</label>
                        {driveFolderUrl && (
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                            onClick={() => setPlanForm(prev => ({ ...prev, materials: driveFolderUrl }))}
                          >
                            📂 Use My Drive Folder
                          </button>
                        )}
                      </div>
                      <input
                        type="url"
                        className="wr-input"
                        placeholder="Google Drive, Dropbox, or YouTube footage link..."
                        value={planForm.materials}
                        onChange={e => setPlanForm(prev => ({ ...prev, materials: e.target.value }))}
                      />
                    </div>

                    {/* Reference Image Upload in AI Confirmation Panel */}
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
                            id="wr-ai-image-input"
                            accept="image/*"
                            onChange={handleImageChange}
                            style={{ display: 'none' }}
                          />
                          <label htmlFor="wr-ai-image-input" className="wr-file-upload-label">
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label className="wr-label" htmlFor="wr-materials" style={{ marginBottom: 0 }}>
                  Materials / Raw Clips <span className="wr-hint">(Drive link)</span>
                </label>
                {driveFolderUrl && (
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                    onClick={() => set('materials', driveFolderUrl)}
                  >
                    📂 Use My Drive Folder
                  </button>
                )}
              </div>
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
              <button type="button" className="wr-btn-cancel" onClick={handleClose} disabled={busy}>
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
