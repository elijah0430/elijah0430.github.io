(function () {
  const nav = document.querySelector('[data-page-toc]');
  if (!nav) return;

  const toggle = nav.querySelector('[data-toc-toggle]');
  const currentLabel = nav.querySelector('[data-toc-current]');
  const entries = [...nav.querySelectorAll('a[href^="#"]')].map(link => ({
    link,
    target: document.getElementById(link.hash.slice(1)),
  })).filter(entry => entry.target);
  if (!entries.length) return;

  const compact = window.matchMedia('(max-width: 1119px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const header = document.querySelector('.site-header');
  let frame = 0;

  function closeMenu(returnFocus = false) {
    nav.removeAttribute('data-expanded');
    toggle.setAttribute('aria-expanded', 'false');
    if (returnFocus) toggle.focus({ preventScroll: true });
  }

  function markCurrent(entry) {
    for (const item of entries) {
      if (item === entry) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    }
    currentLabel.textContent = entry.link.textContent;
  }

  function updateCurrent() {
    frame = 0;
    const headerBottom = header ? header.getBoundingClientRect().bottom : 0;
    const boundary = Math.max(headerBottom, compact.matches ? toggle.getBoundingClientRect().bottom : 0) + 24;
    let current = entries[0];
    for (const entry of entries) {
      if (entry.target.getBoundingClientRect().top <= boundary + 1) current = entry;
    }
    // The final section may be too short to ever reach the top of the viewport.
    const last = entries[entries.length - 1];
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (window.scrollY > 0 && atBottom && last.target.getBoundingClientRect().top < window.innerHeight) current = last;
    markCurrent(current);
  }

  function scheduleUpdate() {
    if (!frame) frame = window.requestAnimationFrame(updateCurrent);
  }

  toggle.addEventListener('click', () => {
    const expanded = !nav.hasAttribute('data-expanded');
    nav.toggleAttribute('data-expanded', expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
  });

  entries.forEach(entry => {
    entry.link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      closeMenu();
      const disclosure = entry.target.querySelector(':scope > .section-disclosure');
      if (disclosure) disclosure.open = true;
      if (window.location.hash !== entry.link.hash) window.history.pushState(null, '', entry.link.hash);
      // Move keyboard focus without leaving a permanent outline on the section.
      const hadTabindex = entry.target.hasAttribute('tabindex');
      if (!hadTabindex) entry.target.setAttribute('tabindex', '-1');
      entry.target.classList.add('toc-destination');
      entry.target.focus({ preventScroll: true });
      entry.target.addEventListener('blur', () => {
        entry.target.classList.remove('toc-destination');
        if (!hadTabindex) entry.target.removeAttribute('tabindex');
      }, { once: true });
      entry.target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' });
      scheduleUpdate();
    });
  });

  document.addEventListener('click', event => {
    if (!nav.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.hasAttribute('data-expanded')) closeMenu(true);
  });
  // Expanding paper overviews, loading figures, and resizing can move section boundaries.
  document.addEventListener('toggle', scheduleUpdate, true);
  document.addEventListener('load', scheduleUpdate, true);
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', () => {
    closeMenu();
    scheduleUpdate();
  });
  window.addEventListener('hashchange', scheduleUpdate);
  window.addEventListener('pageshow', scheduleUpdate);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(document.getElementById('main'));
    if (header) observer.observe(header);
    observer.observe(toggle);
  }
  updateCurrent();
})();
