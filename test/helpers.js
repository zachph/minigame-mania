/**
 * A stand-in for CanvasRenderingContext2D: records nothing, throws nothing, and
 * fails loudly if drawing code ever hands it a non-finite coordinate.
 */
export function createFakeContext() {
  const noop = () => {};
  const ctx = {
    canvas: { width: 960, height: 540 },
    calls: 0,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    measureText: (text) => ({ width: String(text).length * 7 }),
    setTransform: noop,
    getTransform: () => ({}),
  };
  const methods = [
    'save', 'restore', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo',
    'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect',
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
