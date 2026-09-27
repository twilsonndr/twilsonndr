import './styles.css';
import { Game } from './game';
import { UI } from './ui';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const zone = document.getElementById('zone') as HTMLElement;

const game = new Game(canvas, zone);
const ui = new UI(game);
game.ui = ui;
ui.title();

// expose for the smoke test and for curious people with devtools open
(window as unknown as { dumbGods: Game }).dumbGods = game;

let last = performance.now();
let hudAcc = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  ui.labelsFrame();
  hudAcc += dt;
  if (hudAcc > 0.12) {
    hudAcc = 0;
    ui.hud();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.started && !ui.modalOpen() && !game.sim.over) ui.openHelp();
});
