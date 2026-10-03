// Build with `npm run build:editor`. The checked-in bundle runs on GitHub Pages.
import { Editor, Node, InputRule, mergeAttributes } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { DOMSerializer } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import StarterKit from '@tiptap/starter-kit';
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from '@tiptap/markdown';

const Toggle = Details.extend({
  renderMarkdown(node, helpers) {
    const title = helpers.renderChildren(node.content?.[0]?.content || []).replace(/\n/g, ' ');
    const body = helpers.renderChildren(node.content?.[1]?.content || [], '\n\n');
    const lengths = [...body.matchAll(/^\s*(:{3,})/gm)].map((match) => match[1].length);
    const fence = ':'.repeat(Math.max(2, ...lengths) + 1);
    return `${fence}toggle ${title || 'Toggle'}\n\n${body}\n\n${fence}`;
  },
  addInputRules() {
    return [new InputRule({
      find: /^(?:\/toggle|\/접기)\s$/,
      handler: ({ chain, range }) => { chain().deleteRange(range).setDetails().updateAttributes('details', { open: true }).run(); },
    })];
  },
}).configure({
  persist: true,
  renderToggleButton({ element, isOpen }) {
    element.textContent = '▸';
    element.setAttribute('aria-label', isOpen ? 'Collapse toggle' : 'Expand toggle');
    element.setAttribute('aria-expanded', String(isOpen));
    element.setAttribute('contenteditable', 'false');
  },
});

const BlogDocument = Node.create({
  name: 'doc', topNode: true, content: 'block+',
  renderMarkdown(node, helpers) {
    const notes = new Map();
    const visit = current => {
      if (['footnote', 'footnoteDefinition'].includes(current.type) && !notes.has(current.attrs.id)) notes.set(current.attrs.id, current.attrs.body);
      current.content?.forEach(visit);
    };
    visit(node);
    const body = helpers.renderChildren(node.content || [], '\n\n');
    if (!notes.size) return body;
    return body.trimEnd() + '\n\n' + [...notes].map(([id, text]) => window.BlogMarkdown.formatFootnote(id, text)).join('\n\n');
  },
});

function footnoteNode(editNote, definition = false) {
  const name = definition ? 'footnoteDefinition' : 'footnote';
  const tag = definition ? 'div' : 'sup';
  return Node.create({
    name, group: definition ? 'block' : 'inline', inline: !definition, atom: true, marks: '',
    addAttributes() {
      return {
        id: { default: '', parseHTML: el => el.dataset.noteId, renderHTML: attrs => ({ 'data-note-id': attrs.id }) },
        body: { default: '', parseHTML: el => el.dataset.noteBody, renderHTML: attrs => ({ 'data-note-body': attrs.body }) },
      };
    },
    parseHTML() { return [{ tag: `${tag}[data-type="${name}"]` }]; },
    renderHTML({ HTMLAttributes }) { return [tag, mergeAttributes(HTMLAttributes, { 'data-type': name })]; },
    renderMarkdown(node) { return definition ? '' : `[^${node.attrs.id}]`; },
    addNodeView() {
      return ({ node, getPos, editor }) => {
        const dom = document.createElement(tag);
        dom.className = definition ? 'editor-unused-footnote' : 'editor-footnote-ref';
        dom.contentEditable = 'false';
        dom.tabIndex = 0;
        dom.setAttribute('role', 'button');
        let current = node;
        const render = () => {
          dom.dataset.noteId = current.attrs.id;
          dom.title = current.attrs.body;
          if (definition) dom.textContent = `Unused footnote [${current.attrs.id}]: ${current.attrs.body}`;
          else if (!dom.textContent) dom.textContent = '…';
          dom.setAttribute('aria-label', definition ? 'Edit unused footnote' : 'Edit footnote');
        };
        const edit = () => {
          const pos = getPos();
          if (editor.isEditable && typeof pos === 'number') editNote?.(current.attrs.body, pos);
        };
        dom.addEventListener('click', edit);
        dom.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); edit(); } });
        render();
        return { dom, update(next) { if (next.type !== current.type) return false; current = next; render(); return true; }, stopEvent: () => true };
      };
    },
  });
}

function mathSource(node, block) {
  const latex = (node.content || []).map(child => child.text || '').join('');
  return block ? `$$\n${latex}\n$$` : `${node.attrs?.display ? '$$' : '$'}${latex}${node.attrs?.display ? '$$' : '$'}`;
}

