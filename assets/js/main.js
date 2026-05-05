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

  const contactForm = document.querySelector('[data-contact-form]');
  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(contactForm);
      const name = String(formData.get('name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const message = String(formData.get('message') || '').trim();
      const body = [
        name ? `Name: ${name}` : '',
        email ? `Email: ${email}` : '',
        '',
        message,
      ].filter(Boolean).join('\n');
      const mailto = `mailto:elijah0430@snu.ac.kr?subject=${encodeURIComponent('Message from homepage')}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
    });
  }

  const dodgeGame = document.querySelector('[data-dodge-game]');
  if (dodgeGame) {
    const canvas = dodgeGame.querySelector('[data-dodge-canvas]');
    const scoreEl = dodgeGame.querySelector('[data-dodge-score]');
    const livesEl = dodgeGame.querySelector('[data-dodge-lives]');
    const messageEl = dodgeGame.querySelector('[data-dodge-message]');
    const startButton = dodgeGame.querySelector('[data-dodge-start]');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const goodTokens = ['Evidence', 'Mechanism', 'Retrieval', 'Profile', 'Factuality'];
    const badTokens = ['Hallucination', 'Leakage', 'Bias'];
    const state = {
      running: false,
      score: 0,
      lives: 3,
      playerX: 320,
      targetX: 320,
      objects: [],
      lastTime: 0,
      spawnTimer: 0,
    };

    function setCanvasSize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(320, Math.floor(rect.width * ratio));
      canvas.height = Math.max(220, Math.floor(rect.height * ratio));
      if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function drawGame() {
      if (!canvas || !ctx) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = getComputedStyle(root).getPropertyValue('--surface').trim();
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = getComputedStyle(root).getPropertyValue('--line').trim();
      ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

      state.objects.forEach((object) => {
        ctx.fillStyle = object.good ? '#1d5f8a' : '#a43f3f';
        ctx.fillRect(object.x - 36, object.y - 15, 72, 30);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(object.label, object.x, object.y);
      });

      ctx.fillStyle = '#202938';
      ctx.fillRect(state.playerX - 42, height - 32, 84, 14);
      ctx.fillStyle = '#1d5f8a';
      ctx.fillRect(state.playerX - 28, height - 48, 56, 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MODEL', state.playerX, height - 40);
    }

    function updateStatus() {
      if (scoreEl) scoreEl.textContent = String(state.score);
      if (livesEl) livesEl.textContent = String(state.lives);
    }

    function spawnObject() {
      if (!canvas) return;
      const good = Math.random() > 0.34;
      const labels = good ? goodTokens : badTokens;
      state.objects.push({
        x: 48 + Math.random() * Math.max(100, canvas.clientWidth - 96),
        y: -20,
        speed: 88 + Math.random() * 80 + state.score * 1.8,
        good,
        label: labels[Math.floor(Math.random() * labels.length)],
      });
    }

    function endGame(text) {
      state.running = false;
      if (messageEl) messageEl.textContent = text;
      if (startButton) startButton.textContent = 'Restart';
      drawGame();
    }

    function step(timestamp) {
      if (!state.running || !canvas) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const delta = Math.min(32, timestamp - state.lastTime || 16) / 1000;
      state.lastTime = timestamp;
      state.spawnTimer -= delta;

      state.playerX += (state.targetX - state.playerX) * Math.min(1, delta * 12);
      state.playerX = Math.max(42, Math.min(width - 42, state.playerX));

      if (state.spawnTimer <= 0) {
        spawnObject();
        state.spawnTimer = Math.max(0.42, 1.05 - state.score * 0.015);
      }

      state.objects = state.objects.filter((object) => {
        object.y += object.speed * delta;
        const caught = object.y > height - 58
          && object.y < height - 18
          && Math.abs(object.x - state.playerX) < 62;

        if (caught) {
          if (object.good) {
            state.score += 1;
          } else {
            state.lives -= 1;
          }
          return false;
        }

        if (object.y > height + 30) {
          if (object.good) state.lives -= 1;
          return false;
        }

        return true;
      });

      updateStatus();
      drawGame();

      if (state.lives <= 0) {
        endGame(`Game over. Final score: ${state.score}.`);
        return;
      }

      window.requestAnimationFrame(step);
    }

    function startGame() {
      if (!canvas || !ctx) return;
      setCanvasSize();
      state.running = true;
      state.score = 0;
      state.lives = 3;
      state.playerX = canvas.clientWidth / 2;
      state.targetX = state.playerX;
      state.objects = [];
      state.lastTime = 0;
      state.spawnTimer = 0.2;
      if (messageEl) messageEl.textContent = 'Catch useful tokens. Avoid hallucinations.';
      if (startButton) startButton.textContent = 'Restart';
      updateStatus();
      window.requestAnimationFrame(step);
    }

    if (canvas) {
      setCanvasSize();
      drawGame();
      canvas.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        state.targetX = event.clientX - rect.left;
      });
    }

    document.addEventListener('keydown', (event) => {
      if (!canvas) return;
      if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
        state.targetX -= 42;
      }
      if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
        state.targetX += 42;
      }
    });

    window.addEventListener('resize', () => {
      setCanvasSize();
      drawGame();
    });

    if (startButton) {
      startButton.addEventListener('click', startGame);
    }
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
