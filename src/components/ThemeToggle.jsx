import { useTheme } from '../contexts/ThemeContext';

export default function ThemeToggle({ className = '', compact = false }) {
  const { theme, setTheme, toggleTheme } = useTheme();

  if (compact) {
    return (
      <button
        type="button"
        className={`mobile-theme-pill ${theme === 'dark' ? 'is-dark' : 'is-light'} ${className}`}
        onClick={toggleTheme}
        title={`Currently in ${theme === 'dark' ? 'Dark' : 'Light'} Mode. Tap to switch.`}
        aria-label="Toggle light or dark theme mode"
      >
        <span className={`theme-pill-icon ${theme === 'light' ? 'active' : ''}`} title="Light Mode">☀️</span>
        <span className={`theme-pill-icon ${theme === 'dark' ? 'active' : ''}`} title="Dark Mode">🌙</span>
      </button>
    );
  }

  return (
    <div className={`sidebar-theme-toggle ${className}`}>
      <div className="theme-toggle-header">
        <span className="theme-toggle-title">Theme</span>
      </div>
      <div className="theme-toggle-pill-group" role="group" aria-label="Theme mode switcher">
        <button
          type="button"
          className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
          onClick={() => setTheme('light')}
          title="Switch to Light Mode"
          aria-pressed={theme === 'light'}
        >
          <span className="theme-toggle-icon">☀️</span>
          <span className="theme-toggle-text">Light</span>
        </button>
        <button
          type="button"
          className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
          onClick={() => setTheme('dark')}
          title="Switch to Dark Mode"
          aria-pressed={theme === 'dark'}
        >
          <span className="theme-toggle-icon">🌙</span>
          <span className="theme-toggle-text">Dark</span>
        </button>
      </div>
    </div>
  );
}

