(function () {
  const papers = [...document.querySelectorAll('#selected-publications .paper-list > li > .paper')];
  const references = [...document.querySelectorAll('.research-directions a[data-paper-ref]')];
  if (!papers.length || !references.length) return;

  const preview = document.createElement('div');
  preview.id = 'paper-preview';
  preview.className = 'paper-preview';
  preview.setAttribute('role', 'tooltip');
  preview.hidden = true;
  document.body.append(preview);

  let activeLink = null;
  let hideTimer;
  let touchInput = false;

  function hide() {
    clearTimeout(hideTimer);
    activeLink?.removeAttribute('aria-describedby');
    activeLink = null;
    preview.hidden = true;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (document.activeElement !== activeLink) hide();
    }, 150);
  }

  function position() {
    if (!activeLink) return;
    const anchor = activeLink.getBoundingClientRect();
    const box = preview.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - box.width - 12));
    const top = anchor.bottom + box.height + 10 <= window.innerHeight - 12
      ? anchor.bottom + 10
      : Math.max(12, anchor.top - box.height - 10);
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
  }

  function show(link, paper, number) {
    hide();
    activeLink = link;
    const title = document.createElement('strong');
    title.className = 'paper-preview-title';
    title.textContent = `[${number}] ${paper.querySelector('h3').textContent.trim()}`;
    const venue = document.createElement('p');
    venue.className = 'paper-preview-venue';
    venue.textContent = paper.querySelector('.venue')?.textContent.trim() || '';
    preview.replaceChildren(title, venue);
    const figure = paper.querySelector('.paper-figure img');
    if (figure) {
      const image = document.createElement('img');
      image.className = 'paper-preview-figure';
      image.src = figure.getAttribute('src');
      image.alt = figure.alt;
      preview.append(image);
    }
    link.setAttribute('aria-describedby', preview.id);
    preview.hidden = false;
    position();
  }

  for (const link of references) {
    const paper = papers.find(item => `#${item.id}` === link.getAttribute('href'));
    const title = paper?.querySelector('h3');
    if (!title) continue;
    const number = papers.indexOf(paper) + 1;
    // Read the actual list order and content so the preview cannot drift.
    link.textContent = `[${number}]`;
    link.setAttribute('aria-label', `Selected publication ${number}: ${title.textContent.trim()}`);
    link.addEventListener('pointerdown', event => {
      touchInput = event.pointerType === 'touch';
      if (touchInput) hide();
    });
    link.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') {
        touchInput = false;
        show(link, paper, number);
      }
    });
    link.addEventListener('pointerleave', scheduleHide);
    link.addEventListener('focus', () => {
      if (!touchInput) show(link, paper, number);
    });
    link.addEventListener('blur', hide);
    link.addEventListener('click', event => {
      hide();
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const overview = paper.querySelector('details.paper-details');
      if (overview) overview.open = true;
      paper.tabIndex = -1;
      paper.focus({ preventScroll: true });
      // Preserve native fragment navigation, history and no-JavaScript fallback.
    });
  }

  preview.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  preview.addEventListener('pointerleave', scheduleHide);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hide();
    if (event.key === 'Tab') touchInput = false;
  });
  document.addEventListener('scroll', event => {
    if (!preview.contains(event.target)) hide();
  }, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
})();
