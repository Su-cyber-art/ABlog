'use strict';

const { basicSetup, EditorView } = require('codemirror');
const { markdown } = require('@codemirror/lang-markdown');
const { mdToHtml } = require('../lib/md');

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    minHeight: '460px',
    color: 'var(--color-text)',
    backgroundColor: 'var(--color-surface)'
  },
  '&.cm-focused': { outline: '2px solid var(--color-accent-300)', outlineOffset: '-2px' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-body)',
    fontSize: '14px',
    lineHeight: '1.9'
  },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--color-accent)' },
  '.cm-line': { padding: '0 22px' },
  '.cm-gutters': {
    color: 'color-mix(in srgb, var(--color-text) 38%, transparent)',
    backgroundColor: 'var(--color-neutral-100)',
    border: '0'
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--color-accent-100)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--color-accent-200) !important'
  }
});

function mountEditor(textarea) {
  if (!textarea || textarea.dataset.enhanced === 'true') return null;

  const host = document.createElement('div');
  host.className = 'ed-codemirror';
  textarea.before(host);

  const view = new EditorView({
    doc: textarea.value,
    extensions: [
      basicSetup,
      markdown(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({
        'aria-label': textarea.getAttribute('aria-label') || 'Markdown'
      }),
      editorTheme,
      EditorView.updateListener.of(update => {
        if (!update.docChanged) return;
        textarea.value = update.state.doc.toString();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      })
    ],
    parent: host
  });

  textarea.dataset.enhanced = 'true';
  textarea.classList.add('ed-textarea--enhanced');

  return {
    getValue() {
      return view.state.doc.toString();
    },
    setValue(value) {
      const next = String(value || '');
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    },
    focus() {
      view.focus();
    }
  };
}

window.MoMD = { mdToHtml };
window.MoEditor = { mount: mountEditor };
require('../public/js/admin');
