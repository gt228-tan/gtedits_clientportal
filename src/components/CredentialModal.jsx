import { showToast } from './Toast';

export default function CredentialModal({ name, email, password, onClose }) {
  const copyBoth = () => {
    navigator.clipboard.writeText(`Username: ${name}\nEmail: ${email}\nPassword: ${password}`)
      .then(() => showToast('📋 Credentials copied!'));
  };

  const copyVal = (val, label) => {
    navigator.clipboard.writeText(val)
      .then(() => showToast(`📋 ${label} copied!`));
  };

  return (
    <div className="adv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="adv-box cred-box">
        <div className="adv-icon">🔐</div>
        <h4 className="adv-title">Client Portal Access</h4>
        <p className="adv-sub">Share these credentials with your client privately.</p>

        <div className="cred-row" onClick={() => copyVal(name, 'Username')} title="Click to copy username">
          <span className="cred-label">👤 Username</span>
          <div className="cred-val-wrap">
            <code className="cred-val">{name}</code>
            <span className="cred-copy-icon">📋</span>
          </div>
        </div>
        <div className="cred-row" onClick={() => copyVal(email, 'Email')} title="Click to copy email">
          <span className="cred-label">📧 Email</span>
          <div className="cred-val-wrap">
            <code className="cred-val">{email}</code>
            <span className="cred-copy-icon">📋</span>
          </div>
        </div>
        <div className="cred-row" onClick={() => copyVal(password, 'Password')} title="Click to copy password">
          <span className="cred-label">🔒 Password</span>
          <div className="cred-val-wrap">
            <code className="cred-val">{password}</code>
            <span className="cred-copy-icon">📋</span>
          </div>
        </div>

        <div className="cred-rule-note">
          <span className="cred-note-icon">💡</span>
          <div>
            Default password: <strong>first 2 letters (lowercase) + @123</strong><br />
            Advise clients to change it after first login.
          </div>
        </div>

        <div className="adv-actions">
          <button className="btn-adv-confirm" onClick={copyBoth}>📋 Copy Both</button>
          <button className="btn-adv-cancel"  onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

