import './styles.css';
import { Game } from './game';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const game = new Game(canvas);

// exposed for the smoke test, and for anyone with devtools open who wants to cheat
(window as unknown as { tinyClaw: Game }).tinyClaw = game;

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.update(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'play') game.togglePause();
});
