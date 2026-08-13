import { useState, useEffect, useCallback, useRef } from 'react';

// Global toast controller — call showToast() from anywhere
let _setToastState = null;

export function showToast(msg, type = 'success') {
  _setToastState?.({ msg, type, id: Date.now() });
}

export default function Toast() {
  const [state, setState]   = useState(null);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => { _setToastState = setState; return () => { _setToastState = null; }; }, []);

  useEffect(() => {
    if (!state) return;
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3000);
  }, [state]);

  if (!state) return null;

  return (
    <div className={`toast ${visible ? 'show' : ''} ${state.type}`}>
      {state.msg}
    </div>
  );
}
