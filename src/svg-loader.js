export async function loadBotSvg(container, url) {
  const response = await fetch(url);
  const markup = await response.text();
  container.innerHTML = markup;

  const svg = container.querySelector('svg');
  const $ = (id) => svg.getElementById(id);

  return {
    svg,
    particles: Array.from(svg.querySelectorAll('#particles > circle')),
    head: $('head'),
    wordmark: $('wordmark'),
    letters: [$('letter-v'), $('letter-u')],
    // `white` is the letter's ring and `pupil` its counter; `backdrop` stands in for the
    // page behind the head in the sliver a gaze opens. `highlight` is optional.
    leftEye: {
      group: $('left-eye'),
      white: $('left-eye-01'),
      pupil: $('left-eye-02'),
      backdrop: $('left-eye-backdrop'),
      highlight: $('left-eye-03'),
    },
    rightEye: {
      group: $('right-eye'),
      white: $('right-eye-01'),
      pupil: $('right-eye-02'),
      backdrop: $('right-eye-backdrop'),
      highlight: $('right-eye-03'),
    },
  };
}
