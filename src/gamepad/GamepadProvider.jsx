// GamepadProvider.jsx — a polling loop (standard-mapped pads via navigator.getGamepads,
// tap/hold tracking, d-pad/stick repeat from gamepad-input.js). The spatial focus manager is left out: this app maps
// buttons straight to review actions, so the provider just emits window events:
//   'gamepadbuttonpress' / 'gamepadbuttonrelease'  detail { button, userIndex }
//   'gamepadmove'                                  detail { direction, userIndex }   (repeats while held)
import { useEffect } from 'react';
import { updateGamepadState, updateButtonState, getGamepadState, resetGamepad, HOLD_THRESHOLD } from './gamepadStore.js';
import { standardButtons, navigationDirection, repeatNavigation } from './gamepad-input.js';

export function GamepadProvider({ children }) {
  useEffect(() => {
    let frame;
    const pads = new Map();
    const release = index => { pads.delete(index); resetGamepad(index); };
    const send = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
    const poll = now => {
      const snapshots = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      for (let index = 0; index < 4; index++) {
        const pad = snapshots[index];
        if (!pad?.connected || document.hidden) { if (pads.has(index)) release(index); continue; }
        let last = pads.get(index);
        if (!last) { last = { buttons: [], repeat: {} }; pads.set(index, last); updateGamepadState(index, { connected: true, name: pad.id, supported: pad.mapping === 'standard' }); }
        if (pad.mapping !== 'standard') continue;
        for (let b = 0; b < standardButtons.length; b++) {
          const pressed = Boolean(pad.buttons[b]?.pressed || pad.buttons[b]?.value > .5), name = standardButtons[b];
          if (pressed !== Boolean(last.buttons[b])) {
            last.buttons[b] = pressed;
            updateButtonState(index, name, pressed ? { pressed: true, lastPressTime: Date.now(), hold: false, tap: false } : { pressed: false, lastPressTime: null, hold: false, tap: true });
            send(pressed ? 'gamepadbuttonpress' : 'gamepadbuttonrelease', { button: name, userIndex: index });
          }
          const st = getGamepadState().users[index].buttons[name];
          if (pressed && st && !st.hold && Date.now() - st.lastPressTime >= HOLD_THRESHOLD) updateButtonState(index, name, { hold: true });
          if (!pressed && st?.tap) updateButtonState(index, name, { tap: false });
        }
        const direction = navigationDirection(pad), tick = repeatNavigation(last.repeat, direction, now);
        last.repeat = tick.state;
        // source tells d-pad from left stick, so a mode can give them different jobs
        if (tick.move) send('gamepadmove', { direction, userIndex: index, source: [12, 13, 14, 15].some(b => pad.buttons[b]?.pressed) ? 'dpad' : 'stick' });
        // right stick, every frame it is off-centre (used for panning a zoomed picture)
        const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
        if (Math.abs(rx) > .15 || Math.abs(ry) > .15) send('gamepadstick', { x: rx, y: ry, userIndex: index });
      }
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
    const visibility = () => { if (document.hidden) for (const index of [...pads.keys()]) release(index); };
    document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', visibility); for (const index of [...pads.keys()]) release(index); };
  }, []);
  return children;
}
