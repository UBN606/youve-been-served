// Standard Gamepad layout only. Browser/OS pairing and button labels vary by device.
const ACTION_NAMES = ['serve', 'dash', 'noContact', 'grayRock', 'pause', 'start', 'restart'];
const emptyActions = () => Object.fromEntries(ACTION_NAMES.map(name => [name, false]));
const axis = value => Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;

export function radialDeadzone(x, y, deadzone = .18) {
  x = axis(x); y = axis(y);
  const length = Math.hypot(x, y);
  if (length <= deadzone) return { x: 0, y: 0 };
  const scale = (Math.min(1, length) - deadzone) / ((1 - deadzone) * length);
  return { x: x * scale, y: y * scale };
}

// Read once per rendered frame. Missing APIs and Permissions Policy denial are benign.
export function readGamepads(navigatorLike = globalThis.navigator) {
  try { return Array.from(navigatorLike?.getGamepads?.() || []); } catch { return []; }
}

export function createControllerInput({ deadzone = .18, triggerThreshold = .55 } = {}) {
  if (!Number.isFinite(deadzone) || deadzone < 0 || deadzone >= 1) throw Error('deadzone must be from 0 to below 1');
  if (!Number.isFinite(triggerThreshold) || triggerThreshold <= 0 || triggerThreshold > 1) throw Error('triggerThreshold must be above 0 and at most 1');
  let identity = null, previous = {}, previousPhase = null, previouslyFocused = false, serveBlocked = true;
  const reset = () => { identity = null; previous = {}; previousPhase = null; previouslyFocused = false; serveBlocked = true; };

  function update(gamepads = [], { phase = 'ready', focused = true } = {}) {
    const pads = Array.from(gamepads || []).filter(p => p?.connected && p.mapping === 'standard');
    const key = p => `${p.index}:${p.id}`;
    const pad = pads.find(p => key(p) === identity) || pads[0];
    const result = { connected: !!pad, id: pad?.id || '', index: pad?.index ?? -1, move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, held: { serve: false }, actions: emptyActions() };
    if (!pad) { reset(); return result; }
    const pressed = index => pad.buttons?.[index]?.pressed === true || Number(pad.buttons?.[index]?.value || 0) >= triggerThreshold;
    const current = { a: pressed(0), b: pressed(1), x: pressed(2), y: pressed(3), serve: pressed(0) || pressed(7), start: pressed(9) };
    // A button held through menus/focus loss/reconnection must be released first.
    const suppress = identity !== key(pad) || phase !== previousPhase || !focused || !previouslyFocused;
    if (suppress && current.serve) serveBlocked = true;
    if (!current.serve) serveBlocked = false;
    const rising = name => !suppress && current[name] && !previous[name];
    identity = key(pad); previousPhase = phase; previouslyFocused = focused;
    if (!suppress) {
      if (phase === 'playing') {
        result.actions.pause = rising('start');
        if (result.actions.pause && current.serve) serveBlocked = true;
        if (!result.actions.pause) {
          result.move = radialDeadzone(pad.axes?.[0], pad.axes?.[1], deadzone);
          result.look = radialDeadzone(pad.axes?.[2], pad.axes?.[3], deadzone);
          result.actions.serve = rising('serve'); result.actions.dash = rising('b');
          result.held.serve = current.serve && !serveBlocked;
          result.actions.noContact = rising('x'); result.actions.grayRock = rising('y');
        }
      } else if (phase === 'paused') result.actions.pause = rising('start') || rising('a');
      else if (phase === 'ready' || phase === 'intro') result.actions.start = rising('start') || rising('a');
      else if (phase === 'finished' || phase === 'results') result.actions.restart = rising('start') || rising('a');
    }
    previous = current;
    return result;
  }
  return { update, reset };
}
