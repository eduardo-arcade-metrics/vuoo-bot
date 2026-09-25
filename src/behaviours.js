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
  eyes: { look: [0, 0], open: 1, size: 1 },
  particles: { amplitude: 10, speed: 1, spread: 1 },
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
    bot.particles.animate(cfg.particles, { duration: cfg.particleDuration, easing: cfg.particleEasing });
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
