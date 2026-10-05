const rand = (min, max) => min + Math.random() * (max - min);
// Waits follow the bot's time scale so the sliders speed up/slow down the pauses too.
const pause = (bot, ms) => new Promise((resolve) => setTimeout(resolve, ms / bot.tuning.timeScale));
const CANCELLED = Symbol('cancelled');

// Runs body repeatedly; step() awaits a promise and aborts the loop if stop() was called meanwhile.
function loop(body) {
  let generation = 0;
  return {
    start() {
      const mine = ++generation;
      const step = async (promise) => {
        await promise;
        if (generation !== mine) throw CANCELLED;
      };
      (async () => {
        try {
          while (generation === mine) await body(step);
        } catch (error) {
          if (error !== CANCELLED) throw error;
        }
      })();
    },
    stop() {
      generation++;
    },
  };
}

function once(start, stop = () => {}) {
  return { start, stop };
}

// Like once(), but start() may be a long async sequence that should halt as soon as stop() is called.
function sequence(body) {
  let generation = 0;
  return {
    start() {
      const mine = ++generation;
      body(() => generation === mine);
    },
    stop() {
      generation++;
    },
  };
}

const NEUTRAL_POSE = {
  head: { x: 0, y: 0, rotate: 0, sx: 1, sy: 1 },
  eyes: { look: [0, 0], open: 1, size: 1, roundness: 0 },
  particles: { amplitude: 10, speed: 1, spread: 1, emerge: 1, pulse: 0 },
  // Deliberately no wordmark entry: once the letters are gone they stay gone, and only an
  // intro puts them back. Everything else is reset so no state can strand the bot invisible.
  reveal: { particles: 1, head: 1 },
  absorb: 0,
  duration: 600,
  easing: 'inOutBack',
  particleEasing: 'inOutSine',
  particleDuration: 900,
};

export function pose(bot, overrides = {}) {
  const cfg = {
    ...NEUTRAL_POSE,
    ...overrides,
    head: { ...NEUTRAL_POSE.head, ...overrides.head },
    eyes: { ...NEUTRAL_POSE.eyes, ...overrides.eyes },
    particles: { ...NEUTRAL_POSE.particles, ...overrides.particles },
    reveal: { ...NEUTRAL_POSE.reveal, ...overrides.reveal },
  };
  return once(() => {
    const main = { duration: cfg.duration, easing: cfg.easing };
    bot.head.move(cfg.head.x, cfg.head.y, main);
    bot.head.rotate(cfg.head.rotate, main);
    bot.head.squash(cfg.head.sx, cfg.head.sy, { duration: cfg.duration, easing: 'outBack' });
    bot.head.nudge(0, 0, 0, { duration: cfg.duration, easing: 'inOutSine' });
    bot.eyes.look(cfg.eyes.look[0], cfg.eyes.look[1], { duration: cfg.duration * 0.5, easing: 'outCubic' });
    bot.eyes.open(cfg.eyes.open, { duration: cfg.duration * 0.7, easing: 'outCubic' });
    bot.eyes.size(cfg.eyes.size, { duration: cfg.duration, easing: 'outBack' });
    bot.eyes.shape(cfg.eyes.roundness, { duration: cfg.duration, easing: 'outBack' });
    bot.particles.animate(cfg.particles, { duration: cfg.particleDuration, easing: cfg.particleEasing });
    bot.particles.emerge(cfg.particles.emerge, { duration: cfg.particleDuration, easing: cfg.particleEasing });
    bot.particles.pulse(cfg.particles.pulse, { duration: cfg.duration });
    bot.reveal.particles(cfg.reveal.particles, { duration: cfg.duration });
    bot.reveal.head(cfg.reveal.head, { duration: cfg.duration });
    bot.wordmark.absorb(cfg.absorb, { duration: cfg.duration, easing: 'outCubic' });
  });
}

export function idle(bot, amount = 1, speed = 1) {
  return once(
    () => bot.head.sway(amount, speed, { duration: 900, easing: 'inOutSine' }),
    () => bot.head.sway(0, 1, { duration: 600, easing: 'inOutSine' })
  );
}

export function breathing(bot, amount = 1, speed = 1) {
  return once(
    () => bot.head.breathe(amount, speed, { duration: 1200, easing: 'inOutSine' }),
    () => bot.head.breathe(0, 1, { duration: 800, easing: 'inOutSine' })
  );
}

