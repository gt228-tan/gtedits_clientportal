import { useState, useEffect, useRef } from 'react';
import { showToast } from './Toast';
import { uploadFileDeliverable, uploadLinkDeliverable } from '../api/deliverables';
import { updateProject } from '../api/projects';
import { API_BASE } from '../api/config';

const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB limit

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(2)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function DeliverableUploadModal({ projectId, project, token, onClose, onUploaded }) {
  const hasDrive = !!(project?.driveFolderUrl && project.driveFolderUrl.trim());
  const [step,           setStep]           = useState(hasDrive ? 'quick' : 'choose'); // 'quick' | 'choose' | 'file' | 'link'
  const [name,           setName]           = useState('');
  const [description,    setDescription]    = useState('');
  const [url,            setUrl]            = useState(project?.driveFolderUrl || '');
  const [file,           setFile]           = useState(null);
  const [clientEmail,    setClientEmail]    = useState(project?.clientEmail || project?.contactEmail || '');
  const [allowDownload,  setAllowDownload]  = useState(true);
  const [progress,       setProgress]       = useState(0); // 0-100
  const [uploading,      setUploading]      = useState(false);
  const [driveFolder,    setDriveFolder]    = useState(project?.driveFolderUrl || '');
  const [savingDriveUrl, setSavingDriveUrl] = useState(false);
  const fileInputRef = useRef(null);

  // Auto-fetch client notification email if not already present
  useEffect(() => {
    if (clientEmail && clientEmail.includes('@') && !clientEmail.includes('gtportal.com')) return;
    const cid = project?.firebaseClientId;
    if (!cid) return;
    fetch(`${API_BASE}/work-requests/client-email?clientId=${encodeURIComponent(cid)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d?.contactEmail && d.contactEmail.includes('@') && !d.contactEmail.includes('gtportal.com')) {
          setClientEmail(d.contactEmail);
        }
      })
      .catch(() => {});
  }, [project?.firebaseClientId, clientEmail]);

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
      const payload = {
        name: name.trim(),
        description: description.trim(),
        url: targetUrl,
        contactEmail: clientEmail.trim(),
        notificationEmail: clientEmail.trim(),
      };
      const result = await uploadLinkDeliverable(projectId, payload, token);
      const finalLink = result.deliverable?.url || targetUrl;
      const copied = await copyToClipboard(finalLink);

      if (result.message) {
        showToast(`🎉 ${result.message}`, 'success');
      } else if (copied) {
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

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      if (f.size > MAX_SIZE) {
        showToast('❌ File size exceeds 5 GB limit.', 'warn');
        return;
      }
      setFile(f);
    }
  };

  const handleSubmitFile = async (e) => {
    e.preventDefault();
    if (!name.trim()) { showToast('⚠️ Deliverable name is required', 'warn'); return; }
    if (!file) { showToast('⚠️ Please select a file to upload', 'warn'); return; }

    setUploading(true);
    setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('name', name.trim());
      if (description.trim()) fd.append('description', description.trim());
      fd.append('allowDownload', String(allowDownload));
      if (clientEmail.trim()) {
        fd.append('contactEmail', clientEmail.trim());
        fd.append('notificationEmail', clientEmail.trim());
      }

      const res = await uploadFileDeliverable(projectId, fd, token, p => setProgress(p));
      showToast(res.message || '🎉 Deliverable uploaded successfully!', 'success');
      onUploaded?.();
      onClose();
    } catch (err) {
      setUploading(false);
      showToast(`❌ ${err.message}`, 'warn');
    }
  };

  const handleSubmitLink = async (e) => {
    e.preventDefault();
    if (!name.trim()) { showToast('⚠️ Deliverable name is required', 'warn'); return; }
    if (!url.trim()) { showToast('⚠️ Deliverable link is required', 'warn'); return; }

    setUploading(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        url: url.trim(),
        contactEmail: clientEmail.trim(),
        notificationEmail: clientEmail.trim(),
      };
      const res = await uploadLinkDeliverable(projectId, payload, token);
      showToast(res.message || '🎉 Deliverable link saved!', 'success');
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
            {step === 'quick'  ? '⚡ Quick Drive Deliverable'
             : step === 'choose' ? '📦 Add Deliverable'
             : step === 'file'   ? '📁 Upload File Deliverable'
             :                     '🔗 Add External Deliverable Link'}
          </h2>
          {!uploading && (
            <button className="modal-close-btn" onClick={onClose}>✕</button>
          )}
        </div>

        {/* Upload Mode Switcher Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
          <button
            type="button"
            onClick={() => setStep('quick')}
            disabled={uploading}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              background: step === 'quick' ? '#ffffff' : 'transparent',
              color: step === 'quick' ? '#166534' : '#64748b',
              boxShadow: step === 'quick' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            ⚡ Quick Drive
          </button>
          <button
            type="button"
            onClick={() => setStep('file')}
            disabled={uploading}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              background: step === 'file' ? '#ffffff' : 'transparent',
              color: step === 'file' ? '#0f172a' : '#64748b',
              boxShadow: step === 'file' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            📁 Upload File
          </button>
          <button
            type="button"
            onClick={() => setStep('link')}
            disabled={uploading}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: '0.82rem',
              fontWeight: 700,
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              background: step === 'link' ? '#ffffff' : 'transparent',
              color: step === 'link' ? '#0f172a' : '#64748b',
              boxShadow: step === 'link' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            🔗 External Link
          </button>
        </div>

        {/* Drive Folder banner / setter */}
        <div style={{ background: project?.driveFolderUrl ? '#f0fdf4' : '#f8fafc', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', border: `1px solid ${project?.driveFolderUrl ? '#bbf7d0' : '#e2e8f0'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: project?.driveFolderUrl ? '#166534' : '#334155' }}>
              📁 {project?.clientName ? `${project.clientName}'s` : 'Client'} Drive Folder
            </span>
            {project?.driveFolderUrl && (
              <a
                href={project.driveFolderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{ padding: '3px 10px', fontSize: '0.78rem', textDecoration: 'none', background: '#16a34a', color: '#fff', borderRadius: '6px', fontWeight: 700 }}
              >
                Open Folder ↗
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
                style={{ flex: 1, padding: '5px 8px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                disabled={uploading || savingDriveUrl}
              />
              <button
                type="button"
                onClick={handleSaveDriveFolder}
                disabled={uploading || savingDriveUrl || !driveFolder.trim()}
                style={{ padding: '5px 10px', fontSize: '0.78rem', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                {savingDriveUrl ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        {/* Step Choose (Option selector when no drive link is configured) */}
        {step === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '8px 0' }}>
            <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: '#64748b' }}>
              Select how you would like to deliver work to <strong>{project?.clientName || 'Client'}</strong>:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setStep('quick')}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>⚡</span>
                <strong style={{ color: '#166534', fontSize: '0.95rem' }}>Quick Drive Deliverable</strong>
                <span style={{ fontSize: '0.78rem', color: '#15803d' }}>
                  Upload to Google Drive & auto-notify client with link
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStep('file')}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>📁</span>
                <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>Upload File Deliverable</strong>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  Upload video, audio, image, zip directly up to 5 GB
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStep('link')}
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>🔗</span>
                <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>External Link</strong>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                  YouTube, Vimeo, Figma, Canva, Dropbox, Drive link
                </span>
              </button>
            </div>
          </div>
        )}

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
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>✉️ Client Notification Email</span>
                {clientEmail && clientEmail.includes('@') && (
                  <span style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700 }}>✅ Email will be sent</span>
                )}
              </label>
              <input
                type="email"
                placeholder="client@gmail.com"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                disabled={uploading}
              />
              <span className="dlv-hint">
                A review notification email with deliverable links will be delivered here automatically.
              </span>
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
              <label>Drive File / Deliverable Link <span className="opt">(defaults to Drive folder)</span></label>
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
                {uploading ? 'Updating & Notifying…' : '🎉 Deliverable Uploaded & Send Mail'}
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
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>✉️ Client Notification Email</span>
                {clientEmail && clientEmail.includes('@') && (
                  <span style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700 }}>✅ Email will be sent</span>
                )}
              </label>
              <input
                type="email"
                placeholder="client@gmail.com"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                disabled={uploading}
              />
              <span className="dlv-hint">
                A review notification email will be sent automatically upon upload.
              </span>
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
                    <span className="dlv-drop-sub">Direct file upload · Any size (100 KB to 1 GB+)</span>
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
                {uploading ? 'Uploading & Notifying…' : '⬆ Upload & Send Mail'}
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
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>✉️ Client Notification Email</span>
                {clientEmail && clientEmail.includes('@') && (
                  <span style={{ fontSize: '0.74rem', color: '#16a34a', fontWeight: 700 }}>✅ Email will be sent</span>
                )}
              </label>
              <input
                type="email"
                placeholder="client@gmail.com"
                value={clientEmail}
                onChange={e => setClientEmail(e.target.value)}
                disabled={uploading}
              />
              <span className="dlv-hint">
                A review notification email with link details will be sent automatically.
              </span>
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
                {uploading ? 'Saving & Notifying…' : '🔗 Add Link & Send Mail'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
