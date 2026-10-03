(function () {
  'use strict';

  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const scopes = new WeakMap();
  let scopeNumber = 0;

  function formatFootnote(id, body) {
    const lines = String(body).trim().split('\n');
    return `[^${id}]: ${lines.shift() || ''}${lines.map(line => `\n    ${line}`).join('')}`;
  }

  function footnoteDefinition(src) {
    const first = /^ {0,3}\[\^([\w-]+)\]:[ \t]*([^\n]*)(?:\n|$)/.exec(src);
    if (!first) return;
    let raw = first[0];
    let body = first[2];
    while (raw.length < src.length) {
      const continuation = /^(?:[ \t]*\n)*?(?: {4}|\t)([^\n]*)(?:\n|$)/.exec(src.slice(raw.length));
      if (!continuation) break;
      const breaks = (continuation[0].match(/\n/g) || []).length;
      body += '\n'.repeat(Math.max(1, breaks)) + continuation[1];
      raw += continuation[0];
    }
    return { type: 'blogFootnoteDefinition', raw, id: first[1], body: body.trim() };
  }

  // Length-matched fences allow nested toggles without interpreting code fences.
  function toggleToken(src) {
    const start = /^ {0,3}(:{3,})toggle(?:[ \t]+([^\n]*))?\r?\n/.exec(src);
    if (!start) return;
    let offset = start[0].length;
    let depth = 1;
    let codeFence = null;
    for (const line of src.slice(offset).match(/[^\n]*(?:\n|$)/g) || []) {
      if (!line) break;
      const trimmed = line.trim();
      const code = /^(`{3,}|~{3,})/.exec(trimmed);
      if (codeFence) {
        if (new RegExp(`^${codeFence[0]}{${codeFence.length},}\\s*$`).test(trimmed)) codeFence = null;
      } else if (code) {
        codeFence = code[1];
      } else if (trimmed.startsWith(start[1] + 'toggle') && /^toggle(?:\s|$)/.test(trimmed.slice(start[1].length))) {
        depth += 1;
      } else if (trimmed === start[1] && --depth === 0) {
        return { type: 'blogToggle', raw: src.slice(0, offset + line.length),
          title: (start[2] || '').trim(), text: src.slice(start[0].length, offset) };
      }
      offset += line.length;
    }
  }

  function render(container, source, options = {}) {
    source = String(source || '');
    if (!window.marked || !window.DOMPurify || !window.katex) {
      container.textContent = source;
      container.style.whiteSpace = 'pre-wrap';
      return { available: false, mathErrors: 0 };
    }
    container.style.whiteSpace = '';
    const equations = [];
    const definitions = new Map();
    const notes = new Map();
    let insideNote = false;
    const mathPlaceholder = (token) => {
      const index = equations.push({ text: token.text, display: token.display }) - 1;
      const tag = token.display ? 'div' : 'span';
      return `<${tag} class="${token.display ? 'math-block' : 'math-inline'}" data-blog-math="${index}"></${tag}>`;
    };

    // Parse math before Markdown so underscores, backslashes and matrices survive unchanged.
    // Code fences and inline code keep Marked's built-in tokenization.
    const parser = new window.marked.Marked({
      gfm: true,
      breaks: true,
      renderer: {
        html(token) { return escapeHtml(token.text); },
        checkbox(token) { return `<span data-blog-task="${Boolean(token.checked)}">${token.checked ? '☑' : '☐'}</span>${options.editor ? '' : ' '}`; },
      },
      extensions: [
        {
          name: 'blogFootnoteDefinition', level: 'block',
          start(src) { return src.search(/(?:^|\n) {0,3}\[\^[\w-]+\]:/); },
          tokenizer(src) {
            if (insideNote) return;
            const token = footnoteDefinition(src);
            if (token && !definitions.has(token.id)) definitions.set(token.id, token.body);
            return token;
          },
          renderer() { return ''; },
        },
        {
          name: 'blogFootnoteReference', level: 'inline',
          start(src) { return src.indexOf('[^'); },
          tokenizer(src) {
            const match = /^\[\^([\w-]+)\]/.exec(src);
            if (match) return { type: 'blogFootnoteReference', raw: match[0], id: match[1] };
          },
          renderer(token) {
            if (insideNote || !definitions.has(token.id)) return escapeHtml(token.raw);
            if (!notes.has(token.id)) notes.set(token.id, { number: notes.size + 1, body: definitions.get(token.id) });
            return `<sup data-blog-footnote="${notes.get(token.id).number}"></sup>`;
          },
        },
        {
          name: 'blogToggle', level: 'block',
          start(src) { return src.search(/(?:^|\n) {0,3}:{3,}toggle(?:\s|$)/); },
          tokenizer(src) {
            const token = toggleToken(src);
            if (token) {
              token.tokens = this.lexer.blockTokens(token.text);
              token.summaryTokens = this.lexer.inlineTokens(token.title || 'Toggle');
              return token;
            }
          },
          renderer(token) {
            return `<details class="blog-toggle"><summary>${this.parser.parseInline(token.summaryTokens)}</summary><div data-type="detailsContent">${this.parser.parse(token.tokens)}</div></details>`;
          },
        },
        {
          name: 'blockMath',
          level: 'block',
          start(src) { return src.search(/(?:^|\n) {0,3}(?:\$\$|\\\[)/); },
          tokenizer(src) {
            const match = /^ {0,3}\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src)
              || /^ {0,3}\\\[([\s\S]+?)\\\][ \t]*(?:\n|$)/.exec(src);
            if (match) return { type: 'blockMath', raw: match[0], text: match[1].trim(), display: true };
          },
          renderer: mathPlaceholder,
        },
        {
          name: 'inlineMath',
          level: 'inline',
          start(src) { return src.search(/\$|\\\(/); },
          tokenizer(src) {
            let match = /^\$\$([\s\S]+?)\$\$/.exec(src);
            if (match) return { type: 'inlineMath', raw: match[0], text: match[1].trim(), display: true };
            match = /^\\\(([\s\S]+?)\\\)/.exec(src);
            if (!match) {
              match = /^\$((?:\\.|[^\\$\n])+?)\$(?!\d)/.exec(src);
              if (match && (/^\s|\s$/.test(match[1]))) return;
            }
            if (match) return { type: 'inlineMath', raw: match[0], text: match[1], display: false };
          },
          renderer(token) {
            // Inline display equations remain spans to keep paragraph markup valid.
            const index = equations.push({ text: token.text, display: token.display }) - 1;
            return `<span class="${token.display ? 'math-block' : 'math-inline'}" data-blog-math="${index}"></span>`;
          },
        },
      ],
    });

    let html = parser.parse(source);
    if (!options.editor && notes.size) {
      insideNote = true;
      html += '<section class="blog-footnotes" aria-label="Footnotes"><h2>Footnotes</h2><ol>';
      for (const note of notes.values()) html += `<li data-blog-note="${note.number}">${parser.parse(note.body)}</li>`;
      html += '</ol></section>';
      insideNote = false;
    }
    container.innerHTML = window.DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['data-blog-math', 'data-blog-task', 'data-blog-footnote', 'data-blog-note', 'data-type'],
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea'],
      FORBID_ATTR: ['style', 'id', 'name'],
    });

    if (!scopes.has(container)) scopes.set(container, ++scopeNumber);
    const prefix = `blog-notes-${scopes.get(container)}`;
    const jump = (link, target) => {
      link.href = `#${target.id}`;
      link.addEventListener('click', event => {
        event.preventDefault(); // Do not replace the blog's #post/... route.
        for (let parent = target.parentElement; parent; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS') parent.open = true;
        }
        target.scrollIntoView({ block: 'center' });
        target.focus({ preventScroll: true });
      });
    };
    for (const [id, note] of notes) {
      const refs = container.querySelectorAll(`[data-blog-footnote="${note.number}"]`);
      const entry = container.querySelector(`[data-blog-note="${note.number}"]`);
      if (entry) { entry.id = `${prefix}-${note.number}`; entry.tabIndex = -1; }
      refs.forEach((ref, index) => {
        if (options.editor) {
          ref.dataset.type = 'footnote';
          ref.dataset.noteId = id;
          ref.dataset.noteBody = note.body;
          ref.textContent = String(note.number);
        } else {
          const link = document.createElement('a');
          link.id = `${prefix}-ref-${note.number}-${index + 1}`;
          link.textContent = String(note.number);
          link.setAttribute('aria-label', `Footnote ${note.number}`);
          link.setAttribute('role', 'doc-noteref');
          ref.className = 'blog-footnote-ref';
          ref.append(link);
          jump(link, entry);
          const back = document.createElement('a');
          back.className = 'footnote-backlink';
          back.textContent = refs.length > 1 ? `↩${index + 1}` : '↩';
          back.setAttribute('aria-label', `Back to reference ${note.number}${refs.length > 1 ? ` (${index + 1})` : ''}`);
          back.setAttribute('role', 'doc-backlink');
          jump(back, link);
          entry.append(back);
        }
        ref.removeAttribute('data-blog-footnote');
      });
    }
    if (options.editor) {
      // Keep unused definitions available for later references and Markdown export.
      for (const [id, body] of definitions) {
        if (notes.has(id)) continue;
        const node = document.createElement('div');
        node.dataset.type = 'footnoteDefinition';
        node.dataset.noteId = id;
        node.dataset.noteBody = body;
        node.textContent = `Unused footnote [${id}]: ${body}`;
        container.append(node);
      }
    }

    if (options.editor) {
      const taskLists = new Set();
      container.querySelectorAll('[data-blog-task]').forEach(marker => {
        const item = marker.closest('li');
        if (!item) return;
        item.dataset.type = 'taskItem';
        item.dataset.checked = marker.dataset.blogTask;
        taskLists.add(item.parentElement);
        marker.remove();
      });
      // Split mixed task/bullet lists so normal bullets retain their meaning.
      [...taskLists].reverse().forEach(list => {
        let group;
        let previousKind;
        for (const item of [...list.children]) {
          const kind = item.dataset.type === 'taskItem' ? 'task' : 'bullet';
          if (kind !== previousKind) {
            group = document.createElement(list.tagName);
            if (kind === 'task') group.dataset.type = 'taskList';
            list.before(group);
          }
          group.append(item);
          previousKind = kind;
        }
        list.remove();
      });
    }

    let mathErrors = 0;
    container.querySelectorAll('[data-blog-math]').forEach((node) => {
      const equation = equations[Number(node.dataset.blogMath)];
      if (!equation) return;
      if (options.editor) {
        node.setAttribute('data-type', equation.display && node.tagName === 'DIV' ? 'block-math' : 'inline-math');
        node.setAttribute('data-latex', equation.text);
        node.removeAttribute('data-blog-math');
        return;
      }
      try {
        window.katex.render(equation.text, node, {
          displayMode: equation.display,
          throwOnError: true,
          trust: false,
          strict: 'ignore',
          maxExpand: 500,
          maxSize: 20,
          output: 'htmlAndMathml',
        });
      } catch (_error) {
        node.textContent = equation.text;
        node.classList.add('math-error');
        node.title = 'Check this LaTeX expression.';
        mathErrors += 1;
      }
      node.removeAttribute('data-blog-math');
    });
    container.querySelectorAll('a').forEach((link) => {
      link.rel = 'noopener noreferrer';
    });
    return { available: true, mathErrors };
  }

  function editorHTML(source) {
    const container = document.createElement('div');
    render(container, source, { editor: true });
    return container.innerHTML;
  }

  window.BlogMarkdown = Object.freeze({ render, editorHTML, formatFootnote });
}());
