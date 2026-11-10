(() => {
  const section = document.querySelector('#promociones');
  const panels = [...section.querySelectorAll('[data-campaign]')];
  if (panels.length < 2) return;

  const controls = section.querySelector('.promotion-controls');
  const choices = controls.querySelector('.promotion-choices');
  const counter = controls.querySelector('.promotion-counter');
  const progress = controls.querySelector('.promotion-progress');
  const announcement = section.querySelector('.promotion-announcement');
  const names = panels.map(panel => panel.querySelector('.promotion-name').textContent);
  const digits = value => String(value).padStart(2, '0');
  let current = 0;
  let swipe = null;

  const buttons = names.map((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = digits(index + 1);
    button.setAttribute('aria-label', `Mostrar ${name}`);
    button.addEventListener('click', () => select(index));
    choices.append(button);
    return button;
  });

  function updateControls() {
    buttons.forEach((button, index) => {
      if (index === current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    counter.textContent = `${digits(current + 1)} / ${digits(panels.length)}`;
    progress.style.setProperty('--campaign-progress', (current + 1) / panels.length);
  }

  function select(index) {
    const next = (index + panels.length) % panels.length;
    if (next === current) return;
    const previousPanel = panels[current];
    const moveFocus = previousPanel.contains(document.activeElement);
    panels[next].inert = false;
    panels[next].removeAttribute('aria-hidden');
    panels[next].setAttribute('data-active', '');
    panels[next].setAttribute('data-enter', '');
    if (moveFocus) buttons[next].focus({preventScroll: true});
    previousPanel.inert = true;
    previousPanel.setAttribute('aria-hidden', 'true');
    previousPanel.removeAttribute('data-active');
    previousPanel.removeAttribute('data-enter');
    current = next;
    updateControls();
    announcement.textContent = `Promoción ${current + 1} de ${panels.length}: ${names[current]}.`;
  }

  controls.querySelector('[data-promotion-prev]').addEventListener('click', () => select(current - 1));
  controls.querySelector('[data-promotion-next]').addEventListener('click', () => select(current + 1));
  section.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    select(current + (event.key === 'ArrowRight' ? 1 : -1));
  });

  const stage = section.querySelector('.promotion-stage');
  stage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary || event.target.closest('a, button')) return;
    swipe = {id: event.pointerId, x: event.clientX, y: event.clientY};
  }, {passive: true});
  stage.addEventListener('pointerup', event => {
    if (event.pointerId !== swipe?.id) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) >= 48 && Math.abs(dx) > Math.abs(dy) * 1.4) select(current + (dx < 0 ? 1 : -1));
  }, {passive: true});
  stage.addEventListener('pointercancel', () => { swipe = null; }, {passive: true});

  updateControls();
  controls.hidden = false;
})();
