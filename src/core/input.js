/**
 * Normalises pointer + keyboard into a per-frame snapshot for minigames.
 *
 * Pointer coordinates are converted from CSS pixels into the viewport's logical
 * coordinate space, so a game always works against a fixed 960x540 field no
 * matter how the stage is scaled or how dense the display is.
 */
export class Input {
  constructor(canvas, viewport) {
    this.canvas = canvas;
    this.viewport = viewport;
    this.x = viewport.width / 2;
    this.y = viewport.height / 2;
    this.down = false;
    this.justPressed = false;
    this.justReleased = false;
    this.usingPointer = false;
    this.keys = new Set();
    this.keysPressed = new Set();

    this._onPointerDown = (event) => {
      if (event.button != null && event.button !== 0) return;
      this.canvas.setPointerCapture?.(event.pointerId);
      this._track(event);
      this.usingPointer = true;
      if (!this.down) this.justPressed = true;
      this.down = true;
      event.preventDefault();
    };
    this._onPointerMove = (event) => {
      this._track(event);
      this.usingPointer = true;
    };
    this._onPointerUp = (event) => {
      this._track(event);
      if (this.down) this.justReleased = true;
      this.down = false;
    };
    this._onPointerCancel = () => {
      this.down = false;
    };
    this._onKeyDown = (event) => {
      if (event.repeat) return;
      const code = event.code;
      if (!this.keys.has(code)) this.keysPressed.add(code);
      this.keys.add(code);
      if (code === 'Space' || code.startsWith('Arrow')) event.preventDefault();
    };
    this._onKeyUp = (event) => {
      this.keys.delete(event.code);
    };
    this._onBlur = () => this.reset();

    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerCancel);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  _track(event) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.x = ((event.clientX - rect.left) / rect.width) * this.viewport.width;
    this.y = ((event.clientY - rect.top) / rect.height) * this.viewport.height;
  }

  isKeyDown(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  wasKeyPressed(...codes) {
    return codes.some((code) => this.keysPressed.has(code));
  }

  /** Clears edge-triggered state; called by the shell after every update. */
  endFrame() {
    this.justPressed = false;
    this.justReleased = false;
    this.keysPressed.clear();
  }

  /** Drops held state, e.g. when the window loses focus or the game pauses. */
  reset() {
    this.down = false;
    this.justPressed = false;
    this.justReleased = false;
    this.keys.clear();
    this.keysPressed.clear();
  }

  destroy() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    this.canvas.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerCancel);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }
}
