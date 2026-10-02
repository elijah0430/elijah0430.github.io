(function () {
  'use strict';

  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));

  function render(container, source) {
    source = String(source || '');
    if (!window.marked || !window.DOMPurify || !window.katex) {
      container.textContent = source;
      container.style.whiteSpace = 'pre-wrap';
      return { available: false, mathErrors: 0 };
    }
    container.style.whiteSpace = '';
    const equations = [];
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
      renderer: { html(token) { return escapeHtml(token.text); } },
      extensions: [
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

    container.innerHTML = window.DOMPurify.sanitize(parser.parse(source), {
      USE_PROFILES: { html: true },
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['data-blog-math'],
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea'],
      FORBID_ATTR: ['style', 'id', 'name'],
    });

    let mathErrors = 0;
    container.querySelectorAll('[data-blog-math]').forEach((node) => {
      const equation = equations[Number(node.dataset.blogMath)];
      if (!equation) return;
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

  window.BlogMarkdown = Object.freeze({ render });
}());
