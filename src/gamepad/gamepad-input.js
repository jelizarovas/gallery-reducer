export const standardButtons = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'LS', 'RS', 'DPadUp', 'DPadDown', 'DPadLeft', 'DPadRight', 'Home'];
export function navigationDirection(pad, deadzone = .55) {
  for (const [button, direction] of [[12, 'Up'], [13, 'Down'], [14, 'Left'], [15, 'Right']]) if (pad.buttons[button]?.pressed) return direction;
  const x = pad.axes[0] || 0, y = pad.axes[1] || 0;
  if (Math.max(Math.abs(x), Math.abs(y)) < deadzone) return null;
  return Math.abs(x) > Math.abs(y) ? x > 0 ? 'Right' : 'Left' : y > 0 ? 'Down' : 'Up';
}
export function repeatNavigation(previous, direction, now) {
  if (!direction) return { state: {}, move: false };
  if (direction !== previous.direction) return { state: { direction, next: now + 360 }, move: true };
  if (now >= previous.next) return { state: { direction, next: now + 140 }, move: true };
  return { state: previous, move: false };
}
