import { STATES } from './state-machine.js';
import { SPIN_WINDUP, SPIN_SETTLE } from './behaviours.js';

// revertAfter is in animation time (ms at timeScale 1); a function reads the current tuning.
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
  }

  return { emit };
}
