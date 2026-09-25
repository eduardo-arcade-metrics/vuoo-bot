import { STATES } from './state-machine.js';

// Distances in SVG units (viewBox is 1322 x 1240).
const GAZE_RADIUS = 450;
const NEAR_RADIUS = 700;
const RIPPLE_FALLOFF = 420;
const HEAD_HIT_PADDING = 30;
const RELEASE_AFTER_MS = 2500;
const POKE_WINDOW_MS = 1200;
const POKES_TO_GIGGLE = 3;
const NO_FOLLOW_STATES = new Set([STATES.SLEEPING, STATES.SPINNING]);

export function attachInteraction(bot, { stage, stateMachine, events }) {
  let engaged = false;
  let releaseTimer = null;
  let recentPokes = [];

  const canFollow = () => !NO_FOLLOW_STATES.has(stateMachine.getState());

  // The head has no face shape of its own, so the gap between the eyes must count as a hit too.
  function hitsHead(point) {
    const { cx, cy, width, height } = bot.geometry.head;
    return Math.abs(point.x - cx) < width / 2 + HEAD_HIT_PADDING && Math.abs(point.y - cy) < height / 2 + HEAD_HIT_PADDING;
  }

  function release() {
    clearTimeout(releaseTimer);
    if (!engaged) return;
    engaged = false;
    bot.follow.engage(false);
  }

  function gazeAt(point) {
    const { cx, cy } = bot.geometry.head;
    const dx = point.x - cx;
    const dy = point.y - cy;
    bot.follow.setTarget(dx / GAZE_RADIUS, dy / GAZE_RADIUS, 1 - Math.hypot(dx, dy) / NEAR_RADIUS);
    if (!engaged) {
      engaged = true;
      bot.follow.engage(true);
    }
    // Stop staring when the pointer rests, so the autonomous behaviours take over again.
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(release, RELEASE_AFTER_MS);
  }

  function poke(point) {
    const { cx, cy } = bot.geometry.head;
    const dx = cx - point.x;
    const dy = cy - point.y;
    const distance = Math.hypot(dx, dy) || 1;
    // Pushed away from the finger, spun by the side that was hit, squashed on impact.
    bot.head.impulse((dx / distance) * 650, (dy / distance) * 450, ((point.x - cx) / 200) * 70, 2.2);
    bot.eyes.squint(0.3);

    const now = performance.now();
    recentPokes = recentPokes.filter((time) => now - time < POKE_WINDOW_MS);
    recentPokes.push(now);
    if (recentPokes.length >= POKES_TO_GIGGLE) {
      recentPokes = [];
      events.emit('happy');
    }
  }

  // A shock wave from the click point: nearer particles are hit earlier and harder.
  function ripple(point, strength = 1) {
    bot.particles.positions().forEach((p, index) => {
      const dx = p.x - point.x;
      const dy = p.y - point.y;
      const distance = Math.hypot(dx, dy) || 1;
      const force = Math.exp(-distance / RIPPLE_FALLOFF) * strength;
      setTimeout(
        () => bot.particles.impulse(index, (dx / distance) * 900 * force, (dy / distance) * 900 * force, 3 * force),
        (distance * 0.5) / bot.tuning.timeScale
      );
    });

    const { cx, cy } = bot.geometry.head;
    const hx = cx - point.x;
    const hy = cy - point.y;
    const headDistance = Math.hypot(hx, hy) || 1;
    const flinch = Math.exp(-headDistance / RIPPLE_FALLOFF) * strength;
    bot.head.impulse((hx / headDistance) * 350 * flinch, (hy / headDistance) * 250 * flinch, 0, 1.2 * flinch);
  }

  function pop(index, point) {
    bot.particles.impulse(index, 0, 0, 6);
    ripple(point, 0.4);
  }

  window.addEventListener('pointermove', (event) => {
    if (!canFollow()) return release();
    gazeAt(bot.toScenePoint(event.clientX, event.clientY));
  });

  // Touch fires pointerleave right after every tap, which would cancel the glance at the tap.
  document.documentElement.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') release();
  });

  stage.addEventListener('pointerdown', (event) => {
    if (stateMachine.getState() === STATES.SLEEPING) {
      events.emit('surprised');
      return;
    }

    const point = bot.toScenePoint(event.clientX, event.clientY);
    const particleIndex = bot.particles.indexOf(event.target);
    if (particleIndex >= 0) pop(particleIndex, point);
    else if (event.target.closest('#head') || hitsHead(point)) poke(point);
    else ripple(point);

    if (canFollow()) gazeAt(point);
  });
}
