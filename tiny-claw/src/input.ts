// Keyboard, mouse, touch and gamepad, flattened into the sim's Input.
import type { Input } from './sim';

export class Controls {
  private keys = new Set<string>();
  private pinchQueued = false;
  private dashQueued = false;
  private stick = { x: 0, y: 0, id: -1, ox: 0, oy: 0 };
  private padPrev = { a: false, b: false };
  onPause: () => void = () => {};
  onAdvance: () => void = () => {};
  onMute: () => void = () => {};
  onAnyInput: () => void = () => {};
  touch = false;

  constructor(canvas: HTMLCanvasElement, private stickEl: HTMLElement, private knobEl: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.onAnyInput();
      if (e.repeat) {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      switch (e.code) {
        case 'Space':
        case 'KeyJ':
        case 'KeyK':
          this.pinchQueued = true;
          this.onAdvance();
          e.preventDefault();
          break;
        case 'Enter':
          this.onAdvance();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
        case 'KeyL':
          this.dashQueued = true;
          break;
        case 'Escape':
        case 'KeyP':
          this.onPause();
          break;
        case 'KeyM':
          this.onMute();
          break;
      }
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.onAnyInput();
      if (e.button === 0) this.pinchQueued = true;
      if (e.button === 2) this.dashQueued = true;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // left thumb: a floating joystick anywhere on the left half of the screen
    const zone = document.getElementById('stickzone')!;
    zone.addEventListener(
      'touchstart',
      (e) => {
        this.touch = true;
        this.onAnyInput();
        const t = e.changedTouches[0];
        this.stick.id = t.identifier;
        this.stick.ox = t.clientX;
        this.stick.oy = t.clientY;
        this.stick.x = 0;
        this.stick.y = 0;
        this.stickEl.style.transform = `translate(${t.clientX - 60}px, ${t.clientY - 60}px)`;
        this.stickEl.classList.add('on');
        e.preventDefault();
      },
      { passive: false },
    );
    zone.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier !== this.stick.id) continue;
          let dx = (t.clientX - this.stick.ox) / 50;
          let dy = (t.clientY - this.stick.oy) / 50;
          const len = Math.hypot(dx, dy);
          if (len > 1) {
            dx /= len;
            dy /= len;
          }
          this.stick.x = dx;
          this.stick.y = dy;
          this.knobEl.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier !== this.stick.id) continue;
        this.stick.id = -1;
        this.stick.x = 0;
        this.stick.y = 0;
        this.knobEl.style.transform = '';
        this.stickEl.classList.remove('on');
      }
    };
    zone.addEventListener('touchend', end);
    zone.addEventListener('touchcancel', end);

    const btn = (id: string, fn: () => void) => {
      const el = document.getElementById(id)!;
      el.addEventListener(
        'touchstart',
        (e) => {
          this.touch = true;
          this.onAnyInput();
          fn();
          el.classList.add('down');
          e.preventDefault();
        },
        { passive: false },
      );
      el.addEventListener('touchend', () => el.classList.remove('down'));
      el.addEventListener('mousedown', (e) => {
        fn();
        e.preventDefault();
      });
    };
    btn('t-pinch', () => {
      this.pinchQueued = true;
    });
    btn('t-dash', () => {
      this.dashQueued = true;
    });
  }

  private down(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }

  read(): Input {
    let mx = (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
    let mz = (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
    if (this.stick.id !== -1) {
      mx = Math.abs(this.stick.x) > 0.2 ? this.stick.x : 0;
      mz = Math.abs(this.stick.y) > 0.25 ? -this.stick.y : 0;
    }
    const pads = navigator.getGamepads?.() ?? [];
    for (const pad of pads) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > 0.25) mx = ax;
      if (Math.abs(ay) > 0.3) mz = -ay;
      if (pad.buttons[14]?.pressed) mx = -1;
      if (pad.buttons[15]?.pressed) mx = 1;
      const a = !!pad.buttons[0]?.pressed || !!pad.buttons[2]?.pressed;
      const b = !!pad.buttons[1]?.pressed || !!pad.buttons[5]?.pressed || !!pad.buttons[7]?.pressed;
      if (a && !this.padPrev.a) {
        this.pinchQueued = true;
        this.onAdvance();
      }
      if (b && !this.padPrev.b) this.dashQueued = true;
      if (pad.buttons[9]?.pressed && !this.keys.has('pad-start')) {
        this.keys.add('pad-start');
        this.onPause();
      } else if (!pad.buttons[9]?.pressed) this.keys.delete('pad-start');
      this.padPrev = { a, b };
      break;
    }
    const out: Input = { mx, mz, pinch: this.pinchQueued, dash: this.dashQueued };
    this.pinchQueued = false;
    this.dashQueued = false;
    return out;
  }

  clearQueued() {
    this.pinchQueued = false;
    this.dashQueued = false;
  }
}
