/** A pointer/keyboard stub with the same surface as `core/input.js`. */
export class FakeInput {
  constructor() {
    this.x = 480;
    this.y = 300;
    this.down = false;
    this.justPressed = false;
    this.justReleased = false;
    this.usingPointer = true;
    this.keys = new Set();
    this.keysPressed = new Set();
  }

  aimAt(x, y) {
    this.x = x;
    this.y = y;
    this.usingPointer = true;
  }

  press() {
    this.down = true;
    this.justPressed = true;
  }

  release() {
    this.down = false;
    this.justReleased = true;
  }

  isKeyDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  wasKeyPressed(...codes) {
    return codes.some((code) => this.keysPressed.has(code));
  }

  endFrame() {
    this.justPressed = false;
    this.justReleased = false;
    this.keysPressed.clear();
  }
}

/** Records nothing, throws nothing: enough of CanvasRenderingContext2D to draw into. */
export function createFakeContext() {
  const noop = () => {};
  const ctx = {
    canvas: { width: 960, height: 540 },
    calls: 0,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: () => ({ width: 10 }),
    setTransform: noop,
    getTransform: () => ({}),
  };
  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect',
    'fillText', 'strokeText', 'translate', 'rotate', 'scale', 'quadraticCurveTo',
    'bezierCurveTo', 'clip', 'setLineDash',
  ];
  for (const name of methods) {
    ctx[name] = (...args) => {
      ctx.calls += 1;
      for (const arg of args) {
        if (typeof arg === 'number' && !Number.isFinite(arg)) {
          throw new Error(`${name}() received a non-finite argument: ${args.join(', ')}`);
        }
      }
    };
  }
  return ctx;
}

/** Runs `frames` fixed steps, letting a callback poke at the game each frame. */
export function runFrames(game, input, frames, dt = 1 / 60, onFrame = null) {
  for (let i = 0; i < frames; i += 1) {
    onFrame?.(i, game, input);
    game.update(dt, input);
    input.endFrame();
  }
}
