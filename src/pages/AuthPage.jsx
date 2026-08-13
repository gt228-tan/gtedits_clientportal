import { useState, useRef } from 'react';
import { auth, signInWithEmailAndPassword } from '../firebase';
import Toast from '../components/Toast';

export default function AuthPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const formRef = useRef(null);

  const shake = () => {
    formRef.current?.classList.remove('shake');
    void formRef.current?.offsetWidth;
    formRef.current?.classList.add('shake');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setError(''); setBusy(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // AuthContext detects role → App.jsx redirects to /admin or /portal
    } catch (err) {
      console.error('Login error:', err.code);
      shake();
      if (err.code === 'auth/too-many-requests') {
        setError('❌ Too many attempts — try again later.');
      } else {
        setError('❌ Invalid email or password.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <Toast />
      <div className="login-box" ref={formRef}>

        {/* Brand */}
        <div className="login-brand">
          <span className="brand-icon">⚡</span>
          <div>
            <span className="brand-name">GT Edits</span>
            <span className="brand-sub">Client Portal</span>
          </div>
        </div>

        <h1 className="login-title">Welcome Back</h1>
        <p className="login-desc">Sign in with the credentials shared by your service provider.</p>

        <form onSubmit={handleSubmit} autoComplete="off" noValidate>
          <div className="input-group">
            <label htmlFor="si-email">Email</label>
            <div className="input-wrap">
              <span className="input-icon">📧</span>
              <input
                id="si-email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="si-pass">Password</label>
            <div className="input-wrap">
              <span className="input-icon">🔒</span>
              <input
                id="si-pass"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="off"
                required
              />
            </div>
          </div>

          {error && <p className="login-error">{error}</p>}

          <button type="submit" className="btn-login" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>

      </div>
    </div>
  );
}