export function headTilt(bot, angle) {
  return once(
    () => bot.head.rotate(angle, { duration: 650, easing: 'inOutBack' }),
    () => bot.head.rotate(0, { duration: 500, easing: 'inOutBack' })
  );
}

export function blink(bot, { min = 1800, max = 5000, doubleChance = 0.2 } = {}) {
  return loop(async (step) => {
    await step(pause(bot, rand(min, max) / bot.tuning.blinkRate));
    await step(bot.eyes.blink());
    if (Math.random() < doubleChance) {
      await step(pause(bot, 80));
      await step(bot.eyes.blink());
    }
  });
}

// Eyes jump quickly to a new target (fast start, soft stop) and the head follows later and slower.
export function saccades(bot, { base = [0, 0], range = 0.45, holdMin = 500, holdMax = 1800, headFollow = 0.5 } = {}) {
  return loop(async (step) => {
    const reach = range * bot.tuning.eyeRange;
    const recenter = Math.random() < 0.3;
    const x = base[0] + (recenter ? 0 : rand(-reach, reach));
    const y = base[1] + (recenter ? 0 : rand(-reach, reach) * 0.6);
    bot.eyes.look(x, y, { duration: rand(90, 150), easing: 'outCubic' });
    const follow = headFollow * bot.tuning.headFollow;
    const offsetX = (x - base[0]) * follow;
    const offsetY = (y - base[1]) * follow;
    await step(pause(bot, 120));
    bot.head.nudge(offsetX * 30, offsetY * 16, offsetX * 7, { duration: rand(600, 900), easing: 'inOutSine' });
    await step(pause(bot, rand(holdMin, holdMax)));
  });
}

export function lookLeftRight(bot, { range = 0.9, holdMin = 900, holdMax = 1600 } = {}) {
  let direction = Math.random() < 0.5 ? -1 : 1;
  return loop(async (step) => {
    const reach = range * bot.tuning.eyeRange;
    const follow = bot.tuning.headFollow;
    bot.eyes.look(direction * reach, rand(-0.1, 0.1), { duration: 140, easing: 'outCubic' });
    await step(pause(bot, 110));
    bot.head.nudge(direction * 26 * follow, 0, direction * 6 * follow, { duration: 750, easing: 'inOutBack' });
    await step(pause(bot, rand(holdMin, holdMax)));
    direction = -direction;
  });
}

export function lookUpDown(bot, dir) {
  return once(
    () => bot.eyes.look(0, dir, { duration: 180, easing: 'outCubic' }),
    () => bot.eyes.look(0, 0, { duration: 180, easing: 'outCubic' })
  );
}

export function randomMicroMovements(bot, intensity = 1) {
  return loop(async (step) => {
    const k = intensity * bot.tuning.micro;
    bot.head.nudge(rand(-5, 5) * k, rand(-4, 4) * k, rand(-2, 2) * k, {
      duration: rand(500, 900),
      easing: 'inOutSine',
    });
    await step(pause(bot, rand(600, 1600)));
  });
}

// Anticipation squash -> stretch on take-off -> decelerate up -> accelerate down -> impact squash -> elastic settle.
export function bounce(bot, { height = 50 } = {}) {
  return loop(async (step) => {
    await step(bot.head.squash(1.12, 0.86, { duration: 120, easing: 'outQuad' }));
    bot.head.squash(0.93, 1.1, { duration: 160, easing: 'outQuad' });
    await step(bot.head.move(0, -height * bot.tuning.bounceHeight, { duration: 280, easing: 'outQuad' }));
    bot.head.squash(1, 1, { duration: 200, easing: 'inOutSine' });
    await step(bot.head.move(0, 0, { duration: 250, easing: 'inQuad' }));
    await step(bot.head.squash(1.15, 0.84, { duration: 70, easing: 'outQuad' }));
    await step(bot.head.squash(1, 1, { duration: 500, easing: 'outElastic' }));
    await step(pause(bot, rand(120, 350)));
  });
}

export function jolt(bot) {
  return sequence(async (alive) => {
    await bot.head.squash(0.86, 1.16, { duration: 90, easing: 'outQuad' });
    if (alive()) bot.head.squash(1, 1, { duration: 700, easing: 'outElastic' });
  });
}

export const SPIN_WINDUP = 280;
export const SPIN_SETTLE = 1000;

