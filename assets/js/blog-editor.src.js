// Build with `npm run build:editor`. The checked-in bundle runs on GitHub Pages.
import { Editor, Node, InputRule, mergeAttributes } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
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

function mathNode(block, editMath) {
  const name = block ? 'blockMath' : 'inlineMath';
  const kind = block ? 'block-math' : 'inline-math';
  const tag = block ? 'div' : 'span';
  return Node.create({
    name, group: block ? 'block' : 'inline', inline: !block, atom: true,
    addAttributes() { return { latex: { default: '', parseHTML: el => el.getAttribute('data-latex'), renderHTML: attrs => ({ 'data-latex': attrs.latex }) } }; },
    parseHTML() { return [{ tag: `${tag}[data-type="${kind}"]` }]; },
    renderHTML({ HTMLAttributes }) { return [tag, mergeAttributes(HTMLAttributes, { 'data-type': kind })]; },
    renderMarkdown(node) { return block ? `$$\n${node.attrs.latex}\n$$` : `$${node.attrs.latex}$`; },
    addInputRules() {
      return [new InputRule({
        find: block ? /^\$\$([^$]+)\$\$$/ : /(?<!\$)\$([^$\n]+)\$$/,
        handler: ({ state, range, match }) => {
          if (/^\s|\s$/.test(match[1]) || !block && /^\d+\s/.test(match[1])) return null;
          const node = this.type.create({ latex: match[1] });
          state.tr.replaceWith(range.from, range.to, node);
        },
      })];
    },
    addNodeView() {
      return ({ node, getPos, editor }) => {
        const dom = document.createElement(tag);
        dom.className = `editor-math ${block ? 'math-block' : 'math-inline'}`;
        dom.contentEditable = 'false';
        dom.setAttribute('role', 'button');
        dom.setAttribute('tabindex', '0');
        dom.setAttribute('aria-label', 'Edit equation');
        let current = node;
        const render = () => {
          try { window.katex.render(current.attrs.latex, dom, { displayMode: block, throwOnError: true, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 20 }); }
          catch (_) { dom.textContent = current.attrs.latex; dom.classList.add('math-error'); }
        };
        const edit = () => {
          const pos = getPos();
          if (editor.isEditable && typeof pos === 'number') editMath(current.attrs.latex, block, pos);
        };
        dom.addEventListener('click', edit);
        dom.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); edit(); } });
        render();
        return { dom, update(next) { if (next.type !== current.type) return false; current = next; dom.classList.remove('math-error'); render(); return true; }, stopEvent: () => true };
      };
    },
  });
}

export function create({ element, onChange, onEquation, onFootnote, onError }) {
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
      mathNode(false, onEquation), mathNode(true, onEquation),
      Markdown,
    ],
    editorProps: {
      attributes: { class: 'prose block-editor', 'aria-label': 'Post body', role: 'textbox', 'aria-multiline': 'true', spellcheck: 'true' },
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
      if (pos !== null) {
        const current = editor.state.doc.nodeAt(pos);
        if (!current || !['blockMath', 'inlineMath'].includes(current.type.name)) throw new Error('Select the equation again.');
        editor.chain().focus().command(({ tr }) => { tr.setNodeMarkup(pos, undefined, { latex }); return true; }).run();
      } else editor.chain().focus().insertContent({ type: block ? 'blockMath' : 'inlineMath', attrs: { latex } }).run();
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
