(function () {
  const app = document.querySelector('[data-blog-app]');
  if (!app) return;

  const config = {
    url: 'https://yahixtpkoeqmgxktpzlc.supabase.co',
    anonKey: 'sb_publishable_MRpyKKRo-J459tJktJsXJg_9pq2MCeg',
    adminUsername: 'elijah0430',
    adminEmail: 'elijah0430@blog.local',
  };

  const sessionKey = 'jongwon-blog-session';
  const state = {
    posts: [],
    activePost: null,
    session: readSession(),
    pendingPost: null,
    editorOpen: false,
    draftStored: true,
    mode: window.matchMedia('(max-width: 900px)').matches ? 'write' : 'split',
  };

  const listView = app.querySelector('[data-blog-list-view]');
  const postView = app.querySelector('[data-blog-post-view]');
  const editorView = app.querySelector('[data-blog-editor]');
  const authView = app.querySelector('[data-blog-auth]');
  const listEl = app.querySelector('[data-blog-list]');
  const listStatus = app.querySelector('[data-blog-status]');
  const countEl = app.querySelector('[data-blog-count]');
  const loginButton = app.querySelector('[data-blog-login]');
  const logoutButton = app.querySelector('[data-blog-logout]');
  const writeButton = app.querySelector('[data-blog-write]');
  const editButton = app.querySelector('[data-blog-edit]');
  const authForm = app.querySelector('[data-blog-login-form]');
  const authStatus = app.querySelector('[data-blog-auth-status]');
  const editorForm = app.querySelector('[data-blog-editor-form]');
  const editorTitle = app.querySelector('[data-editor-title]');
  const editorStatus = app.querySelector('[data-editor-status]');
  const commentForm = app.querySelector('[data-comment-form]');
  const commentStatus = app.querySelector('[data-comment-status]');
  const commentList = app.querySelector('[data-comment-list]');
  const commentCount = app.querySelector('[data-comment-count]');
  const emptyState = app.querySelector('[data-blog-empty]');
  const bodyInput = editorForm.elements.namedItem('body');
  const draftStatus = app.querySelector('[data-draft-status]');
  const workspace = app.querySelector('[data-editor-workspace]');
  const preview = app.querySelector('[data-editor-preview]');
  const wordCount = app.querySelector('[data-word-count]');
  const mathTools = app.querySelector('[data-math-tools]');
  const mathToggle = app.querySelector('[data-math-toggle]');
  let draftTimer;
  let previewTimer;
  let refreshRequest;

  function readSession() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(sessionKey) || 'null');
      if (!saved || !saved.access_token || !saved.expires_at) return null;
      return saved;
    } catch (_error) {
      return null;
    }
  }

  function saveSession(session) {
    state.session = session;
    try {
      if (session) window.localStorage.setItem(sessionKey, JSON.stringify(session));
      else window.localStorage.removeItem(sessionKey);
    } catch (_error) { /* Login still works for this page when storage is unavailable. */ }
    syncAuthUi();
  }

  function hasActiveSession() {
    return Boolean(state.session && Number(state.session.expires_at) > Date.now() / 1000 + 15);
  }

  async function ensureSession() {
    if (hasActiveSession()) return true;
    if (!state.session?.refresh_token) return false;
    if (refreshRequest) return refreshRequest;
    refreshRequest = (async () => {
      try {
        const response = await window.fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: state.session.refresh_token }),
        });
        const data = await parseResponse(response);
        saveSession({ access_token: data.access_token, refresh_token: data.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) });
        return true;
      } catch (error) {
        if (error.status === 400 || error.status === 401 || error.status === 403) saveSession(null);
        return false;
      } finally { refreshRequest = null; }
    })();
    return refreshRequest;
  }

  function syncAuthUi() {
    const signedIn = hasActiveSession();
    loginButton.hidden = signedIn;
    logoutButton.hidden = !signedIn;
    editButton.hidden = !signedIn || !state.activePost;
  }

  function authHeaders(token, extra = {}) {
    return {
      apikey: config.anonKey,
      Authorization: `Bearer ${token || config.anonKey}`,
      ...extra,
    };
  }

  async function parseResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const error = new Error(data?.message || data?.error_description || data?.hint || 'Request failed');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function restRequest(path, options = {}) {
    const { token, headers = {}, ...requestOptions } = options;
    const response = await window.fetch(`${config.url}/rest/v1/${path}`, {
      ...requestOptions,
      headers: authHeaders(token, {
        'Content-Type': 'application/json',
        ...headers,
      }),
    });
    return parseResponse(response);
  }

  function formatDate(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(value));
  }

  function slugify(value) {
    const slug = value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || `post-${Date.now()}`;
  }

  function showView(name) {
    if (state.editorOpen && name !== 'editor') persistDraft();
    state.editorOpen = name === 'editor';
    app.dataset.view = name;
    listView.hidden = name !== 'list';
    postView.hidden = name !== 'post';
    editorView.hidden = name !== 'editor';
    if (name !== 'auth') authView.hidden = true;
    if (name === 'auth') authView.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function makeTextElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function renderList() {
    listEl.replaceChildren();
    countEl.textContent = state.posts.length ? `${state.posts.length} post${state.posts.length === 1 ? '' : 's'}` : '';

    emptyState.hidden = state.posts.length > 0;
    if (!state.posts.length) {
      listStatus.textContent = '';
      return;
    }

    listStatus.textContent = '';
    state.posts.forEach((post) => {
      const item = document.createElement('article');
      item.className = 'blog-feed-item';

      const link = document.createElement('a');
      link.href = `#post/${encodeURIComponent(post.slug)}`;
      link.className = 'blog-feed-link';
      link.append(
        makeTextElement('p', 'blog-feed-meta', `${formatDate(post.published_at)} · ${readingTime(post.body)} min read`),
        makeTextElement('h2', '', post.title),
      );
      if (post.summary) link.append(makeTextElement('p', 'blog-feed-summary', post.summary));

      item.append(link);
      listEl.append(item);
    });
  }

  async function loadPosts() {
    emptyState.hidden = true;
    listStatus.textContent = 'Loading posts…';
    try {
      state.posts = await restRequest('blog_posts?select=id,slug,title,summary,body,published_at,updated_at&order=published_at.desc');
      renderList();
    } catch (error) {
      console.error(error);
      state.posts = [];
      listEl.replaceChildren();
      countEl.textContent = '';
      listStatus.textContent = error.status === 404
        ? 'The blog database still needs its one-time setup.'
        : 'Posts could not be loaded.';
    }
  }

  function renderBody(container, body) {
    return window.BlogMarkdown.render(container, body);
  }

  async function openPost(slug) {
    const post = state.posts.find((item) => item.slug === slug);
    if (!post) {
      window.location.hash = '';
      return;
    }

    state.activePost = post;
    app.querySelector('[data-blog-post-meta]').textContent = `Jongwon Lim · ${formatDate(post.published_at)} · ${readingTime(post.body)} min read`;
    app.querySelector('[data-blog-post-title]').textContent = post.title;
    app.querySelector('[data-blog-post-summary]').textContent = post.summary || '';
    renderBody(app.querySelector('[data-blog-post-body]'), post.body);
    syncAuthUi();
    showView('post');
    await loadComments(post.id);
  }

  function renderComments(comments) {
    commentList.replaceChildren();
    commentCount.textContent = `${comments.length} comment${comments.length === 1 ? '' : 's'}`;

    if (!comments.length) {
      commentList.append(makeTextElement('p', 'empty-comments', 'No comments yet.'));
      return;
    }

    comments.forEach((comment) => {
      const item = document.createElement('article');
      item.className = 'comment';
      const body = makeTextElement('div', 'comment-body prose', '');
      renderBody(body, comment.body);
      item.append(makeTextElement('p', 'comment-meta', `${comment.author_name} · ${formatDate(comment.created_at)}`), body);
      commentList.append(item);
    });
  }

  async function loadComments(postId) {
    commentList.replaceChildren(makeTextElement('p', 'empty-comments', 'Loading comments…'));
    commentCount.textContent = '';
    try {
      const comments = await restRequest(`blog_comments?select=id,author_name,body,created_at&post_id=eq.${encodeURIComponent(postId)}&is_hidden=eq.false&order=created_at.asc`);
      renderComments(comments);
    } catch (error) {
      console.error(error);
      commentList.replaceChildren(makeTextElement('p', 'empty-comments', 'Comments could not be loaded.'));
    }
  }

  async function signIn(username, password) {
    if (username !== config.adminUsername) throw new Error('Incorrect username or password.');
    const response = await window.fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: config.adminEmail, password }),
    });
    const data = await parseResponse(response);
    saveSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    });
  }

  function openAuth() {
    showView('auth');
    authStatus.textContent = '';
    authForm.elements.namedItem('username').focus();
  }

  async function openEditor(post = null) {
    if (state.editorOpen && editorForm.elements.namedItem('id').value === (post?.id || '')) return;
    state.pendingPost = post;
    if (!(await ensureSession())) {
      openAuth();
      return;
    }

    if (state.editorOpen) persistDraft();
    state.activePost = post;
    editorForm.reset();
    editorStatus.textContent = '';
    editorForm.elements.namedItem('id').value = post?.id || '';
    editorForm.elements.namedItem('title').value = post?.title || '';
    editorForm.elements.namedItem('summary').value = post?.summary || '';
    editorForm.elements.namedItem('body').value = post?.body || '';
    let restored = false;
    try {
      const draft = JSON.parse(window.localStorage.getItem(draftKey()) || 'null');
      if (draft && typeof draft.title === 'string' && typeof draft.summary === 'string' && typeof draft.body === 'string'
        && (!post || draft.savedAt > Date.parse(post.updated_at))) {
        ['title', 'summary', 'body'].forEach((field) => { editorForm.elements.namedItem(field).value = draft[field]; });
        restored = true;
      }
    } catch (_error) { /* Keep the server version if a saved draft cannot be read. */ }
    draftStatus.textContent = restored ? 'Draft restored · this browser' : 'Draft · only on this browser';
    state.draftStored = true;
    editorTitle.textContent = post ? 'Edit post' : 'New post';
    editorForm.querySelector('button[type="submit"]').textContent = post ? 'Save changes' : 'Publish';
    showView('editor');
    window.history.replaceState(null, '', post ? `#edit/${encodeURIComponent(post.id)}` : '#write');
    setEditorMode(state.mode);
    updatePreview();
    editorForm.elements.namedItem('title').focus({ preventScroll: true });
    editorForm.elements.namedItem('title').setSelectionRange(0, 0);
  }

  function draftKey() {
    return `jongwon-blog-draft-v1:${editorForm.elements.namedItem('id').value || 'new'}`;
  }

  function draftContent() {
    return Object.fromEntries(['title', 'summary', 'body'].map((key) => [key, editorForm.elements.namedItem(key).value]));
  }

  function persistDraft() {
    if (!state.editorOpen) return;
    clearTimeout(draftTimer);
    const draft = draftContent();
    try {
      if (Object.values(draft).some((value) => value.trim())) {
        window.localStorage.setItem(draftKey(), JSON.stringify({ ...draft, savedAt: Date.now() }));
        const time = new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date());
        draftStatus.textContent = `Saved ${time} · this browser`;
      } else {
        window.localStorage.removeItem(draftKey());
        draftStatus.textContent = 'Draft · only on this browser';
      }
      state.draftStored = true;
    } catch (_error) {
      state.draftStored = false;
      draftStatus.textContent = 'Autosave unavailable · download your draft';
    }
  }

  function countWords(body) {
    return String(body || '').trim().split(/\s+/).filter(Boolean).length;
  }

  function readingTime(body) { return Math.max(1, Math.ceil(countWords(body) / 220)); }

  function updatePreview() {
    ['title', 'summary'].forEach((name) => {
      const field = editorForm.elements.namedItem(name);
      field.style.height = 'auto';
      field.style.height = `${field.scrollHeight}px`;
    });
    wordCount.textContent = `${countWords(bodyInput.value)} words · ${readingTime(bodyInput.value)} min read`;
    if (!bodyInput.value.trim()) {
      preview.replaceChildren();
      const placeholder = makeTextElement('div', 'preview-placeholder', 'A thought, taking shape.');
      placeholder.append(makeTextElement('small', '', 'Your writing and equations appear here as you type.'));
      preview.append(placeholder);
      return;
    }
    const result = renderBody(preview, bodyInput.value);
    if (!result.available) editorStatus.textContent = 'Formatting is unavailable. Your text is still saved; reload to try again.';
  }

  function setEditorMode(mode) {
    state.mode = mode;
    workspace.dataset.mode = mode;
    app.querySelector('[data-editor-source]').hidden = mode === 'preview';
    app.querySelector('[data-editor-preview-panel]').hidden = mode === 'write';
    app.querySelectorAll('[data-editor-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.editorMode === mode)));
    updatePreview();
  }

  function changed() {
    state.draftStored = false;
    draftStatus.textContent = 'Saving…';
    clearTimeout(draftTimer);
    clearTimeout(previewTimer);
    draftTimer = window.setTimeout(persistDraft, 650);
    previewTimer = window.setTimeout(updatePreview, 160);
  }

  function insertText(before, after = '', fallback = '', block = false) {
    if (state.mode === 'preview') setEditorMode('split');
    const start = bodyInput.selectionStart;
    const end = bodyInput.selectionEnd;
    const selected = bodyInput.value.slice(start, end) || fallback;
    const prefix = block && start > 0 && !bodyInput.value.slice(0, start).endsWith('\n\n') ? '\n\n' : '';
    const suffix = block && end < bodyInput.value.length && !bodyInput.value.slice(end).startsWith('\n\n') ? '\n\n' : '';
    bodyInput.setRangeText(prefix + before + selected + after + suffix, start, end, 'end');
    bodyInput.focus();
    bodyInput.setSelectionRange(start + prefix.length + before.length, start + prefix.length + before.length + selected.length);
    changed();
  }

  const formats = {
    heading: ['## ', '', 'Section heading', true],
    bold: ['**', '**', 'bold text'],
    italic: ['*', '*', 'italic text'],
    link: ['[', '](https://example.com)', 'link text'],
    list: ['- ', '', 'First point\n- Second point', true],
    quote: ['> ', '', 'A thought worth keeping.', true],
    code: ['```\n', '\n```', 'code', true],
  };
  app.querySelectorAll('[data-format]').forEach((button) => button.addEventListener('click', () => insertText(...formats[button.dataset.format])));
  app.querySelectorAll('[data-editor-mode]').forEach((button) => button.addEventListener('click', () => setEditorMode(button.dataset.editorMode)));
  mathToggle.addEventListener('click', () => {
    mathTools.hidden = !mathTools.hidden;
    mathToggle.setAttribute('aria-expanded', String(!mathTools.hidden));
  });

  const templates = [
    { name: 'Inline', latex: 'x^2', inline: true },
    { name: 'Display', latex: 'E = mc^2' },
    { name: 'Fraction', latex: '\\frac{a}{b}' },
    { name: 'Sum', latex: '\\sum_{i=1}^{n} x_i' },
    { name: 'Expectation', latex: '\\mathbb{E}_{x \\sim p}[f(x)]' },
    { name: 'Gradient', latex: '\\nabla_{\\theta} \\mathcal{L}(\\theta)' },
    { name: 'Matrix', latex: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}' },
    { name: 'Aligned', latex: ['\\begin{aligned}', 'a &= b + c \\\\', '&= d', '\\end{aligned}'].join('\n'), thumbnail: 'a = b + c' },
  ];
  templates.forEach((template) => {
    const button = makeTextElement('button', '', '');
    button.type = 'button';
    button.setAttribute('aria-label', `Insert ${template.name.toLowerCase()} equation`);
    const sample = makeTextElement('span', '', '');
    renderBody(sample, `$${template.thumbnail || template.latex}$`);
    button.append(sample, makeTextElement('span', 'template-label', template.name));
    button.addEventListener('click', () => {
      insertText(template.inline ? '$' : '$$\n', template.inline ? '$' : '\n$$', template.latex, !template.inline);
    });
    app.querySelector('[data-math-templates]').append(button);
  });

  editorForm.addEventListener('input', changed);
  editorForm.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && ['b', 'i', 's'].includes(event.key.toLowerCase())) {
      if (event.key.toLowerCase() !== 's' && event.target !== bodyInput) return;
      event.preventDefault();
      if (event.key.toLowerCase() === 's') persistDraft();
      else insertText(...formats[event.key.toLowerCase() === 'b' ? 'bold' : 'italic']);
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) persistDraft(); });
  window.addEventListener('pagehide', persistDraft);
  window.addEventListener('resize', () => { if (state.editorOpen) updatePreview(); });
  window.addEventListener('beforeunload', (event) => {
    persistDraft();
    if (state.editorOpen && !state.draftStored) { event.preventDefault(); event.returnValue = ''; }
  });
  app.querySelector('[data-draft-download]').addEventListener('click', () => {
    persistDraft();
    const draft = draftContent();
    const content = `# ${draft.title || 'Untitled'}\n\n${draft.summary ? `${draft.summary}\n\n` : ''}${draft.body}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slugify(draft.title || 'draft')}.md`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  async function savePost(formData) {
    const id = String(formData.get('id') || '');
    const title = String(formData.get('title') || '').trim();
    const summary = String(formData.get('summary') || '').trim();
    const body = String(formData.get('body') || '').trim();
    const payload = { title, summary: summary || null, body };

    if (id) {
      return restRequest(`blog_posts?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        token: state.session.access_token,
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      });
    }

    return restRequest('blog_posts', {
      method: 'POST',
      token: state.session.access_token,
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...payload, slug: slugify(title) }),
    });
  }

  async function route() {
    if (window.location.hash === '#write') { await openEditor(); return; }
    const editMatch = window.location.hash.match(/^#edit\/(.+)$/);
    if (editMatch) {
      const post = state.posts.find((item) => item.id === decodeURIComponent(editMatch[1]));
      if (post) { await openEditor(post); return; }
    }
    const match = window.location.hash.match(/^#post\/(.+)$/);
    if (match) {
      await openPost(decodeURIComponent(match[1]));
      return;
    }
    state.activePost = null;
    syncAuthUi();
    showView('list');
  }

  loginButton.addEventListener('click', openAuth);
  writeButton.addEventListener('click', () => openEditor());
  logoutButton.addEventListener('click', () => {
    saveSession(null);
    window.location.hash = '';
    showView('list');
  });
  app.querySelector('[data-blog-auth-close]').addEventListener('click', () => showView('list'));
  app.querySelector('[data-blog-back]').addEventListener('click', () => {
    window.location.hash = '';
  });
  app.querySelector('[data-editor-cancel]').addEventListener('click', () => {
    if (state.activePost) {
      window.location.hash = `#post/${encodeURIComponent(state.activePost.slug)}`;
      showView('post');
    } else {
      window.location.hash = '';
      showView('list');
    }
  });
  editButton.addEventListener('click', () => openEditor(state.activePost));

  authForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = authForm.querySelector('button[type="submit"]');
    const formData = new FormData(authForm);
    submit.disabled = true;
    authStatus.textContent = 'Signing in…';
    try {
      await signIn(String(formData.get('username') || '').trim(), String(formData.get('password') || ''));
      authForm.reset();
      openEditor(state.pendingPost);
    } catch (error) {
      console.error(error);
      authStatus.textContent = 'Incorrect username or password.';
    } finally {
      submit.disabled = false;
    }
  });

  editorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    persistDraft();
    if (!(await ensureSession())) {
      state.pendingPost = state.activePost;
      openAuth();
      authStatus.textContent = 'Sign in again to publish. Your draft has been saved in this browser.';
      return;
    }

    if (!editorForm.elements.namedItem('title').value.trim() || !bodyInput.value.trim()) {
      setEditorMode('write');
      editorStatus.textContent = 'Add a title and some text before publishing.';
      (!editorForm.elements.namedItem('title').value.trim() ? editorForm.elements.namedItem('title') : bodyInput).focus();
      return;
    }

    const formData = new FormData(editorForm);
    editorForm.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    editorForm.querySelectorAll('input, textarea').forEach((field) => { field.readOnly = true; });
    editorStatus.textContent = 'Saving…';
    try {
      const rows = await savePost(formData);
      const saved = Array.isArray(rows) ? rows[0] : null;
      if (!saved) throw new Error('The server did not confirm the saved post.');
      clearTimeout(draftTimer);
      try { window.localStorage.removeItem(draftKey()); } catch (_error) { /* Publishing already succeeded. */ }
      state.editorOpen = false;
      await loadPosts();
      editorStatus.textContent = 'Saved.';
      window.location.hash = saved?.slug ? `#post/${encodeURIComponent(saved.slug)}` : '';
      await route();
    } catch (error) {
      console.error(error);
      if (error.status === 401 || error.status === 403) saveSession(null);
      editorStatus.textContent = error.status === 409
        ? 'A post with this title already exists.'
        : 'The post could not be saved.';
    } finally {
      editorForm.querySelectorAll('button').forEach((button) => { button.disabled = false; });
      editorForm.querySelectorAll('input, textarea').forEach((field) => { field.readOnly = false; });
    }
  });

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.activePost) return;
    const formData = new FormData(commentForm);
    if (String(formData.get('website') || '')) return;

    const author = String(formData.get('author') || '').trim();
    const body = String(formData.get('body') || '').trim();
    const submit = commentForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    commentStatus.textContent = 'Posting…';
    try {
      await restRequest('blog_comments', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ post_id: state.activePost.id, author_name: author, body }),
      });
      commentForm.reset();
      commentStatus.textContent = 'Comment posted.';
      await loadComments(state.activePost.id);
    } catch (error) {
      console.error(error);
      commentStatus.textContent = 'The comment could not be posted.';
    } finally {
      submit.disabled = false;
    }
  });

  window.addEventListener('hashchange', route);
  ensureSession().then(syncAuthUi);
  loadPosts().then(route);
}());
