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
  mouseFollow: 1,
  clickStrength: 1,
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

// Damped spring: impulses add velocity, `target` pulls it towards a resting value.
function createSpring(stiffness, damping) {
  return { x: 0, v: 0, target: 0, stiffness, damping };
}

function stepSpring(spring, seconds, dampingScale) {
  const acceleration =
    spring.stiffness * (spring.target - spring.x) - spring.damping * dampingScale * spring.v;
  spring.v += acceleration * seconds;
  spring.x += spring.v * seconds;
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
    width: headBox.width,
    height: headBox.height,
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
      r: parseFloat(el.getAttribute('r')),
      x: cx,
      y: cy,
      scale: 1,
      springX: createSpring(140, 8),
      springY: createSpring(140, 8),
      springScale: createSpring(140, 8),
    };
  });
  const particleSprings = particleSetups.flatMap((p) => [p.springX, p.springY, p.springScale]);

  const head = {
    x: 0, y: 0, rotate: 0, sx: 1, sy: 1,
    ox: 0, oy: 0, orotate: 0,
    swayAmount: 0, swaySpeed: 1,
    breathAmount: 0, breathSpeed: 1,
  };
  const eyes = { lookX: 0, lookY: 0, openness: 1, size: 1, blink: 1, squint: 1 };
  // External gaze target (mouse/touch). `weight` blends it over the autonomous look.
  const follow = { targetX: 0, targetY: 0, proximity: 0, weight: 0, eyeX: 0, eyeY: 0, near: 0 };
  const headFollow = { x: createSpring(90, 13), y: createSpring(90, 13), rotate: createSpring(90, 13) };
  const poke = {
    x: createSpring(160, 9),
    y: createSpring(160, 9),
    rotate: createSpring(160, 9),
    squash: createSpring(160, 9),
  };
  const headSprings = [...Object.values(headFollow), ...Object.values(poke)];
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

    const tx = head.x + head.ox + swayX + headFollow.x.x + poke.x.x;
    const ty = head.y + head.oy + swayY - breath * 6 + headFollow.y.x + poke.y.x;
    const rotate = head.rotate + head.orotate + swayRotate + headFollow.rotate.x + poke.rotate.x;
    const pokeSquash = poke.squash.x * tuning.squash;
    const sx = (1 + (head.sx - 1) * tuning.squash) * (1 - breath * 0.012) * (1 + pokeSquash);
    const sy = (1 + (head.sy - 1) * tuning.squash) * (1 + breath * 0.025) * (1 - pokeSquash);
    const { cx, cy, bottom } = headPivot;

    refs.head.setAttribute(
      'transform',
      `translate(${tx} ${ty}) rotate(${rotate} ${cx} ${cy}) ` +
        `translate(${cx} ${bottom}) scale(${sx} ${sy}) translate(${-cx} ${-bottom})`
    );
  }

  function renderEyes() {
    const w = Math.min(1, follow.weight * tuning.mouseFollow);
    let lookX = eyes.lookX + (follow.eyeX - eyes.lookX) * w;
    let lookY = eyes.lookY + (follow.eyeY - eyes.lookY) * w;
    const magnitude = Math.hypot(lookX, lookY);
    if (magnitude > 1) {
      lookX /= magnitude;
      lookY /= magnitude;
    }
    const curiosity = 1 + 0.12 * follow.near * w;
    const sx = eyes.size * curiosity * (1 + (1 - eyes.blink) * 0.08);
    const sy = eyes.size * curiosity * eyes.openness * eyes.blink * eyes.squint;

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
      const x = centerX + ox * cos - oy * sin + amplitude * Math.sin(t * p.fx + p.px) + p.springX.x;
      const y = centerY + ox * sin + oy * cos + amplitude * Math.cos(t * p.fy + p.py) + p.springY.x;
      const scale = Math.max(0.2, (1 + 0.35 * wave) * (1 + p.springScale.x));
      p.x = x;
      p.y = y;
      p.scale = scale;
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
      // Velocity kick (units/s, deg/s, squash/s) on springs that always settle back to rest.
      impulse(vx, vy, vRotate = 0, vSquash = 0) {
        const k = tuning.clickStrength;
        poke.x.v += vx * k;
        poke.y.v += vy * k;
        poke.rotate.v += vRotate * k;
        poke.squash.v += vSquash * k;
      },
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
      // Separate from openness so it works on top of any state's resting eye shape.
      async squint(amount = 0.3) {
        await tween('eyes.squint', eyes, 'squint', amount, { duration: 60, easing: 'outQuad' });
        await tween('eyes.squint', eyes, 'squint', 1, { duration: 380, easing: 'outBack' });
      },
    },
    follow: {
      // x, y in [-1, 1] relative to the head; proximity in [0, 1] widens the eyes.
      setTarget(x, y, proximity = 0) {
        const magnitude = Math.hypot(x, y);
        const scale = magnitude > 1 ? 1 / magnitude : 1;
        follow.targetX = x * scale;
        follow.targetY = y * scale;
        follow.proximity = Math.max(0, Math.min(1, proximity));
      },
      engage: (on, opts = { duration: on ? 250 : 700, easing: 'inOutSine' }) =>
        tween('follow.weight', follow, 'weight', on ? 1 : 0, opts),
    },
    geometry: { head: headPivot, scene: sceneCenter },
    toScenePoint(clientX, clientY) {
      return new DOMPoint(clientX, clientY).matrixTransform(refs.svg.getScreenCTM().inverse());
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
      indexOf: (element) => refs.particles.indexOf(element),
      positions: () => particleSetups.map(({ x, y, r, scale }) => ({ x, y, r: r * scale })),
      impulse(index, vx, vy, vScale = 0) {
        const p = particleSetups[index];
        const k = tuning.clickStrength;
        p.springX.v += vx * k;
        p.springY.v += vy * k;
        p.springScale.v += vScale * k;
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

      const seconds = dt / 1000;
      const eyeBlend = 1 - Math.exp(-seconds * 24);
      follow.eyeX += (follow.targetX - follow.eyeX) * eyeBlend;
      follow.eyeY += (follow.targetY - follow.eyeY) * eyeBlend;
      follow.near += (follow.proximity - follow.near) * (1 - Math.exp(-seconds * 6));
      // Eyes react almost instantly; the head trails behind on a spring.
      const headAmount = follow.weight * tuning.mouseFollow * tuning.headFollow;
      headFollow.x.target = follow.targetX * 24 * headAmount;
      headFollow.y.target = follow.targetY * 14 * headAmount;
      headFollow.rotate.target = follow.targetX * 6 * headAmount;

      // More overshoot tuning => less damping => bouncier springs.
      const dampingScale = 2 / (1 + tuning.overshoot);
      // Sub-steps keep the springs stable when frames are long (high time scale, dropped frames).
      const substeps = Math.max(1, Math.ceil(seconds / 0.016));
      const h = seconds / substeps;
      for (let i = 0; i < substeps; i++) {
        for (const spring of headSprings) stepSpring(spring, h, dampingScale);
        for (const spring of particleSprings) stepSpring(spring, h, dampingScale);
      }

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