function mathNode(block) {
  const name = block ? 'blockMath' : 'inlineMath';
  const kind = block ? 'block-math' : 'inline-math';
  const tag = block ? 'div' : 'span';
  return Node.create({
    name, group: block ? 'block' : 'inline', inline: !block,
    content: 'text*', marks: '', code: true,
    addAttributes() { return { display: { default: block, parseHTML: el => el.dataset.display === 'true', renderHTML: attrs => ({ 'data-display': String(attrs.display) }) } }; },
    parseHTML() { return [{ tag: `${tag}[data-type="${kind}"]`, preserveWhitespace: 'full' }]; },
    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes, { 'data-type': kind, class: `editor-math math-source${block ? ' math-source-block' : ''}`, spellcheck: 'false' }), 0];
    },
    renderMarkdown(node) { return mathSource(node, block); },
    renderText({ node }) { return mathSource(node.toJSON(), block); },
    addInputRules() {
      return [new InputRule({
        find: block ? /^\$\$([^$]+)\$\$$/ : /(?<!\$)\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          if (/^\s|\s$/.test(match[1]) || !block && /^\d+\s/.test(match[1])) return null;
          const node = this.type.create(null, state.schema.text(match[1]));
          const $from = state.tr.doc.resolve(range.from);
          const $to = state.tr.doc.resolve(range.to);
          if (block && $from.sameParent($to) && $from.parentOffset === 0 && $to.parentOffset === $to.parent.content.size) {
            state.tr.replaceWith($from.before(), $to.after(), node);
          } else state.tr.replaceRangeWith(range.from, range.to, node);
        },
      })];
    },
    addKeyboardShortcuts() {
      const exit = () => {
        const { $from } = this.editor.state.selection;
        if ($from.parent.type.name !== name) return false;
        if (block) {
          const next = this.editor.state.doc.nodeAt($from.after());
          if (next?.isTextblock && !next.type.spec.code) return this.editor.commands.setTextSelection($from.after() + 1);
          return this.editor.commands.exitCode();
        }
        return this.editor.commands.setTextSelection($from.after());
      };
      return {
        'Mod-Enter': exit,
        Enter: () => {
          if (this.editor.state.selection.$from.parent.type.name !== name) return false;
          if (block) return this.editor.commands.command(({ tr }) => { tr.insertText('\n'); return true; });
          exit(); return this.editor.commands.splitBlock();
        },
        ArrowRight: () => {
          const { empty, $from } = this.editor.state.selection;
          return !block && empty && $from.parent.type.name === name && $from.parentOffset === $from.parent.content.size ? exit() : false;
        },
        ArrowLeft: () => {
          const { empty, $from } = this.editor.state.selection;
          return !block && empty && $from.parent.type.name === name && $from.parentOffset === 0 ? this.editor.commands.setTextSelection($from.before()) : false;
        },
      };
    },
  });
}

