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
    const contactStatus = contactForm.querySelector('[data-contact-status]');
    const submitButton = contactForm.querySelector('button[type="submit"]');
    const emailConfig = window.EMAILJS_CONFIG || {};

    function hasEmailConfig() {
      return Boolean(
        window.emailjs
        && emailConfig.publicKey
        && emailConfig.serviceId
        && emailConfig.templateId
      );
    }

    function setContactStatus(text) {
      if (contactStatus) contactStatus.textContent = text;
    }

    function openEmailDraft(name, email, message) {
      const body = [
        name ? `Name: ${name}` : '',
        email ? `Email: ${email}` : '',
        '',
        message,
      ].filter(Boolean).join('\n');
      const mailto = `mailto:elijah0430@snu.ac.kr?subject=${encodeURIComponent('Message from homepage')}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
    }

    contactForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(contactForm);
      const name = String(formData.get('name') || '').trim();
      const email = String(formData.get('email') || '').trim();
      const message = String(formData.get('message') || '').trim();
      if (!message) return;

      if (!hasEmailConfig()) {
        setContactStatus('EmailJS is not configured yet. Opening email draft.');
        openEmailDraft(name, email, message);
        return;
      }

      if (submitButton) submitButton.disabled = true;
      setContactStatus('Sending...');

      try {
        window.emailjs.init({ publicKey: emailConfig.publicKey });
        await window.emailjs.send(emailConfig.serviceId, emailConfig.templateId, {
          from_name: name || 'Homepage visitor',
          from_email: email,
          reply_to: email,
          to_email: 'elijah0430@snu.ac.kr',
          message,
        });
        contactForm.reset();
        setContactStatus('Message sent.');
      } catch (error) {
        setContactStatus('Could not send automatically. Opening email draft.');
        openEmailDraft(name, email, message);
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  const runnerGame = document.querySelector('[data-runner-game]');
  if (runnerGame) {
    const canvas = runnerGame.querySelector('[data-runner-canvas]');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const scoreEl = runnerGame.querySelector('[data-runner-score]');
    const distanceEl = runnerGame.querySelector('[data-runner-distance]');
    const bestEl = runnerGame.querySelector('[data-runner-best]');
    const speedEl = runnerGame.querySelector('[data-runner-speed]');
    const messageEl = runnerGame.querySelector('[data-runner-message]');
    const startButton = runnerGame.querySelector('[data-runner-start]');
    const jumpButton = runnerGame.querySelector('[data-runner-jump]');
    const duckButton = runnerGame.querySelector('[data-runner-duck]');
    const scoreForm = runnerGame.querySelector('[data-score-form]');
    const highScoresEl = runnerGame.querySelector('[data-high-scores]');
    const leaderboardConfig = {
      supabaseUrl: 'https://yahixtpkoeqmgxktpzlc.supabase.co',
      supabaseAnonKey: 'sb_publishable_MRpyKKRo-J459tJktJsXJg_9pq2MCeg',
      table: 'dot_rush_scores',
    };
    const player = {
      x: 72,
      y: 0,
      width: 52,
      height: 58,
      vy: 0,
      ducking: false,
      onGround: true,
    };
    const state = {
      running: false,
      ended: false,
      score: 0,
      best: Number(window.localStorage.getItem('runner-best') || 0),
      bonus: 0,
      distance: 0,
      speed: 255,
      animTime: 0,
      lastTime: 0,
      obstacleTimer: 0,
      coinTimer: 0,
      obstacles: [],
      coins: [],
      clouds: [],
      raf: 0,
    };

    function gameWidth() {
      return canvas ? canvas.clientWidth : 760;
    }

    function gameHeight() {
      return canvas ? canvas.clientHeight : 360;
    }

    function groundY() {
      return gameHeight() - 48;
    }

    function runnerScore() {
      return Math.floor(state.distance / 7) + state.bonus;
    }

    function distanceMeters() {
      return Math.floor(state.distance / 18);
    }

    function currentColors() {
      const styles = getComputedStyle(root);
      return {
        surface: styles.getPropertyValue('--surface').trim(),
        line: styles.getPropertyValue('--line').trim(),
        text: styles.getPropertyValue('--text').trim(),
        muted: styles.getPropertyValue('--muted').trim(),
        link: styles.getPropertyValue('--link').trim(),
        danger: '#b54747',
        star: '#c58a22',
      };
    }

    function updateRunnerStatus() {
      state.score = runnerScore();
      if (scoreEl) scoreEl.textContent = String(state.score);
      if (distanceEl) distanceEl.textContent = String(distanceMeters());
      if (bestEl) bestEl.textContent = String(state.best);
      if (speedEl) speedEl.textContent = (state.speed / 255).toFixed(1);
    }

    function setCanvasSize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(320, Math.floor(rect.width * ratio));
      canvas.height = Math.max(180, Math.floor(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawRunner();
    }

    function resetRunner() {
      state.running = true;
      state.ended = false;
      state.score = 0;
      state.bonus = 0;
      state.distance = 0;
      state.speed = 255;
      state.animTime = 0;
      state.lastTime = 0;
      state.obstacleTimer = 0.8;
      state.coinTimer = 1.2;
      state.obstacles = [];
      state.coins = [];
      state.clouds = Array.from({ length: 5 }, (_, index) => ({
        x: index * 170 + Math.random() * 80,
        y: 34 + Math.random() * 76,
        width: 46 + Math.random() * 48,
      }));
      player.width = 52;
      player.height = 58;
      player.y = groundY() - player.height;
      player.vy = 0;
      player.ducking = false;
      player.onGround = true;
      if (scoreForm) scoreForm.hidden = true;
      if (messageEl) messageEl.textContent = 'Jump blocks. Hold down mid-air to drop fast.';
      if (startButton) startButton.textContent = 'Restart';
      updateRunnerStatus();
    }

    function startRunner() {
      if (!canvas || !ctx) return;
      window.cancelAnimationFrame(state.raf);
      resetRunner();
      state.raf = window.requestAnimationFrame(tickRunner);
    }

    function endRunner() {
      state.running = false;
      state.ended = true;
      window.cancelAnimationFrame(state.raf);
      updateRunnerStatus();
      if (state.score > state.best) {
        state.best = state.score;
        window.localStorage.setItem('runner-best', String(state.best));
        updateRunnerStatus();
      }
      if (messageEl) messageEl.textContent = `Final score: ${state.score}. Save your score.`;
      if (scoreForm) scoreForm.hidden = false;
      if (startButton) startButton.textContent = 'Restart';
      drawRunner();
    }

    function jumpRunner() {
      if (!state.running) {
        startRunner();
        return;
      }
      if (!player.onGround || player.ducking) return;
      player.vy = -650;
      player.onGround = false;
    }

    function setDuck(active) {
      if (!state.running) return;
      if (active && !player.onGround) {
        player.vy = Math.max(player.vy, 930);
        return;
      }
      player.ducking = active && player.onGround;
      player.width = player.ducking ? 64 : 52;
      player.height = player.ducking ? 34 : 58;
      if (player.onGround) player.y = groundY() - player.height;
    }

    function spawnObstacle() {
      const high = Math.random() > 0.68;
      const height = high ? 30 : 34 + Math.random() * 28;
      const width = high ? 52 : 24 + Math.random() * 16;
      state.obstacles.push({
        x: gameWidth() + 28,
        y: high ? groundY() - 76 : groundY() - height,
        width,
        height,
        high,
      });
    }

    function spawnCoin() {
      state.coins.push({
        x: gameWidth() + 28,
        y: groundY() - 78 - Math.random() * 82,
        radius: 8,
      });
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.width
        && a.x + a.width > b.x
        && a.y < b.y + b.height
        && a.y + a.height > b.y;
    }

    function updateRunner(delta) {
      state.distance += state.speed * delta;
      state.speed = Math.min(560, 255 + state.distance * 0.025);
      state.animTime += delta;
      state.obstacleTimer -= delta;
      state.coinTimer -= delta;

      if (state.obstacleTimer <= 0) {
        spawnObstacle();
        state.obstacleTimer = Math.max(0.58, 1.3 - state.speed / 760 + Math.random() * 0.42);
      }
      if (state.coinTimer <= 0) {
        spawnCoin();
        state.coinTimer = 1.0 + Math.random() * 1.1;
      }

      player.vy += 1650 * delta;
      player.y += player.vy * delta;
      if (player.y >= groundY() - player.height) {
        player.y = groundY() - player.height;
        player.vy = 0;
        player.onGround = true;
      }

      state.clouds.forEach((cloud) => {
        cloud.x -= state.speed * delta * 0.12;
        if (cloud.x + cloud.width < 0) {
          cloud.x = gameWidth() + Math.random() * 120;
          cloud.y = 34 + Math.random() * 76;
        }
      });

      state.obstacles.forEach((obstacle) => {
        obstacle.x -= state.speed * delta;
      });
      state.coins.forEach((coin) => {
        coin.x -= state.speed * delta;
      });

      const playerBox = {
        x: player.x + 4,
        y: player.y + 4,
        width: player.width - 8,
        height: player.height - 8,
      };

      if (state.obstacles.some((obstacle) => rectsOverlap(playerBox, obstacle))) {
        endRunner();
        return;
      }

      state.coins = state.coins.filter((coin) => {
        const coinBox = {
          x: coin.x - coin.radius,
          y: coin.y - coin.radius,
          width: coin.radius * 2,
          height: coin.radius * 2,
        };
        if (rectsOverlap(playerBox, coinBox)) {
          state.bonus += 50;
          return false;
        }
        return coin.x + coin.radius > 0;
      });
      state.obstacles = state.obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);
      updateRunnerStatus();
    }

    function drawCloud(cloud, colors) {
      ctx.fillStyle = colors.line;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(cloud.x, cloud.y, cloud.width * 0.34, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.x + cloud.width * 0.26, cloud.y - 3, cloud.width * 0.28, 12, 0, 0, Math.PI * 2);
      ctx.ellipse(cloud.x + cloud.width * 0.5, cloud.y, cloud.width * 0.32, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawRunner() {
      if (!canvas || !ctx) return;
      const width = gameWidth();
      const height = gameHeight();
      const colors = currentColors();
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = colors.surface;
      ctx.fillRect(0, 0, width, height);

      state.clouds.forEach((cloud) => drawCloud(cloud, colors));

      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, groundY() + 0.5);
      ctx.lineTo(width, groundY() + 0.5);
      ctx.stroke();

      const dashOffset = state.distance % 34;
      ctx.fillStyle = colors.line;
      for (let x = -dashOffset; x < width; x += 34) {
        ctx.fillRect(x, groundY() + 18, 18, 2);
      }

      state.coins.forEach((coin) => {
        ctx.fillStyle = colors.star;
        ctx.beginPath();
        ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(coin.x - 2, coin.y - 2, 4, 4);
      });

      state.obstacles.forEach((obstacle) => {
        if (obstacle.high) {
          ctx.fillStyle = colors.danger;
          ctx.fillRect(obstacle.x, obstacle.y + 8, obstacle.width, obstacle.height - 8);
          ctx.beginPath();
          ctx.moveTo(obstacle.x + 8, obstacle.y + 8);
          ctx.lineTo(obstacle.x + 20, obstacle.y);
          ctx.lineTo(obstacle.x + 32, obstacle.y + 8);
          ctx.fill();
        } else {
          ctx.fillStyle = colors.text;
          ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
          ctx.fillStyle = colors.surface;
          ctx.fillRect(obstacle.x + obstacle.width * 0.35, obstacle.y + 8, 4, 12);
        }
      });

      const stride = player.onGround ? Math.sin(state.animTime * state.speed * 0.035) : 0.85;
      const bodyX = player.x + (player.ducking ? 30 : 27);
      const bodyY = player.y + (player.ducking ? 20 : 31);
      const neckBaseX = bodyX + 18;
      const neckBaseY = bodyY - 7;
      const headX = player.ducking ? bodyX + 34 : bodyX + 25;
      const headY = player.ducking ? bodyY - 18 : bodyY - 44;

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.strokeStyle = colors.link;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(neckBaseX, neckBaseY);
      ctx.quadraticCurveTo(
        player.ducking ? bodyX + 36 : bodyX + 30,
        player.ducking ? bodyY - 15 : bodyY - 34,
        headX,
        headY,
      );
      ctx.stroke();

      ctx.fillStyle = colors.link;
      ctx.beginPath();
      ctx.ellipse(bodyX, bodyY, player.ducking ? 30 : 25, player.ducking ? 14 : 20, -0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.line;
      ctx.beginPath();
      ctx.ellipse(bodyX - 5, bodyY + 2, player.ducking ? 18 : 14, player.ducking ? 8 : 12, -0.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.link;
      ctx.beginPath();
      ctx.ellipse(headX, headY, 10, 8, 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = colors.star;
      ctx.beginPath();
      ctx.moveTo(headX + 8, headY - 1);
      ctx.lineTo(headX + 20, headY + 3);
      ctx.lineTo(headX + 8, headY + 7);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(headX + 3, headY - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = colors.text;
      ctx.beginPath();
      ctx.arc(headX + 4, headY - 2, 1.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 3;
      const hipX = bodyX - 6;
      const hipY = bodyY + 16;
      const footY = player.onGround ? groundY() + 1 : hipY + 34;
      const kneeLift = player.onGround ? 18 : 16;
      const legA = player.onGround ? stride : -0.75;
      const legB = player.onGround ? -stride : 0.85;
      ctx.beginPath();
      ctx.moveTo(hipX - 5, hipY);
      ctx.lineTo(hipX - 10 + legA * 10, footY - kneeLift);
      ctx.lineTo(hipX - 18 + legA * 18, footY);
      ctx.moveTo(hipX + 7, hipY);
      ctx.lineTo(hipX + 4 + legB * 10, footY - kneeLift);
      ctx.lineTo(hipX - 2 + legB * 18, footY);
      ctx.stroke();

      ctx.strokeStyle = colors.link;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bodyX - 22, bodyY - 2);
      ctx.quadraticCurveTo(bodyX - 35, bodyY - 12 - Math.abs(stride) * 5, bodyX - 22, bodyY + 10);
      ctx.stroke();

      ctx.restore();

      if (!state.running) {
        ctx.fillStyle = colors.muted;
        ctx.font = '600 18px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(state.ended ? 'Game over' : 'Press Start', width / 2, height / 2);
      }
    }

    function tickRunner(timestamp) {
      if (!state.running) return;
      if (!state.lastTime) state.lastTime = timestamp;
      const delta = Math.min(0.034, (timestamp - state.lastTime) / 1000);
      state.lastTime = timestamp;
      updateRunner(delta);
      drawRunner();
      if (state.running) state.raf = window.requestAnimationFrame(tickRunner);
    }

    function localScores() {
      return JSON.parse(window.localStorage.getItem('runner-scores') || '[]');
    }

    function scoreNameKey(name) {
      return String(name || '').trim().toLocaleLowerCase();
    }

    function bestScoresByName(scores) {
      const byName = new Map();
      scores.forEach((score) => {
        const key = scoreNameKey(score.name);
        if (!key) return;
        const current = byName.get(key);
        if (!current || Number(score.score) > Number(current.score)) {
          byName.set(key, {
            name: String(score.name || '').trim(),
            score: Number(score.score) || 0,
          });
        }
      });
      return Array.from(byName.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    }

    function renderScores(scores = localScores()) {
      if (!highScoresEl) return;
      const bestScores = bestScoresByName(scores);
      highScoresEl.innerHTML = bestScores.length
        ? bestScores.map((score) => `<li><strong>${score.score}</strong> ${escapeHtml(score.name)}</li>`).join('')
        : '<li>No scores yet.</li>';
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    async function saveScore(name, score) {
      let remoteSaved = false;
      if (leaderboardConfig.supabaseUrl && leaderboardConfig.supabaseAnonKey) {
        try {
          const response = await fetch(`${leaderboardConfig.supabaseUrl}/rest/v1/${leaderboardConfig.table}`, {
            method: 'POST',
            headers: {
              apikey: leaderboardConfig.supabaseAnonKey,
              Authorization: `Bearer ${leaderboardConfig.supabaseAnonKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ name, score }),
          });
          remoteSaved = response.ok;
        } catch (error) {
          remoteSaved = false;
        }
      }

      const scores = bestScoresByName([...localScores(), { name, score }]);
      window.localStorage.setItem('runner-scores', JSON.stringify(scores));
      renderScores(scores);
      return remoteSaved;
    }

    async function loadRemoteScores() {
      if (!leaderboardConfig.supabaseUrl || !leaderboardConfig.supabaseAnonKey) return;
      const url = `${leaderboardConfig.supabaseUrl}/rest/v1/${leaderboardConfig.table}?select=name,score&order=score.desc,created_at.asc&limit=50`;
      const response = await fetch(url, {
        headers: {
          apikey: leaderboardConfig.supabaseAnonKey,
          Authorization: `Bearer ${leaderboardConfig.supabaseAnonKey}`,
        },
      });
      if (!response.ok) throw new Error('Failed to load remote scores');
      const scores = await response.json();
      renderScores(scores);
    }

    if (canvas && ctx) {
      setCanvasSize();
      window.addEventListener('resize', setCanvasSize);
      canvas.addEventListener('pointerdown', jumpRunner);
    }

    if (startButton) startButton.addEventListener('click', startRunner);
    if (jumpButton) jumpButton.addEventListener('click', jumpRunner);
    if (duckButton) {
      duckButton.addEventListener('pointerdown', () => setDuck(true));
      duckButton.addEventListener('pointerup', () => setDuck(false));
      duckButton.addEventListener('pointerleave', () => setDuck(false));
    }

    function isFormControl(target) {
      return target instanceof HTMLElement
        && ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
    }

    document.addEventListener('keydown', (event) => {
      if (isFormControl(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.key === ' ' || event.key === 'ArrowUp' || key === 'w') {
        event.preventDefault();
        jumpRunner();
      }
      if (event.key === 'ArrowDown' || key === 's') {
        event.preventDefault();
        setDuck(true);
      }
    });

    document.addEventListener('keyup', (event) => {
      if (isFormControl(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.key === 'ArrowDown' || key === 's') {
        setDuck(false);
      }
    });

    if (scoreForm) {
      scoreForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(scoreForm);
        const name = String(formData.get('name') || '').trim();
        if (!name) return;
        const remoteSaved = await saveScore(name, state.score);
        if (remoteSaved) {
          await loadRemoteScores().catch(() => {});
          if (messageEl) messageEl.textContent = 'Score saved.';
        } else if (messageEl) {
          messageEl.textContent = 'Score saved locally. Remote leaderboard is not ready yet.';
        }
        scoreForm.hidden = true;
      });
    }

    updateRunnerStatus();
    renderScores();
    loadRemoteScores().catch(() => {});
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