// Wind-up -> particles spin as a wave while the eyes roll along -> dizzy elastic wobble.
export function spin(bot) {
  return sequence(async (alive) => {
    const { spinTurns: turns, spinDuration: duration } = bot.tuning;

    bot.head.rotate(-12, { duration: SPIN_WINDUP, easing: 'inOutSine' });
    bot.eyes.look(-0.6, 0.2, { duration: SPIN_WINDUP, easing: 'outCubic' });
    await bot.head.squash(1.12, 0.88, { duration: SPIN_WINDUP, easing: 'outQuad' });
    if (!alive()) return;

    bot.head.squash(0.94, 1.07, { duration: 300, easing: 'outBack' });
    bot.head.rotate(16, { duration: duration * 0.6, easing: 'inOutBack' });
    const spinning = bot.particles.spin({ turns, duration });

    const steps = Math.max(12, turns * 14);
    for (let i = 1; i <= steps && alive(); i++) {
      const angle = (i / steps) * turns * Math.PI * 2 + Math.PI;
      await bot.eyes.look(Math.cos(angle) * 0.85, Math.sin(angle) * 0.85, {
        duration: duration / steps,
        easing: 'linear',
      });
    }
    await spinning;
    if (!alive()) return;

    bot.eyes.look(0, 0, { duration: 350, easing: 'outBack' });
    bot.head.squash(1, 1, { duration: 700, easing: 'outElastic' });
    await bot.head.rotate(0, { duration: SPIN_SETTLE, easing: 'outElastic' });
  });
}

// --- Intros -----------------------------------------------------------------------
// Both are one-shot choreographies: they set the scene themselves (so the buttons replay
// them from any state), play, and leave the bot ready for IDLE to take over.

export const BIG_BANG_COLLAPSE = 420;
export const BIG_BANG_ANTICIPATION = 170;
export const BIG_BANG_BURST = 1400;
export const BIG_BANG_TOTAL = 3700;

export const ABSORB_SLIDE = 780;
export const ABSORB_BURST = 1250;
export const ABSORB_TOTAL = 2900;

// Eyelids opening for the first time: a hesitant peek, a flinch shut, then full open with
// a round pulse of enthusiasm and a left-right sweep to focus on the screen.
async function awaken(bot, alive) {
  bot.reveal.head(1, { duration: 320, easing: 'outCubic' });
  await pause(bot, 240);
  if (!alive()) return;
  await bot.eyes.open(0.3, { duration: 190, easing: 'outCubic' });
  if (!alive()) return;
  await bot.eyes.open(0.08, { duration: 110, easing: 'inQuad' });
  if (!alive()) return;

  bot.eyes.shape(0.45, { duration: 260, easing: 'outBack' });
  await bot.eyes.open(1, { duration: 280, easing: 'outBack' });
  if (!alive()) return;
  bot.eyes.shape(0, { duration: 520, easing: 'outElastic' });

  await bot.eyes.look(-0.9, 0, { duration: 200, easing: 'outCubic' });
  if (!alive()) return;
  await bot.eyes.look(0.9, 0, { duration: 250, easing: 'inOutCubic' });
  if (!alive()) return;
  await bot.eyes.look(0, 0, { duration: 230, easing: 'outBack' });
}

// Scenario 1, phase 1: one particle alone in the middle, breathing, waiting to be clicked.
export function seed(bot) {
  return once(() => {
    bot.particles.origin(bot.geometry.scene);
    bot.reveal.wordmark(0, { duration: 320, easing: 'inOutSine' });
    bot.reveal.head(0, { duration: 260, easing: 'inOutSine' });
    bot.reveal.particles(1, { duration: 200 });
    bot.wordmark.absorb(0, { duration: 0 });
    bot.eyes.open(0.06, { duration: 0 });
    bot.eyes.shape(0, { duration: 0 });
    bot.eyes.look(0, 0, { duration: 0 });
    bot.particles.emerge(0, { duration: 520, easing: 'inOutCubic' });
    bot.particles.animate({ amplitude: 26, speed: 0.7 }, { duration: 700, easing: 'inOutSine' });
    bot.particles.pulse(1, { duration: 700, easing: 'inOutSine' });
  });
}

