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
    if (session) {
      window.localStorage.setItem(sessionKey, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(sessionKey);
    }
    syncAuthUi();
  }

  function hasActiveSession() {
    return Boolean(state.session && Number(state.session.expires_at) > Date.now() / 1000 + 15);
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

    if (!state.posts.length) {
      listStatus.textContent = 'No posts yet.';
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
        makeTextElement('h2', '', post.title),
        makeTextElement('p', 'blog-feed-summary', post.summary || 'Open post'),
        makeTextElement('p', 'blog-feed-meta', `${formatDate(post.published_at)} · Jongwon Lim`),
      );

      item.append(link);
      listEl.append(item);
    });
  }

  async function loadPosts() {
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
    container.replaceChildren();
    String(body || '')
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .forEach((paragraph) => container.append(makeTextElement('p', '', paragraph)));
  }

  async function openPost(slug) {
    const post = state.posts.find((item) => item.slug === slug);
    if (!post) {
      window.location.hash = '';
      return;
    }

    state.activePost = post;
    app.querySelector('[data-blog-post-meta]').textContent = `${formatDate(post.published_at)} · Jongwon Lim`;
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
      item.append(
        makeTextElement('p', 'comment-meta', `${comment.author_name} · ${formatDate(comment.created_at)}`),
        makeTextElement('p', 'comment-body', comment.body),
      );
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

  function openEditor(post = null) {
    if (!hasActiveSession()) {
      openAuth();
      return;
    }

    editorForm.reset();
    editorStatus.textContent = '';
    editorForm.elements.namedItem('id').value = post?.id || '';
    editorForm.elements.namedItem('title').value = post?.title || '';
    editorForm.elements.namedItem('summary').value = post?.summary || '';
    editorForm.elements.namedItem('body').value = post?.body || '';
    editorTitle.textContent = post ? 'Edit post' : 'New post';
    editorForm.querySelector('button[type="submit"]').textContent = post ? 'Save changes' : 'Publish';
    showView('editor');
    editorForm.elements.namedItem('title').focus();
  }

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
      openEditor();
    } catch (error) {
      console.error(error);
      authStatus.textContent = 'Incorrect username or password.';
    } finally {
      submit.disabled = false;
    }
  });

  editorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!hasActiveSession()) {
      saveSession(null);
      openAuth();
      return;
    }

    const submit = editorForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    editorStatus.textContent = 'Saving…';
    try {
      const rows = await savePost(new FormData(editorForm));
      await loadPosts();
      const saved = Array.isArray(rows) ? rows[0] : null;
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
      submit.disabled = false;
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
  syncAuthUi();
  loadPosts().then(route);
}());
