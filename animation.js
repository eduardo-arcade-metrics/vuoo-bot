import { loadBotSvg } from './src/svg-loader.js';
import { createBot, DEFAULT_TUNING } from './src/animation-engine.js';
import { createStateMachine, STATES } from './src/state-machine.js';
import { createEventSystem } from './src/events.js';

const TUNING_STORAGE_KEY = 'vuooBot.tuning';

const TUNING_CONTROLS = [
  {
    group: 'Geral',
    controls: [
      { key: 'timeScale', label: 'Velocidade geral', min: 0.25, max: 2, step: 0.05 },
      { key: 'overshoot', label: 'Exagero (overshoot/elástico)', min: 0, max: 2.5, step: 0.05 },
      { key: 'squash', label: 'Squash & stretch', min: 0, max: 2.5, step: 0.05 },
    ],
  },
  {
    group: 'Cabeça',
    controls: [
      { key: 'sway', label: 'Balanço', min: 0, max: 3, step: 0.05 },
      { key: 'breath', label: 'Respiração', min: 0, max: 3, step: 0.05 },
      { key: 'headFollow', label: 'Segue o olhar', min: 0, max: 2.5, step: 0.05 },
      { key: 'micro', label: 'Micro-movimentos', min: 0, max: 3, step: 0.05 },
      { key: 'bounceHeight', label: 'Altura do pulo', min: 0, max: 2.5, step: 0.05 },
    ],
  },
  {
    group: 'Olhos',
    controls: [
      { key: 'eyeRange', label: 'Alcance do olhar', min: 0, max: 2, step: 0.05 },
      { key: 'blinkRate', label: 'Frequência de piscada', min: 0.2, max: 3, step: 0.05 },
    ],
  },
  {
    group: 'Partículas',
    controls: [
      { key: 'particleAmplitude', label: 'Flutuação', min: 0, max: 4, step: 0.05 },
      { key: 'particleSpeed', label: 'Velocidade', min: 0, max: 4, step: 0.05 },
      { key: 'orbitSpeed', label: 'Órbita contínua (°/s)', min: -90, max: 90, step: 1 },
      { key: 'spinTurns', label: 'Voltas do spin', min: 1, max: 5, step: 1 },
      { key: 'spinDuration', label: 'Duração do spin (ms)', min: 600, max: 4000, step: 50 },
    ],
  },
];

function loadSavedTuning() {
  try {
    return JSON.parse(localStorage.getItem(TUNING_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveTuning(tuning) {
  try {
    localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(tuning));
  } catch {
    // Storage unavailable (private mode etc.): tuning just won't persist.
  }
}

function formatValue(value, step) {
  return Number.isInteger(step) ? String(value) : value.toFixed(2);
}

function buildTuningPanel(root, tuning) {
  const inputs = new Map();

  for (const { group, controls } of TUNING_CONTROLS) {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = group;
    fieldset.append(legend);

    for (const { key, label, min, max, step } of controls) {
      const row = document.createElement('label');
      row.className = 'slider';

      const name = document.createElement('span');
      name.className = 'slider-label';
      name.textContent = label;

      const output = document.createElement('output');

      const input = document.createElement('input');
      input.type = 'range';
      Object.assign(input, { min, max, step });
      input.value = tuning[key];
      output.textContent = formatValue(tuning[key], step);

      input.addEventListener('input', () => {
        tuning[key] = parseFloat(input.value);
        output.textContent = formatValue(tuning[key], step);
        saveTuning(tuning);
      });

      row.append(name, output, input);
      fieldset.append(row);
      inputs.set(key, { input, output, step });
    }
    root.append(fieldset);
  }

  return function sync() {
    for (const [key, { input, output, step }] of inputs) {
      input.value = tuning[key];
      output.textContent = formatValue(tuning[key], step);
    }
  };
}

async function main() {
  const container = document.getElementById('vuooBot');
  const refs = await loadBotSvg(container, './assets/vuooBotG.svg');

  const bot = createBot(refs);
  const saved = loadSavedTuning();
  for (const key of Object.keys(DEFAULT_TUNING)) {
    if (typeof saved[key] === 'number') bot.tuning[key] = saved[key];
  }
  bot.startLoop();

  const stateMachine = createStateMachine(bot);
  const events = createEventSystem(stateMachine, bot);
  bot.emit = events.emit;
  bot.setState = stateMachine.setState;
  bot.getState = stateMachine.getState;

  window.bot = bot;

  stateMachine.setState(STATES.IDLE);

  document.querySelectorAll('[data-state]').forEach((button) => {
    button.addEventListener('click', () => stateMachine.setState(button.dataset.state));
  });

  document.querySelectorAll('[data-event]').forEach((button) => {
    button.addEventListener('click', () => events.emit(button.dataset.event));
  });

  const syncPanel = buildTuningPanel(document.getElementById('tuning'), bot.tuning);

  document.getElementById('tuning-reset').addEventListener('click', () => {
    Object.assign(bot.tuning, DEFAULT_TUNING);
    saveTuning(bot.tuning);
    syncPanel();
  });

  const copyButton = document.getElementById('tuning-copy');
  copyButton.addEventListener('click', async () => {
    const text = JSON.stringify(bot.tuning, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copyButton.textContent = 'Copiado!';
    } catch {
      console.log(text);
      copyButton.textContent = 'Veja o console';
    }
    setTimeout(() => (copyButton.textContent = 'Copiar valores'), 1500);
  });
}

main();
