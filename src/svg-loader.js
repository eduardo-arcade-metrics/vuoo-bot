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
    leftEye: {
      group: $('left-eye'),
      white: $('left-eye-01'),
      pupil: $('left-eye-02'),
      highlight: $('left-eye-03'),
    },
    rightEye: {
      group: $('right-eye'),
      white: $('right-eye-01'),
      pupil: $('right-eye-02'),
      highlight: $('right-eye-03'),
    },
  };
}
