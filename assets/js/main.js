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

  syncThemeToggle();

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const nextTheme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', nextTheme);
      window.localStorage.setItem('theme', nextTheme);
      syncThemeToggle();
    });
  }

  const guestbookThread = document.querySelector('[data-guestbook-thread]');
  const guestbookLocal = document.querySelector('[data-guestbook-local]');
  const guestbookForm = document.querySelector('[data-guestbook-form]');
  const guestbookList = document.querySelector('[data-guestbook-list]');

  function renderLocalGuestbook() {
    if (!guestbookList) return;
    const notes = JSON.parse(window.localStorage.getItem('guestbook-notes') || '[]');
    guestbookList.innerHTML = notes.map((note) => `
      <article class="guestbook-item">
        <strong>${escapeHtml(note.name)}</strong>
        <time>${escapeHtml(note.date)}</time>
        <p>${escapeHtml(note.message)}</p>
      </article>
    `).join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  if (guestbookThread) {
    if (window.location.protocol === 'file:') {
      guestbookThread.hidden = true;
      if (guestbookLocal) {
        guestbookLocal.hidden = false;
      }
      renderLocalGuestbook();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cusdis.com/js/cusdis.es.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }

  if (guestbookForm) {
    guestbookForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(guestbookForm);
      const note = {
        name: String(formData.get('name') || '').trim(),
        message: String(formData.get('message') || '').trim(),
        date: new Date().toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        }),
      };

      if (!note.name || !note.message) return;

      const notes = JSON.parse(window.localStorage.getItem('guestbook-notes') || '[]');
      notes.unshift(note);
      window.localStorage.setItem('guestbook-notes', JSON.stringify(notes.slice(0, 20)));
      guestbookForm.reset();
      renderLocalGuestbook();
    });
  }

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
