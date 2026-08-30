export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this._pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    this.clicked = false;
    this._down = false;
    this._moved = 0;
    this._lastX = 0;
    this._lastY = 0;
  }

  attach() {
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => this._onKeyUp(e));
    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    window.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', e => this._onMouseUp(e));
    this.canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom += e.deltaY;
    }, { passive: false });
    this.canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  _onKeyDown(e) {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    if (!this.keys.has(e.code)) this._pressed.add(e.code);
    this.keys.add(e.code);
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    this._down = true;
    this._moved = 0;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  }

  _onMouseMove(e) {
    if (!this._down) return;
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this._moved += Math.abs(dx) + Math.abs(dy);
    this.look.x += dx;
    this.look.y += dy;
  }

  _onMouseUp(e) {
    if (e.button !== 0) return;
    const wasDown = this._down;
    this._down = false;
    if (wasDown && this._moved < 6) this.clicked = true;
  }

  isDown(code) {
    return this.keys.has(code);
  }

  justPressed(code) {
    if (!this._pressed.has(code)) return false;
    this._pressed.delete(code);
    return true;
  }

  consumeClick() {
    const value = this.clicked;
    this.clicked = false;
    return value;
  }

  update() {
    this.look.x = 0;
    this.look.y = 0;
    this.zoom = 0;
  }
}
