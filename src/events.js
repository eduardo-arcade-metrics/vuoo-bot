import { STATES } from './state-machine.js';
import { SPIN_WINDUP, SPIN_SETTLE, BIG_BANG_TOTAL, ABSORB_TOTAL } from './behaviours.js';

// How long an intro waits to be clicked before it carries on by itself. Nobody should be
// left staring at a dot because they did not know it was a button.
const AUTO_ADVANCE = 4200;

// revertAfter is in animation time (ms at timeScale 1); a function reads the current tuning.
// `then` chains to another event instead of going back to idle, and a click that emits that
// event sooner cancels the pending one through the generation guard.
const EVENT_MAP = {
  attention: { state: STATES.ATTENTION },
  thinking: { state: STATES.THINKING },
  happy: { state: STATES.HAPPY, revertAfter: 2800 },
  surprised: { state: STATES.SURPRISED, revertAfter: 1800 },
  spin: {
    state: STATES.SPINNING,
    // Restarting mid-spin would snap the particles back to their start angle.
    ignoreWhileActive: true,
    revertAfter: (tuning) => SPIN_WINDUP + tuning.spinDuration + SPIN_SETTLE * 0.6,
  },
  seed: { state: STATES.SEED, then: { event: 'bigBang', after: AUTO_ADVANCE } },
  bigBang: { state: STATES.BIG_BANG, ignoreWhileActive: true, revertAfter: BIG_BANG_TOTAL },
  logo: { state: STATES.WORDMARK, then: { event: 'absorb', after: AUTO_ADVANCE } },
  absorb: { state: STATES.ABSORB, ignoreWhileActive: true, revertAfter: ABSORB_TOTAL },
};

export function createEventSystem(stateMachine, bot) {
  let generation = 0;

  function emit(name) {
    const event = EVENT_MAP[name];
    if (!event) {
      throw new Error(`Unknown event: ${name}`);
    }
    if (event.ignoreWhileActive && stateMachine.getState() === event.state) return;

    generation += 1;
    const thisGeneration = generation;
    // Re-emitting the current state (e.g. spin twice) should replay it.
    if (stateMachine.getState() === event.state) stateMachine.setState(STATES.IDLE);
    stateMachine.setState(event.state);

    if (event.revertAfter) {
      const delay =
        typeof event.revertAfter === 'function' ? event.revertAfter(bot.tuning) : event.revertAfter;
      setTimeout(() => {
        if (generation === thisGeneration) {
          stateMachine.setState(STATES.IDLE);
        }
      }, delay / bot.tuning.timeScale);
    }

    if (event.then) {
      setTimeout(() => {
        if (generation === thisGeneration) emit(event.then.event);
      }, event.then.after / bot.tuning.timeScale);
    }
  }

  return { emit };
}
