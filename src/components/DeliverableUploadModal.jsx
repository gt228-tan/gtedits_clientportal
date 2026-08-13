import { useState, useRef } from 'react';
import { showToast } from './Toast';
import { uploadFileDeliverable, uploadLinkDeliverable } from '../api/deliverables';

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

function formatBytes(b) {
  if (b < 1024)          return `${b} B`;
  if (b < 1024 * 1024)   return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export default function DeliverableUploadModal({ projectId, token, onClose, onUploaded }) {
  // Step 1: choose type | Step 2: fill form
  const [step,        setStep]        = useState('choose'); // 'choose' | 'file' | 'link'
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [url,         setUrl]         = useState('');
  const [file,        setFile]        = useState(null);
  const [allowDownload, setAllowDownload] = useState(true);
  const [progress,    setProgress]    = useState(0); // 0-100
  const [uploading,   setUploading]   = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > MAX_SIZE) {
      showToast('❌ File size must be 100 MB or less.', 'warn');
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const handleSubmitFile = async (e) => {
    e.preventDefault();
    if (!name.trim()) { showToast('⚠️ Deliverable name is required', 'warn'); return; }
    if (!file)        { showToast('⚠️ Please select a file', 'warn'); return; }
    if (file.size > MAX_SIZE) { showToast('❌ File size must be 100 MB or less.', 'warn'); return; }

    setUploading(true);
    setProgress(10);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim());
      formData.append('description', description);
      formData.append('allowDownload', allowDownload);

      // Simulate progress while uploading (XHR would give real progress)
      const ticker = setInterval(() => setProgress(p => Math.min(p + 8, 85)), 300);

      const result = await uploadFileDeliverable(projectId, formData, token);
      clearInterval(ticker);
      setProgress(100);

      showToast(`✅ ${result.message || 'Deliverable uploaded!'}`, 'success');
      setTimeout(() => { onUploaded?.(); onClose(); }, 600);
    } catch (err) {
      setUploading(false);
      setProgress(0);
      showToast(`❌ ${err.message}`, 'warn');
    }
  };

  const handleSubmitLink = async (e) => {
    e.preventDefault();
    if (!name.trim()) { showToast('⚠️ Deliverable name is required', 'warn'); return; }
    if (!url.trim())  { showToast('⚠️ URL is required', 'warn'); return; }

    setUploading(true);
    try {
      await uploadLinkDeliverable(projectId, { name: name.trim(), description, url: url.trim() }, token);
      showToast('✅ Link deliverable added!', 'success');
      onUploaded?.();
      onClose();
    } catch (err) {
      setUploading(false);
      showToast(`❌ ${err.message}`, 'warn');
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && !uploading && onClose()}>
      <div className="modal-card dlv-upload-modal">

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            {step === 'choose' ? '📦 Add Deliverable'
             : step === 'file'  ? '📁 Upload File'
             :                    '🔗 Add External Link'}
          </h2>
          {!uploading && (
            <button className="modal-close-btn" onClick={onClose}>✕</button>
          )}
        </div>

        {/* Step 1: Choose type */}
        {step === 'choose' && (
          <div className="dlv-choose-grid">
            <button className="dlv-type-btn" onClick={() => setStep('file')}>
              <span className="dlv-type-icon">📁</span>
              <span className="dlv-type-label">Upload File</span>
              <span className="dlv-type-sub">JPG, PNG, MP4, PDF, ZIP…<br />Max 100 MB</span>
            </button>
            <button className="dlv-type-btn" onClick={() => setStep('link')}>
              <span className="dlv-type-icon">🔗</span>
              <span className="dlv-type-label">Add External Link</span>
              <span className="dlv-type-sub">YouTube, Drive, Figma,<br />Dropbox, etc.</span>
            </button>
          </div>
        )}

        {/* Step 2a: File upload form */}
        {step === 'file' && (
          <form className="dlv-form" onSubmit={handleSubmitFile}>
            <div className="dlv-form-field">
              <label>Deliverable Name <span className="req">*</span></label>
              <input
                type="text"
                placeholder="e.g. Final Thumbnail v3"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={uploading}
                required
              />
            </div>
            <div className="dlv-form-field">
              <label>Description <span className="opt">(optional)</span></label>
              <textarea
                rows={2}
                placeholder="Any notes for the client…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={uploading}
              />
            </div>
            <div className="dlv-form-field">
              <label>File <span className="req">*</span></label>
              <div
                className={`dlv-dropzone ${file ? 'has-file' : ''}`}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) {
                    if (f.size > MAX_SIZE) { showToast('❌ File size must be 100 MB or less.', 'warn'); return; }
                    setFile(f);
                  }
                }}
              >
                {file ? (
                  <>
                    <span className="dlv-file-icon">📄</span>
                    <span className="dlv-file-name">{file.name}</span>
                    <span className="dlv-file-size">{formatBytes(file.size)}</span>
                    {!uploading && (
                      <button
                        type="button"
                        className="dlv-remove-file"
                        onClick={e => { e.stopPropagation(); setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      >✕ Remove</button>
                    )}
                  </>
                ) : (
                  <>
                    <span className="dlv-drop-icon">☁️</span>
                    <span className="dlv-drop-label">Click or drag & drop</span>
                    <span className="dlv-drop-sub">Any file type · Max 100 MB</span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </div>

            <div className="dlv-form-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#0f1714' }}>
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={e => setAllowDownload(e.target.checked)}
                  disabled={uploading}
                  style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                />
                <span>Allow client to download this deliverable</span>
              </label>
            </div>

            {/* Progress bar */}
            {uploading && (
              <div className="dlv-progress-wrap">
                <div className="dlv-progress-bar" style={{ width: `${progress}%` }} />
                <span className="dlv-progress-label">{progress < 100 ? `Uploading… ${progress}%` : '✅ Done!'}</span>
              </div>
            )}

            <div className="dlv-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep('choose')} disabled={uploading}>
                ← Back
              </button>
              <button type="submit" className="btn-primary" disabled={uploading || !file}>
                {uploading ? 'Uploading…' : '⬆ Upload'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2b: Link form */}
        {step === 'link' && (
          <form className="dlv-form" onSubmit={handleSubmitLink}>
            <div className="dlv-form-field">
              <label>Deliverable Name <span className="req">*</span></label>
              <input
                type="text"
                placeholder="e.g. Final Video Edit"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={uploading}
                required
              />
            </div>
            <div className="dlv-form-field">
              <label>Description <span className="opt">(optional)</span></label>
              <textarea
                rows={2}
                placeholder="Any notes for the client…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={uploading}
              />
            </div>
            <div className="dlv-form-field">
              <label>Link URL <span className="req">*</span></label>
              <input
                type="url"
                placeholder="https://drive.google.com/…"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={uploading}
                required
              />
              <span className="dlv-hint">Supports YouTube, Google Drive, Dropbox, Figma, OneDrive, Canva, and any https:// URL</span>
            </div>

            <div className="dlv-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setStep('choose')} disabled={uploading}>
                ← Back
              </button>
              <button type="submit" className="btn-primary" disabled={uploading}>
                {uploading ? 'Saving…' : '🔗 Add Link'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
