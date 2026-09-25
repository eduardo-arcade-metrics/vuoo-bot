export const DEFAULT_TUNING = {
  timeScale: 1,
  overshoot: 1,
  squash: 1,
  sway: 1,
  breath: 1,
  headFollow: 1,
  bounceHeight: 1,
  micro: 1,
  eyeRange: 1,
  blinkRate: 1,
  particleAmplitude: 1,
  particleSpeed: 1,
  orbitSpeed: 0,
  spinTurns: 2,
  spinDuration: 1800,
};

const SPIN_STAGGER = 0.35;

const baseEasings = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutBack: (t) => {
    const c2 = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

// Overshooting curves are blended with a smooth counterpart, so tuning.overshoot
// scales how far they pass the target (0 = none) without moving their start/end.
const overshootCounterparts = { outBack: 'outCubic', inOutBack: 'inOutCubic', outElastic: 'outCubic' };
const shared = { overshoot: 1 };

export const easings = Object.fromEntries(
  Object.entries(baseEasings).map(([name, fn]) => {
    const smooth = baseEasings[overshootCounterparts[name]];
    if (!smooth) return [name, fn];
    return [name, (t) => smooth(t) + (fn(t) - smooth(t)) * shared.overshoot];
  })
);

const resolveEasing = (easing) =>
  typeof easing === 'function' ? easing : easings[easing] || easings.inOutCubic;

function createTweens() {
  const active = new Map();

  // A new tween on a busy channel starts from the current value, so interruptions stay smooth.
  function to(channel, obj, key, target, { duration = 300, easing = 'inOutCubic' } = {}) {
    const previous = active.get(channel);
    if (previous) previous.resolve();
    return new Promise((resolve) => {
      active.set(channel, {
        obj,
        key,
        from: obj[key],
        to: target,
        duration,
        elapsed: 0,
        easing: resolveEasing(easing),
        resolve,
      });
    });
  }

  function tick(dt) {
    for (const [channel, tween] of active) {
      tween.elapsed += dt;
      const t = tween.duration <= 0 ? 1 : Math.min(1, tween.elapsed / tween.duration);
      tween.obj[tween.key] = tween.from + (tween.to - tween.from) * tween.easing(t);
      if (t >= 1) {
        active.delete(channel);
        tween.resolve();
      }
    }
  }

  return { to, tick };
}

function setupEye(eyeRef) {
  const white = eyeRef.white.getBBox();
  const pupil = eyeRef.pupil.getBBox();
  const group = eyeRef.group.getBBox();
  const margin = 6;
  return {
    ref: eyeRef,
    cx: group.x + group.width / 2,
    cy: group.y + group.height / 2,
    minX: white.x + margin - pupil.x,
    maxX: white.x + white.width - margin - (pupil.x + pupil.width),
    minY: white.y + margin - pupil.y,
    maxY: white.y + white.height - margin - (pupil.y + pupil.height),
  };
}

export function createBot(refs) {
  const tweens = createTweens();

  const headBox = refs.head.getBBox();
  const headPivot = {
    cx: headBox.x + headBox.width / 2,
    cy: headBox.y + headBox.height / 2,
    bottom: headBox.y + headBox.height,
  };
  const eyeSetups = [setupEye(refs.leftEye), setupEye(refs.rightEye)];

  const viewBox = refs.svg.viewBox.baseVal;
  const sceneCenter = { x: viewBox.x + viewBox.width / 2, y: viewBox.y + viewBox.height / 2 };
  const outerRadius = Math.min(...refs.particles.map((el) => parseFloat(el.getAttribute('r'))));
  const particleSetups = refs.particles.map((el, i) => {
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    const polar = Math.atan2(cy - sceneCenter.y, cx - sceneCenter.x);
    return {
      el,
      cx,
      cy,
      fx: 0.0007 + ((i * 37) % 11) * 0.00011,
      fy: 0.0006 + ((i * 53) % 13) * 0.0001,
      px: i * 1.7,
      py: i * 2.3,
      // Spin starts as a wave travelling around the circle; rings turn in opposite directions.
      delay: ((polar + Math.PI) / (2 * Math.PI)) * SPIN_STAGGER,
      direction: parseFloat(el.getAttribute('r')) <= outerRadius ? 1 : -1,
    };
  });

  const head = {
    x: 0, y: 0, rotate: 0, sx: 1, sy: 1,
    ox: 0, oy: 0, orotate: 0,
    swayAmount: 0, swaySpeed: 1,
    breathAmount: 0, breathSpeed: 1,
  };
  const eyes = { lookX: 0, lookY: 0, openness: 1, size: 1, blink: 1 };
  const particles = { amplitude: 0, speed: 1, spread: 1, spinProgress: 0, spinTurns: 0 };
  const clocks = { sway: 0, breath: 0, particles: 0, orbit: 0 };
  const tuning = { ...DEFAULT_TUNING };
  let activeSpin = null;

  const tween = (channel, obj, key, target, opts) => tweens.to(channel, obj, key, target, opts);

  function renderHead() {
    const t = clocks.sway;
    const a = head.swayAmount * tuning.sway;
    const swayRotate = a * (2.4 * Math.sin(t * 0.0011) + 0.9 * Math.sin(t * 0.0029 + 1.3));
    const swayX = a * 7 * Math.sin(t * 0.0008 + 0.5);
    const swayY = a * 5 * Math.sin(t * 0.0013 + 2.1);
    const breath = head.breathAmount * tuning.breath * Math.sin(clocks.breath * 0.0021);

    const tx = head.x + head.ox + swayX;
    const ty = head.y + head.oy + swayY - breath * 6;
    const rotate = head.rotate + head.orotate + swayRotate;
    const sx = (1 + (head.sx - 1) * tuning.squash) * (1 - breath * 0.012);
    const sy = (1 + (head.sy - 1) * tuning.squash) * (1 + breath * 0.025);
    const { cx, cy, bottom } = headPivot;

    refs.head.setAttribute(
      'transform',
      `translate(${tx} ${ty}) rotate(${rotate} ${cx} ${cy}) ` +
        `translate(${cx} ${bottom}) scale(${sx} ${sy}) translate(${-cx} ${-bottom})`
    );
  }

  function renderEyes() {
    let { lookX, lookY } = eyes;
    const magnitude = Math.hypot(lookX, lookY);
    if (magnitude > 1) {
      lookX /= magnitude;
      lookY /= magnitude;
    }
    const sx = eyes.size * (1 + (1 - eyes.blink) * 0.08);
    const sy = eyes.size * eyes.openness * eyes.blink;

    for (const eye of eyeSetups) {
      const dx = lookX < 0 ? -lookX * eye.minX : lookX * eye.maxX;
      const dy = lookY < 0 ? -lookY * eye.minY : lookY * eye.maxY;
      const pupilTransform = `translate(${dx} ${dy})`;
      eye.ref.pupil.setAttribute('transform', pupilTransform);
      eye.ref.highlight.setAttribute('transform', pupilTransform);
      eye.ref.group.setAttribute(
        'transform',
        `translate(${eye.cx} ${eye.cy}) scale(${sx} ${sy}) translate(${-eye.cx} ${-eye.cy})`
      );
    }
  }

  function renderParticles() {
    const t = clocks.particles;
    const amplitude = particles.amplitude * tuning.particleAmplitude;
    const { x: centerX, y: centerY } = sceneCenter;
    for (const p of particleSetups) {
      const local = Math.min(1, Math.max(0, particles.spinProgress * (1 + SPIN_STAGGER) - p.delay));
      const wave = Math.sin(Math.PI * local);
      const spinAngle = particles.spinTurns * 360 * easings.inOutBack(local);
      const angle = ((clocks.orbit + spinAngle) * p.direction * Math.PI) / 180;
      const spread = particles.spread + 0.18 * wave;
      const ox = (p.cx - centerX) * spread;
      const oy = (p.cy - centerY) * spread;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const x = centerX + ox * cos - oy * sin + amplitude * Math.sin(t * p.fx + p.px);
      const y = centerY + ox * sin + oy * cos + amplitude * Math.cos(t * p.fy + p.py);
      const scale = 1 + 0.35 * wave;
      p.el.setAttribute('transform', `translate(${x} ${y}) scale(${scale}) translate(${-p.cx} ${-p.cy})`);
    }
  }

  const bot = {
    easings,
    head: {
      rotate: (deg, opts) => tween('head.rotate', head, 'rotate', deg, opts),
      move: (x, y, opts) =>
        Promise.all([tween('head.x', head, 'x', x, opts), tween('head.y', head, 'y', y, opts)]),
      squash: (sx, sy, opts) =>
        Promise.all([tween('head.sx', head, 'sx', sx, opts), tween('head.sy', head, 'sy', sy, opts)]),
      nudge: (x, y, rotate, opts) =>
        Promise.all([
          tween('head.ox', head, 'ox', x, opts),
          tween('head.oy', head, 'oy', y, opts),
          tween('head.orotate', head, 'orotate', rotate, opts),
        ]),
      sway: (amount, speed = 1, opts) =>
        Promise.all([
          tween('head.swayAmount', head, 'swayAmount', amount, opts),
          tween('head.swaySpeed', head, 'swaySpeed', speed, opts),
        ]),
      breathe: (amount, speed = 1, opts) =>
        Promise.all([
          tween('head.breathAmount', head, 'breathAmount', amount, opts),
          tween('head.breathSpeed', head, 'breathSpeed', speed, opts),
        ]),
    },
    eyes: {
      look: (x, y, opts) =>
        Promise.all([
          tween('eyes.lookX', eyes, 'lookX', Math.max(-1, Math.min(1, x)), opts),
          tween('eyes.lookY', eyes, 'lookY', Math.max(-1, Math.min(1, y)), opts),
        ]),
      async blink({ close = 70, open = 160 } = {}) {
        await tween('eyes.blink', eyes, 'blink', 0.05, { duration: close, easing: 'inQuad' });
        await tween('eyes.blink', eyes, 'blink', 1, { duration: open, easing: 'outQuad' });
      },
      open: (value, opts) => tween('eyes.openness', eyes, 'openness', value, opts),
      size: (value, opts) => tween('eyes.size', eyes, 'size', value, opts),
    },
    particles: {
      animate: ({ amplitude = 10, speed = 1, spread = 1 } = {}, opts) =>
        Promise.all([
          tween('particles.amplitude', particles, 'amplitude', amplitude, opts),
          tween('particles.speed', particles, 'speed', speed, opts),
          tween('particles.spread', particles, 'spread', spread, opts),
        ]),
      stop: (opts) => tween('particles.amplitude', particles, 'amplitude', 0, opts),
      // Whole turns only, so resetting progress to 0 afterwards lands on the same positions.
      // A spin already in flight is reused rather than restarted, which would snap the particles.
      spin({ turns = tuning.spinTurns, duration = tuning.spinDuration } = {}) {
        if (activeSpin) return activeSpin;
        particles.spinTurns = Math.max(1, Math.round(turns));
        particles.spinProgress = 0;
        activeSpin = tween('particles.spinProgress', particles, 'spinProgress', 1, {
          duration,
          easing: 'linear',
        }).then(() => {
          particles.spinProgress = 0;
          activeSpin = null;
        });
        return activeSpin;
      },
    },
    tuning,
    update(realDt) {
      shared.overshoot = tuning.overshoot;
      const dt = realDt * tuning.timeScale;
      tweens.tick(dt);
      clocks.sway += dt * head.swaySpeed;
      clocks.breath += dt * head.breathSpeed;
      clocks.particles += dt * particles.speed * tuning.particleSpeed;
      clocks.orbit += (dt / 1000) * tuning.orbitSpeed;
      renderHead();
      renderEyes();
      renderParticles();
    },
  };

  let rafId = null;
  let lastTime = null;

  function frame(now) {
    if (lastTime === null) lastTime = now;
    // Clamp so a backgrounded tab doesn't make every tween jump to its end.
    const dt = Math.min(64, now - lastTime);
    lastTime = now;
    bot.update(dt);
    rafId = requestAnimationFrame(frame);
  }

  bot.startLoop = () => {
    if (rafId === null) rafId = requestAnimationFrame(frame);
  };

  bot.stopLoop = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
      lastTime = null;
    }
  };

  return bot;
}
