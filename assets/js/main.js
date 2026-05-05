(function () {
  const root = document.documentElement;
  const header = document.querySelector('[data-header]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navPanel = document.querySelector('[data-nav-panel]');
  const themeToggle = document.querySelector('[data-theme-toggle]');
  const year = document.querySelector('[data-year]');

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  const savedTheme = window.localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    root.setAttribute('data-theme', 'dark');
  }

  function syncThemeToggle() {
    if (!themeToggle) return;
    const isDark = root.getAttribute('data-theme') === 'dark';
    themeToggle.textContent = isDark ? 'Light' : 'Dark';
  }

  function syncUtterancesTheme() {
    const frame = document.querySelector('.utterances-frame');
    if (!frame) return;
    const isDark = root.getAttribute('data-theme') === 'dark';
    frame.contentWindow.postMessage({
      type: 'set-theme',
      theme: isDark ? 'github-dark' : 'github-light',
    }, 'https://utteranc.es');
  }

  syncThemeToggle();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', nextTheme);
      window.localStorage.setItem('theme', nextTheme);
      syncThemeToggle();
      syncUtterancesTheme();
    });
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://utteranc.es') return;
    syncUtterancesTheme();
  });

  function setHeaderState() {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 8);
  }

  setHeaderState();
  window.addEventListener('scroll', setHeaderState, { passive: true });

  if (navToggle && navPanel) {
    navToggle.addEventListener('click', () => {
      const isOpen = navPanel.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
      navToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    });

    navPanel.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navPanel.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open navigation');
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!navPanel.contains(target) && !navToggle.contains(target)) {
        navPanel.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open navigation');
      }
    });
  }

  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });

    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }
})();