export function create({ element, onChange, onFootnote, onError }) {
  let currentSource = null;
  const editor = new Editor({
    element,
    injectCSS: false,
    extensions: [
      StarterKit.configure({ document: false, link: { openOnClick: false, autolink: false }, underline: false }),
      BlogDocument, footnoteNode(onFootnote), footnoteNode(onFootnote, true),
      Toggle, DetailsSummary.extend({ content: 'inline*' }), DetailsContent,
      TableKit.configure({ table: { resizable: false } }),
      Image.configure({ inline: true, allowBase64: false }),
      TaskList, TaskItem.configure({ nested: true }),
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node }) => node.type.name === 'detailsSummary' ? 'Toggle title' : 'Write, or type /toggle…',
      }),
      mathNode(false), mathNode(true),
      Markdown,
    ],
    editorProps: {
      attributes: { class: 'prose block-editor', 'aria-label': 'Post body', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' },
      clipboardTextSerializer(slice, view) {
        const { $from, $to } = view.state.selection;
        // A selection within LaTeX/code is literal text. Larger selections carry
        // Markdown delimiters, including equations and footnote definitions.
        if ($from.sameParent($to) && $from.parent.type.spec.code) return view.state.doc.textBetween($from.pos, $to.pos);
        return editor.markdown.serialize({ type: 'doc', content: slice.content.toJSON() || [] });
      },
      // Keep external pasted HTML out of the document. Markdown/plain text is
      // imported through the same sanitizer used by the public reading view.
      handlePaste(view, event) {
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;
        event.preventDefault();
        if (view.state.selection.$from.parent.type.spec.code) editor.commands.insertContent({ type: 'text', text });
        else editor.commands.insertContent(window.BlogMarkdown.editorHTML(text), { parseOptions: { preserveWhitespace: 'full' } });
        return true;
      },
    },
    onUpdate() {
      try { currentSource = editor.getMarkdown(); onChange(currentSource); }
      catch (error) { onError(error); }
    },
  });
  // Rich-text destinations may prefer text/html over text/plain. Include the
  // delimiters there too, without copying KaTeX's visual/MathML duplicates.
  editor.setOptions({ editorProps: { ...editor.options.editorProps, clipboardSerializer: new DOMSerializer({
    ...DOMSerializer.nodesFromSchema(editor.schema),
    inlineMath: node => ['span', {}, mathSource(node.toJSON(), false)],
    blockMath: node => ['pre', {}, mathSource(node.toJSON(), true)],
  }, DOMSerializer.marksFromSchema(editor.schema)) } });
  const numberFootnotes = () => {
    const numbers = new Map();
    editor.state.doc.descendants(node => {
      if (node.type.name === 'footnote' && !numbers.has(node.attrs.id)) numbers.set(node.attrs.id, numbers.size + 1);
    });
    element.querySelectorAll('.editor-footnote-ref').forEach(ref => {
      const number = numbers.get(ref.dataset.noteId);
      if (ref.textContent !== String(number)) ref.textContent = String(number);
      ref.setAttribute('aria-label', `Edit footnote ${number}`);
    });
  };
  editor.on('transaction', numberFootnotes);
  const historyBoundary = () => editor.view.dispatch(closeHistory(editor.state.tr));
  return {
    editor,
    load(source, reset = false) {
      if (!reset && source === currentSource) return;
      // Recreate the view's state to clear undo history between different posts.
      editor.commands.setContent(window.BlogMarkdown.editorHTML(source), { emitUpdate: false, parseOptions: { preserveWhitespace: 'full' } });
      const state = editor.state;
      editor.view.updateState(state.constructor.create({ schema: state.schema, doc: state.doc, plugins: state.plugins }));
      currentSource = source;
      numberFootnotes();
    },
    focus() { editor.commands.focus(); },
    setEditable(value) { editor.setEditable(value, false); },
    toggle() {
      const selection = editor.state.selection;
      // Wrap the selected/current block, preserving text rather than deleting it.
      if (selection.$from.parent.type.name === 'detailsSummary') {
        editor.commands.focus(); return;
      }
      historyBoundary();
      editor.chain().focus().setDetails().updateAttributes('details', { open: true }).run();
      historyBoundary();
    },
    unwrap() { historyBoundary(); editor.chain().focus().unsetDetails().run(); historyBoundary(); },
    exitToggle() {
      const { $from } = editor.state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name !== 'details') continue;
        const pos = $from.after(depth);
        const tr = editor.state.tr.insert(pos, editor.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, pos + 1));
        editor.view.dispatch(closeHistory(tr)); historyBoundary(); editor.commands.focus(); return;
      }
      editor.commands.focus('end');
    },
    format(name) {
      const chain = editor.chain().focus();
      const commands = { heading: () => chain.toggleHeading({ level: 2 }), bold: () => chain.toggleBold(), italic: () => chain.toggleItalic(), list: () => chain.toggleBulletList(), quote: () => chain.toggleBlockquote(), code: () => chain.toggleCodeBlock(), undo: () => chain.undo(), redo: () => chain.redo() };
      commands[name]?.().run();
    },
    setLink(url) {
      if (!url) editor.chain().focus().extendMarkRange('link').unsetLink().run();
      else if (/^(https?:\/\/|mailto:)/i.test(url)) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      else throw new Error('Use an https://, http://, or mailto: link.');
    },
    equation(latex, block, pos = null) {
      historyBoundary();
      editor.chain().focus().command(({ tr, state }) => {
        if (pos === null && state.selection.$from.parent.type.spec.code) {
          tr.insertText(latex); return true;
        }
        const current = pos === null ? null : tr.doc.nodeAt(pos);
        if (pos !== null && !['blockMath', 'inlineMath'].includes(current?.type.name)) throw new Error('Select the equation again.');
        const type = current?.type || state.schema.nodes[block ? 'blockMath' : 'inlineMath'];
        const node = type.create(current?.attrs, latex ? state.schema.text(latex) : null);
        if (pos !== null) tr.replaceWith(pos, pos + current.nodeSize, node);
        else tr.replaceSelectionWith(node, false);
        // Select the inserted source so a template can be replaced immediately.
        tr.mapping.maps.at(-1)?.forEach((_oldStart, _oldEnd, start, end) => {
          tr.doc.nodesBetween(start, end, (child, at) => {
            if (child === node) tr.setSelection(TextSelection.create(tr.doc, at + 1, at + 1 + node.content.size));
          });
        });
        return true;
      }).run();
      historyBoundary();
    },
    footnote(body, pos = null) {
      historyBoundary();
      if (pos !== null) {
        const current = editor.state.doc.nodeAt(pos);
        if (!current || !['footnote', 'footnoteDefinition'].includes(current.type.name)) throw new Error('Select the footnote again.');
        editor.chain().focus().command(({ tr }) => {
          tr.doc.descendants((node, at) => {
            if (['footnote', 'footnoteDefinition'].includes(node.type.name) && node.attrs.id === current.attrs.id) tr.setNodeMarkup(at, undefined, { ...node.attrs, body });
          });
          return true;
        }).run();
      } else {
        if (editor.state.selection.$to.parent.type.spec.code) throw new Error('Place the cursor in a paragraph, outside the code block.');
        const ids = new Set();
        editor.state.doc.descendants(node => { if (['footnote', 'footnoteDefinition'].includes(node.type.name)) ids.add(node.attrs.id); });
        let index = 1;
        while (ids.has(`note-${index}`)) index++;
        editor.chain().focus().insertContentAt(editor.state.selection.to, { type: 'footnote', attrs: { id: `note-${index}`, body } }).run();
      }
      historyBoundary();
    },
    removeFootnote(pos) {
      const node = editor.state.doc.nodeAt(pos);
      if (!node || !['footnote', 'footnoteDefinition'].includes(node.type.name)) throw new Error('Select the footnote again.');
      historyBoundary();
      editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
      historyBoundary();
    },
    destroy() { editor.destroy(); },
  };
}

window.BlogEditor = Object.freeze({ create });