// Scenario 1, phases 2 and 3: the seed contracts, lets go, and the robot wakes up inside
// the field it just threw out.
export function bigBang(bot) {
  return sequence(async (alive) => {
    bot.particles.origin(bot.geometry.scene);
    bot.reveal.wordmark(0, { duration: 200, easing: 'inOutSine' });
    bot.reveal.particles(1, { duration: 120 });
    bot.reveal.head(0, { duration: 160, easing: 'inOutSine' });
    bot.eyes.open(0.06, { duration: 0 });
    bot.eyes.shape(0, { duration: 0 });
    bot.eyes.look(0, 0, { duration: 0 });
    await bot.particles.emerge(0, { duration: BIG_BANG_COLLAPSE, easing: 'inCubic' });
    if (!alive()) return;

    // Anticipation on the seed's own scale spring: a ~20% squeeze before it releases.
    bot.particles.pulse(0, { duration: 120 });
    bot.particles.impulse(0, 0, 0, -2.5);
    await pause(bot, BIG_BANG_ANTICIPATION);
    if (!alive()) return;

    bot.particles.animate({ amplitude: 10, speed: 1 }, { duration: BIG_BANG_BURST, easing: 'outCubic' });
    await bot.particles.emerge(1, { duration: BIG_BANG_BURST, easing: 'outCubic' });
    if (!alive()) return;

    await awaken(bot, alive);
  });
}

// Scenario 2, phase 1: the wordmark alone, static. No blink, no gaze — it is still a logo.
export function logoRest(bot) {
  return once(() => {
    const [near, far] = bot.geometry.eyes;
    bot.particles.origin(near, far);
    bot.particles.emerge(0, { duration: 0 });
    bot.particles.pulse(0, { duration: 0 });
    bot.reveal.particles(0, { duration: 320, easing: 'inOutSine' });
    bot.reveal.wordmark(1, { duration: 360, easing: 'inOutSine' });
    bot.reveal.head(1, { duration: 360, easing: 'inOutSine' });
    bot.wordmark.absorb(0, { duration: 420, easing: 'outCubic' });
    bot.eyes.open(1, { duration: 300, easing: 'outCubic' });
    bot.eyes.shape(0, { duration: 300, easing: 'outCubic' });
    bot.eyes.size(1, { duration: 300, easing: 'outCubic' });
    bot.eyes.look(0, 0, { duration: 300, easing: 'outCubic' });
  });
}

// Scenario 2, phases 2 to 4: the V and the U are swallowed by the near O, the impact
// sprays the particles out of both counters, and the character lands.
export function absorbWordmark(bot) {
  return sequence(async (alive) => {
    const [near, far] = bot.geometry.eyes;
    bot.particles.origin(near, far);
    bot.wordmark.target(near.x, near.y);
    bot.particles.emerge(0, { duration: 0 });
    bot.particles.pulse(0, { duration: 0 });
    bot.reveal.particles(0, { duration: 0 });
    bot.reveal.head(1, { duration: 0 });
    bot.reveal.wordmark(1, { duration: 0 });
    bot.eyes.open(1, { duration: 0 });
    bot.eyes.shape(0, { duration: 0 });
    bot.eyes.size(1, { duration: 0 });
    bot.eyes.look(0, 0, { duration: 0 });
    await bot.wordmark.absorb(0, { duration: 0 });
    if (!alive()) return;
    await pause(bot, 220);
    if (!alive()) return;

    // inBack recoils to the left before the dive, which reads as magnetic suction.
    await bot.wordmark.absorb(1, { duration: ABSORB_SLIDE, easing: 'inBack' });
    if (!alive()) return;
    // They are inside the O now; hiding them keeps them gone when a pose resets absorb.
    bot.reveal.wordmark(0, { duration: 0 });

    bot.reveal.particles(1, { duration: 0 });
    bot.particles.animate({ amplitude: 10, speed: 1.6 }, { duration: ABSORB_BURST, easing: 'outCubic' });
    bot.particles.emerge(1, { duration: ABSORB_BURST, easing: 'outCubic' });

    // The eyes take the recoil of what they just spat out.
    bot.eyes.size(1.15, { duration: 150, easing: 'outQuad' });
    bot.eyes.shape(0.6, { duration: 150, easing: 'outQuad' });
    await pause(bot, 180);
    if (!alive()) return;
    bot.eyes.size(1, { duration: 900, easing: 'outElastic' });
    await bot.eyes.shape(0, { duration: 900, easing: 'outElastic' });
    if (!alive()) return;

    await bot.eyes.blink();
    if (!alive()) return;
    await pause(bot, 90);
    if (!alive()) return;
    await bot.eyes.blink();
  });
}
