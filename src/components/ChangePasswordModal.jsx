import { useState, useRef } from 'react';
import {
  auth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from '../firebase';
import { showToast } from './Toast';

export default function ChangePasswordModal({ onClose }) {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass,     setNewPass]     = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPass.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (newPass !== confirmPass) {
      setError('New passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const user       = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, currentPass);

      // Re-authenticate to verify current password
      await reauthenticateWithCredential(user, credential);

      // Update to new password
      await updatePassword(user, newPass);

      showToast('✅ Password changed successfully!');
      onClose();
    } catch (err) {
      console.error('Change password error:', err.code);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('❌ Current password is incorrect.');
      } else if (err.code === 'auth/weak-password') {
        setError('❌ New password is too weak (min 6 characters).');
      } else {
        setError('❌ Failed to change password. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box change-pass-box" style={{ maxWidth: 400, padding: '2rem' }}>

        <div className="modal-header">
          <h3>🔑 Change Password</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="input-group" style={{ marginTop: '.75rem' }}>
            <label htmlFor="cp-current">Current Password</label>
            <div className="input-wrap">
              <span className="input-icon">🔒</span>
              <input
                id="cp-current"
                type="password"
                placeholder="Your current password"
                value={currentPass}
                onChange={e => setCurrentPass(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="cp-new">New Password</label>
            <div className="input-wrap">
              <span className="input-icon">✏️</span>
              <input
                id="cp-new"
                type="password"
                placeholder="At least 6 characters"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="cp-confirm">Confirm New Password</label>
            <div className="input-wrap">
              <span className="input-icon">✅</span>
              <input
                id="cp-confirm"
                type="password"
                placeholder="Repeat new password"
                value={confirmPass}
                onChange={e => setConfirmPass(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <p className="login-error" style={{ marginBottom: '.75rem' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end', marginTop: '.5rem' }}>
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-add-work" disabled={busy}>
              {busy ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
