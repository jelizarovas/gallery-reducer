// gamepadStore.js — the controller state shared with the rest of the app.
import { useSyncExternalStore } from 'react';
import { standardButtons } from './gamepad-input.js';

export const HOLD_THRESHOLD = 220; // ms: tap vs hold

const buttons = () => Object.fromEntries(standardButtons.map(b => [b, { pressed: false, lastPressTime: null, tap: false, hold: false }]));
const user = index => ({ index, connected: false, name: '', supported: true, buttons: buttons(), axes: {} });
let state = { users: [0, 1, 2, 3].map(user) };
const subscribers = new Set();
const notify = () => subscribers.forEach(cb => cb());

export const getGamepadState = () => state;
export function subscribe(cb) { subscribers.add(cb); return () => subscribers.delete(cb); }
export function updateGamepadState(index, patch) { const users = [...state.users]; users[index] = { ...users[index], ...patch }; state = { ...state, users }; notify(); }
export function updateButtonState(index, name, patch) { const u = state.users[index]; updateGamepadState(index, { buttons: { ...u.buttons, [name]: { ...u.buttons[name], ...patch } } }); }
export function resetGamepad(index) { updateGamepadState(index, user(index)); }
export function useGamepadStore(selector = s => s) { return useSyncExternalStore(subscribe, () => selector(getGamepadState())); }
export function useGamepad() { return { gamepad: useGamepadStore(s => s.users[0]) }; }
