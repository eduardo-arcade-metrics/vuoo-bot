import {
  pose,
  idle,
  breathing,
  blink,
  saccades,
  lookLeftRight,
  randomMicroMovements,
  bounce,
  jolt,
  spin,
} from './behaviours.js';

export const STATES = {
  IDLE: 'IDLE',
  ATTENTION: 'ATTENTION',
  LOOKING: 'LOOKING',
  THINKING: 'THINKING',
  HAPPY: 'HAPPY',
  SURPRISED: 'SURPRISED',
  SLEEPING: 'SLEEPING',
  SPINNING: 'SPINNING',
};

// Each state lists behaviour factories (bot -> handle). The pose comes first so the
// state's resting values are set before its loops start adding motion on top.
const STATE_BEHAVIOURS = {
  [STATES.IDLE]: [
    (bot) => pose(bot),
    (bot) => idle(bot, 1),
    (bot) => breathing(bot, 1),
    (bot) => blink(bot),
    (bot) => saccades(bot, { range: 0.45, headFollow: 0.5 }),
  ],
  [STATES.ATTENTION]: [
    (bot) =>
      pose(bot, {
        head: { y: -16, rotate: -6 },
        eyes: { size: 1.12, open: 1.05 },
        particles: { amplitude: 10, speed: 1.4, spread: 1.06 },
        duration: 450,
        easing: 'outBack',
      }),
    (bot) => idle(bot, 0.35),
    (bot) => breathing(bot, 0.8, 1.2),
    (bot) => blink(bot, { min: 3500, max: 7000, doubleChance: 0 }),
    (bot) => saccades(bot, { range: 0.12, holdMin: 900, holdMax: 2200, headFollow: 0.3 }),
  ],
  [STATES.LOOKING]: [
    (bot) => pose(bot, { eyes: { size: 1.05 }, particles: { speed: 1.2 } }),
    (bot) => idle(bot, 0.5),
    (bot) => breathing(bot, 1),
    (bot) => blink(bot, { min: 2000, max: 4500 }),
    (bot) => lookLeftRight(bot),
  ],
  [STATES.THINKING]: [
    (bot) =>
      pose(bot, {
        head: { x: 10, rotate: 9 },
        eyes: { look: [0.55, -0.75], open: 0.85 },
        particles: { amplitude: 8, speed: 0.5, spread: 0.95 },
        duration: 800,
      }),
    (bot) => idle(bot, 0.4, 0.6),
    (bot) => breathing(bot, 1, 0.8),
    (bot) => blink(bot, { min: 2500, max: 5000, doubleChance: 0.1 }),
    (bot) => saccades(bot, { base: [0.55, -0.75], range: 0.15, holdMin: 900, holdMax: 2000, headFollow: 0 }),
    (bot) => randomMicroMovements(bot, 0.7),
  ],
  [STATES.HAPPY]: [
    (bot) =>
      pose(bot, {
        head: { rotate: 4 },
        eyes: { look: [0, -0.35], open: 0.55, size: 1.05 },
        particles: { amplitude: 16, speed: 2.2, spread: 1.12 },
        duration: 400,
        easing: 'outBack',
        particleEasing: 'outBack',
        particleDuration: 600,
      }),
    (bot) => idle(bot, 0.3, 1.5),
    (bot) => bounce(bot, { height: 50 }),
  ],
  [STATES.SURPRISED]: [
    (bot) =>
      pose(bot, {
        head: { y: -30 },
        eyes: { size: 1.3, open: 1.15 },
        particles: { amplitude: 14, speed: 2, spread: 1.2 },
        duration: 350,
        easing: 'outBack',
        particleEasing: 'outElastic',
        particleDuration: 1200,
      }),
    (bot) => jolt(bot),
    (bot) => breathing(bot, 0.6, 2),
  ],
  [STATES.SLEEPING]: [
    (bot) =>
      pose(bot, {
        head: { y: 25, rotate: 10, sy: 0.96 },
        eyes: { look: [0, 0.3], open: 0.06 },
        particles: { amplitude: 5, speed: 0.3, spread: 0.92 },
        duration: 1400,
        easing: 'inOutSine',
        particleDuration: 2000,
      }),
    (bot) => idle(bot, 0.3, 0.4),
    (bot) => breathing(bot, 2.2, 0.45),
  ],
  [STATES.SPINNING]: [
    (bot) =>
      pose(bot, {
        eyes: { size: 1.12, open: 1.05 },
        particles: { amplitude: 6, speed: 1.5 },
        duration: 300,
        easing: 'outBack',
      }),
    (bot) => spin(bot),
  ],
};

export function createStateMachine(bot) {
  let current = null;
  let activeHandles = [];

  function setState(nextState) {
    if (!STATE_BEHAVIOURS[nextState]) {
      throw new Error(`Unknown state: ${nextState}`);
    }
    if (nextState === current) return;

    activeHandles.forEach((handle) => handle.stop());
    activeHandles = STATE_BEHAVIOURS[nextState].map((factory) => factory(bot));
    activeHandles.forEach((handle) => handle.start());
    current = nextState;
  }

  function getState() {
    return current;
  }

  return { setState, getState };
}
