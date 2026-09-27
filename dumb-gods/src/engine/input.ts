export type Action = 'attack' | 'interact' | 'bag' | 'pause' | 'help';

const KEYMAP: Record<string, Action> = {
  Space: 'attack',
  KeyJ: 'attack',
  KeyE: 'interact',
  KeyF: 'interact',
  Enter: 'interact',
  KeyB: 'bag',
  KeyI: 'bag',
  Tab: 'bag',
  Escape: 'pause',
  KeyP: 'pause',
  KeyH: 'help',
};

/**
 * Keyboard + mouse + touch. Left half of a touch screen is a floating joystick,
 * right half drags the camera. On desktop: WASD to move, Q/R, arrow keys or right-drag to turn the camera.
 */
export class Input {
  moveX = 0;
  moveY = 0;
  /** accumulated camera yaw since last read, radians */
  private yaw = 0;
  private held = new Set<Action>();
  private pressed = new Set<Action>();
  private keys = new Set<string>();
  private joyId: number | null = null;
  private camId: number | null = null;
  private camLastX = 0;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private mouseDown = false;
  private rightDrag = false;
  enabled = true;
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;

  constructor(zone: HTMLElement) {
    this.joyBase = document.createElement('div');
    this.joyBase.className = 'joy-base';
    this.joyKnob = document.createElement('div');
    this.joyKnob.className = 'joy-knob';
    this.joyBase.appendChild(this.joyKnob);
    zone.appendChild(this.joyBase);

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'BUTTON') {
        if (e.code === 'Space' || e.code === 'Enter') return;
      }
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) {
        if (!this.held.has(a)) this.pressed.add(a);
        this.held.add(a);
        if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = KEYMAP[e.code];
      if (a) this.held.delete(a);
    });
    window.addEventListener('blur', () => this.releaseAll());

    zone.addEventListener('contextmenu', (e) => e.preventDefault());
    zone.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (e.button === 2) {
          this.rightDrag = true;
          this.camLastX = e.clientX;
        } else this.mouseDown = true;
        return;
      }
      document.body.classList.add('touch');
      if (this.joyId === null && e.clientX < window.innerWidth * 0.5) {
        this.joyId = e.pointerId;
        this.joyOrigin = { x: e.clientX, y: e.clientY };
        this.joyVec = { x: 0, y: 0 };
        this.joyBase.style.left = `${e.clientX}px`;
        this.joyBase.style.top = `${e.clientY}px`;
        this.joyBase.classList.add('on');
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
        zone.setPointerCapture(e.pointerId);
      } else if (this.camId === null) {
        this.camId = e.pointerId;
        this.camLastX = e.clientX;
        zone.setPointerCapture(e.pointerId);
      }
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        if (this.rightDrag) {
          this.yaw -= (e.clientX - this.camLastX) * 0.006;
          this.camLastX = e.clientX;
        }
        return;
      }
      if (e.pointerId === this.camId) {
        this.yaw -= (e.clientX - this.camLastX) * 0.008;
        this.camLastX = e.clientX;
        return;
      }
      if (e.pointerId !== this.joyId) return;
      const R = 56;
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        const over = len - R;
        this.joyOrigin.x += (dx / len) * over;
        this.joyOrigin.y += (dy / len) * over;
        this.joyBase.style.left = `${this.joyOrigin.x}px`;
        this.joyBase.style.top = `${this.joyOrigin.y}px`;
        dx = (dx / len) * R;
        dy = (dy / len) * R;
      }
      this.joyVec = { x: dx / R, y: dy / R };
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        this.mouseDown = false;
        this.rightDrag = false;
      }
      if (e.pointerId === this.camId) this.camId = null;
      if (e.pointerId !== this.joyId) return;
      this.joyId = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouseDown = false;
        this.rightDrag = false;
      }
    });
  }

  /** Wire an on-screen button to an action. */
  bindButton(el: HTMLElement, action: Action) {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.held.has(action)) this.pressed.add(action);
      this.held.add(action);
      el.classList.add('down');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const up = (e: PointerEvent) => {
      e.preventDefault();
      this.held.delete(action);
      el.classList.remove('down');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  update(dt: number) {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyQ') || this.keys.has('ArrowLeft')) this.yaw += 2.2 * dt;
    if (this.keys.has('KeyR') || this.keys.has('ArrowRight')) this.yaw -= 2.2 * dt;
    if (x || y) {
      const l = Math.hypot(x, y);
      x /= l;
      y /= l;
    } else {
      x = this.joyVec.x;
      y = -this.joyVec.y;
      const l = Math.hypot(x, y);
      if (l < 0.18) {
        x = 0;
        y = 0;
      }
    }
    this.moveX = this.enabled ? x : 0;
    this.moveY = this.enabled ? y : 0;
  }

  takeYaw() {
    const y = this.yaw;
    this.yaw = 0;
    return this.enabled ? y : 0;
  }

  isHeld(a: Action) {
    if (!this.enabled) return false;
    if (a === 'attack' && this.mouseDown) return true;
    return this.held.has(a);
  }

  consume(a: Action) {
    const had = this.pressed.has(a);
    this.pressed.delete(a);
    return had;
  }

  flush() {
    this.pressed.clear();
  }

  releaseAll() {
    this.keys.clear();
    this.held.clear();
    this.pressed.clear();
    this.mouseDown = false;
    this.rightDrag = false;
    this.joyId = null;
    this.camId = null;
    this.joyVec = { x: 0, y: 0 };
    this.joyBase.classList.remove('on');
  }
}
