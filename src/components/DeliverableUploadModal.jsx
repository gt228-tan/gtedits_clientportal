import { useState, useRef } from 'react';
import { showToast } from './Toast';
import { uploadFileDeliverable, uploadLinkDeliverable } from '../api/deliverables';

const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB limit

function formatBytes(b) {
  if (b < 1024)          return `${b} B`;
  if (b < 1024 * 1024)   return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

import { updateProject } from '../api/projects';

export default function DeliverableUploadModal({ projectId, project, token, onClose, onUploaded }) {
  const hasDrive = !!(project?.driveFolderUrl && project.driveFolderUrl.trim());
  const [step,           setStep]           = useState(hasDrive ? 'quick' : 'choose'); // 'quick' | 'choose' | 'file' | 'link'
  const [name,           setName]           = useState('');
  const [description,    setDescription]    = useState('');
  const [url,            setUrl]            = useState(project?.driveFolderUrl || '');
  const [file,           setFile]           = useState(null);
  const [allowDownload,  setAllowDownload]  = useState(true);
  const [progress,       setProgress]       = useState(0); // 0-100
  const [uploading,      setUploading]      = useState(false);
  const [driveFolder,    setDriveFolder]    = useState(project?.driveFolderUrl || '');
  const [savingDriveUrl, setSavingDriveUrl] = useState(false);
  const fileInputRef = useRef(null);

  const handleSaveDriveFolder = async () => {
    if (!driveFolder.trim()) return;
    setSavingDriveUrl(true);
    try {
      await updateProject(projectId, { driveFolderUrl: driveFolder.trim() }, token);
      if (project) project.driveFolderUrl = driveFolder.trim();
      setUrl(driveFolder.trim());
      setStep('quick');
      showToast('✅ Project Google Drive Folder saved!', 'success');
    } catch (err) {
      showToast(`❌ ${err.message}`, 'warn');
    } finally {
      setSavingDriveUrl(false);
    }
  };

  const copyToClipboard = async (link) => {
    if (!link) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleQuickSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { showToast('⚠️ Deliverable name is required', 'warn'); return; }
    const targetUrl = url.trim() || project?.driveFolderUrl || '';
    if (!targetUrl)   { showToast('⚠️ Please enter or set a Google Drive link', 'warn'); return; }

    setUploading(true);
    try {
      const result = await uploadLinkDeliverable(projectId, { name: name.trim(), description: description.trim(), url: targetUrl }, token);
      const finalLink = result.deliverable?.url || targetUrl;
      const copied = await copyToClipboard(finalLink);

      if (copied) {
        showToast('🎉 Deliverable uploaded to Drive & link copied to clipboard!', 'success');
      } else {
        showToast('🎉 Deliverable marked as uploaded!', 'success');
      }
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
            {step === 'quick'  ? '⚡ Deliverable Upload'
             : step === 'choose' ? '📦 Add Deliverable'
             : step === 'file'   ? '📁 Upload File Deliverable'
             :                     '🔗 Add Google Drive / Deliverable Link'}
          </h2>
          {!uploading && (
            <button className="modal-close-btn" onClick={onClose}>✕</button>
          )}
        </div>

        {/* Drive Folder banner / setter */}
        <div style={{ background: project?.driveFolderUrl ? '#f0fdf4' : '#f8fafc', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', border: `1px solid ${project?.driveFolderUrl ? '#bbf7d0' : '#e2e8f0'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: project?.driveFolderUrl ? '#166534' : '#334155' }}>
              📁 {project?.clientName ? `${project.clientName}'s` : 'Client'} Drive Folder
            </span>
            {project?.driveFolderUrl && (
              <a
                href={project.driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ padding: '4px 12px', fontSize: '0.82rem', textDecoration: 'none', background: '#16a34a', color: '#fff', borderRadius: '6px', fontWeight: 700 }}
              >
                Open Folder in Drive ↗
              </a>
            )}
          </div>
          {!project?.driveFolderUrl && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <input
                type="url"
                placeholder="https://drive.google.com/drive/folders/…"
                value={driveFolder}
                onChange={e => setDriveFolder(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                disabled={uploading || savingDriveUrl}
              />
              <button
                type="button"
                onClick={handleSaveDriveFolder}
                disabled={uploading || savingDriveUrl || !driveFolder.trim()}
                style={{ padding: '6px 12px', fontSize: '0.8rem', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                {savingDriveUrl ? 'Saving…' : 'Save Folder'}
              </button>
            </div>
          )}
        </div>

        {/* Step 0: Quick Submit (when Drive folder is pre-set) */}
        {step === 'quick' && (
          <form className="dlv-form" onSubmit={handleQuickSubmit}>
            <div className="dlv-form-field">
              <label>Deliverable Name <span className="req">*</span></label>
              <input
                type="text"
                placeholder="e.g. Final Video Edit v1"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={uploading}
                autoFocus
                required
              />
            </div>

            <div className="dlv-form-field">
              <label>Description <span className="opt">(optional)</span></label>
              <textarea
                rows={2}
                placeholder="Notes for client…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                disabled={uploading}
              />
            </div>

            <div className="dlv-form-field">
              <label>Drive File / Deliverable Link <span className="opt">(optional — defaults to Drive folder)</span></label>
              <input
                type="url"
                placeholder={project?.driveFolderUrl || "https://drive.google.com/…"}
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={uploading}
              />
              <span className="dlv-hint">Upload your file into Google Drive above, then click submit to mark as uploaded.</span>
            </div>

            <div className="dlv-form-actions">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={uploading}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={uploading || !name.trim()} style={{ background: '#16a34a', color: '#fff' }}>
                {uploading ? 'Updating…' : '🎉 Deliverable Uploaded in Drive'}
              </button>
            </div>
          </form>
        )}

        {/* Step 2a: File upload form */}
        {step === 'file' && (
          <form className="dlv-form" onSubmit={handleSubmitFile}>
            <div className="dlv-form-field">
              <label>Deliverable Name <span className="req">*</span></label>
              <input
                type="text"
                placeholder="e.g. Final Video Edit v1"
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
                    if (f.size > MAX_SIZE) { showToast('❌ File size exceeds 5 GB limit.', 'warn'); return; }
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
                    <span className="dlv-drop-sub">Direct Google Drive upload · Any size (100 KB to 1 GB+)</span>
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
