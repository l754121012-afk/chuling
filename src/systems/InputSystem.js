export class InputSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this._pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    this.edgeLook = { x: 0, y: 0 };
    this.clicked = false;
    this._down = false;
    this._rightDown = false;
    this._rightPressed = false;
    this._lastX = null;
    this._lastY = null;
    this.locked = false;
    this.allowLock = false;
    this._ignoreClick = false;
    this.onLockChange = null;
    this._lockTimer = null;
  }

  attach() {
    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => this._onKeyUp(e));
    this.canvas.addEventListener('mousedown', e => this._onMouseDown(e));
    this.canvas.addEventListener('mousemove', e => this._onMouseMove(e));
    window.addEventListener('mouseup', e => this._onMouseUp(e));
    document.addEventListener('mousemove', e => {
      if (this.locked) this._onLockedMouseMove(e);
    });
    document.addEventListener('pointerlockchange', () => this._onLockChange());
    document.addEventListener('pointerlockerror', () => {
      clearTimeout(this._lockTimer);
      this._lockTimer = null;
      this.allowLock = false;
      this.locked = false;
      this._ignoreClick = false;
      this.onLockChange?.(false);
    });
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
    if (e.button === 2) {
      this._rightDown = true;
      this._rightPressed = true;
      return;
    }
    if (e.button !== 0) return;
    if (this.allowLock && !this.locked) this._requestLock();
    this._down = true;
    this._lastX = null;
    this._lastY = null;
  }

  _onMouseMove(e) {
    if (this.locked) return;
    const dx = this._lastX === null ? 0 : e.clientX - this._lastX;
    const dy = this._lastY === null ? 0 : e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this.look.x += dx;
    this.look.y += dy;
    const edge = 28;
    this.edgeLook.x = e.clientX <= edge ? -1 : e.clientX >= window.innerWidth - edge ? 1 : 0;
    this.edgeLook.y = e.clientY <= edge ? -1 : e.clientY >= window.innerHeight - edge ? 1 : 0;
  }

  _onLockedMouseMove(e) {
    this.look.x += e.movementX || 0;
    this.look.y += e.movementY || 0;
  }

  _onMouseUp(e) {
    if (e.button === 2) {
      this._rightDown = false;
      return;
    }
    if (e.button !== 0) return;
    if (this._ignoreClick) {
      this._ignoreClick = false;
      this._down = false;
      return;
    }
    const wasDown = this._down;
    this._down = false;
    if (wasDown) this.clicked = true;
  }

  _requestLock() {
    if (!this.canvas.requestPointerLock) {
      this.allowLock = false;
      this._ignoreClick = false;
      return;
    }
    clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => {
      if (!this.locked && this.allowLock) {
        this.allowLock = false;
        this._ignoreClick = false;
      }
    }, 300);
    try {
      this.canvas.requestPointerLock();
    } catch {
      clearTimeout(this._lockTimer);
      this._lockTimer = null;
      this.allowLock = false;
      this._ignoreClick = false;
    }
  }

  _onLockChange() {
    clearTimeout(this._lockTimer);
    this._lockTimer = null;
    const locked = document.pointerLockElement === this.canvas;
    if (locked === this.locked) {
      this._ignoreClick = false;
      return;
    }
    this.locked = locked;
    this._ignoreClick = false;
    this.onLockChange?.(locked);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  isRightDown() {
    return this._rightDown;
  }

  justRightPressed() {
    if (!this._rightPressed) return false;
    this._rightPressed = false;
    return true;
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
    if (!this.locked) {
      this.look.x = this.edgeLook.x * 2.7;
      this.look.y = this.edgeLook.y * 2.7;
    } else {
      this.look.x = 0;
      this.look.y = 0;
    }
    this.zoom = 0;
  }
}
