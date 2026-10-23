import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { EditorState, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  placeholder as placeholderExtension,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { SyntaxNode } from '@lezer/common';
import './MarkdownEditor.css';

export interface MarkdownEditorHandle {
  /** Focuses the editor with the caret at the start of the text. */
  focusStart: () => void;
}

interface MarkdownEditorProps {
  /** Text loaded at mount. Later changes are ignored; remount by key to load another note. */
  initialValue: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
  ref?: Ref<MarkdownEditorHandle>;
}

/*
 * Formatting is drawn from the Lezer Markdown syntax tree with CodeMirror
 * decorations. The document stays plain Markdown text: nothing is converted to
 * HTML, so pasted or typed markup is only ever shown as text.
 *
 * Syntax marks (#, *, `, link targets, >) are hidden on lines away from the
 * caret and shown, muted, on the line being edited. With the editor blurred,
 * every line is shown formatted.
 */

const mark = (cls: string) => Decoration.mark({ class: cls });
const line = (cls: string) => Decoration.line({ class: cls });
const hide = Decoration.replace({});

const SYNTAX = mark('cm-md-syntax');
const EMPHASIS = mark('cm-md-em');
const STRONG = mark('cm-md-strong');
const STRIKE = mark('cm-md-strike');
const INLINE_CODE = mark('cm-md-code');
const LINK = mark('cm-md-link');
const BULLET = mark('cm-md-bullet');
const BULLET_SOURCE = mark('cm-md-bullet-source');
const ORDINAL = mark('cm-md-ordinal');
const TASK_OPEN = mark('cm-md-task');
const TASK_DONE = mark('cm-md-task cm-md-task--done');
const DONE_TEXT = mark('cm-md-done');
const QUOTE_LINE = line('cm-md-quote');
const HR_LINE = line('cm-md-hr');
const HEADING_LINES = [1, 2, 3, 4, 5, 6].map((level) => line(`cm-md-heading cm-md-h${level}`));
const CODE_LINE = line('cm-md-codeblock');
const CODE_FIRST = line('cm-md-codeblock cm-md-codeblock--first');
const CODE_LAST = line('cm-md-codeblock cm-md-codeblock--last');
const CODE_ONLY = line('cm-md-codeblock cm-md-codeblock--first cm-md-codeblock--last');

/** Line numbers touched by a selection, or none when the editor is blurred. */
function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>();
  if (!view.hasFocus) return lines;
  const { doc, selection } = view.state;
  for (const range of selection.ranges) {
    const last = doc.lineAt(range.to).number;
    for (let n = doc.lineAt(range.from).number; n <= last; n++) lines.add(n);
  }
  return lines;
}

function buildDecorations(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const active = activeLines(view);
  const decorations: Range<Decoration>[] = [];

  const isActive = (pos: number) => active.has(doc.lineAt(pos).number);
  const sameLine = (from: number, to: number) => doc.lineAt(from).number === doc.lineAt(to).number;

  /** Hides a syntax mark away from the caret, mutes it on the active line. */
  const syntax = (from: number, to: number, trailingSpace = false) => {
    if (from >= to) return;
    if (isActive(from)) {
      decorations.push(SYNTAX.range(from, to));
      return;
    }
    const end = trailingSpace && doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;
    if (sameLine(from, end)) decorations.push(hide.range(from, end));
  };

  const eachLine = (from: number, to: number, decorate: (lineFrom: number) => void) => {
    const last = doc.lineAt(to).number;
    for (let n = doc.lineAt(from).number; n <= last; n++) decorate(doc.line(n).from);
  };

  const children = (node: SyntaxNode, name: string) => {
    const found: SyntaxNode[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === name) found.push(child);
    }
    return found;
  };

  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (ref) => {
        const { name, node } = ref;
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name);
        if (heading) {
          const deco = HEADING_LINES[Number(heading[1]) - 1];
          eachLine(ref.from, ref.to, (lineFrom) => decorations.push(deco.range(lineFrom)));
          return;
        }

        switch (name) {
          case 'HeaderMark':
            if (node.parent?.name.startsWith('ATX')) syntax(ref.from, ref.to, true);
            else decorations.push(SYNTAX.range(ref.from, ref.to));
            return;
          case 'Emphasis':
            decorations.push(EMPHASIS.range(ref.from, ref.to));
            return;
          case 'StrongEmphasis':
            decorations.push(STRONG.range(ref.from, ref.to));
            return;
          case 'Strikethrough':
            decorations.push(STRIKE.range(ref.from, ref.to));
            return;
          case 'EmphasisMark':
          case 'StrikethroughMark':
            syntax(ref.from, ref.to);
            return;
          case 'InlineCode':
            decorations.push(INLINE_CODE.range(ref.from, ref.to));
            return;
          case 'CodeMark':
            if (node.parent?.name === 'InlineCode') syntax(ref.from, ref.to);
            else decorations.push(SYNTAX.range(ref.from, ref.to));
            return;
          case 'CodeInfo':
            decorations.push(SYNTAX.range(ref.from, ref.to));
            return;
          case 'FencedCode':
          case 'CodeBlock': {
            const first = doc.lineAt(ref.from).number;
            const last = doc.lineAt(ref.to).number;
            for (let n = first; n <= last; n++) {
              const deco =
                first === last ? CODE_ONLY : n === first ? CODE_FIRST : n === last ? CODE_LAST : CODE_LINE;
              decorations.push(deco.range(doc.line(n).from));
            }
            return;
          }
          case 'Link': {
            const marks = children(node, 'LinkMark');
            if (marks.length < 2) return;
            const [open, close] = marks;
            if (close.from > open.to) decorations.push(LINK.range(open.to, close.from));
            syntax(open.from, open.to);
            // Hide "](target)" as one span; reference and bare links keep their text.
            if (ref.to > close.to && sameLine(close.from, ref.to)) syntax(close.from, ref.to);
            else syntax(close.from, close.to);
            return false;
          }
          case 'Image':
          case 'URL':
          case 'Autolink':
          case 'LinkReference':
            decorations.push(SYNTAX.range(ref.from, ref.to));
            return false;
          case 'Blockquote':
            eachLine(ref.from, ref.to, (lineFrom) => decorations.push(QUOTE_LINE.range(lineFrom)));
            return;
          case 'QuoteMark':
            syntax(ref.from, ref.to, true);
            return;
          case 'ListMark': {
            const ordered = node.parent?.parent?.name === 'OrderedList';
            // A task item draws its box in place of the bullet.
            if (!ordered && node.parent?.getChild('Task')) syntax(ref.from, ref.to, true);
            else decorations.push((ordered ? ORDINAL : isActive(ref.from) ? BULLET_SOURCE : BULLET).range(ref.from, ref.to));
            return;
          }
          case 'TaskMarker': {
            const done = /x/i.test(doc.sliceString(ref.from, ref.to));
            const taskEnd = node.parent?.to ?? ref.to;
            if (done && taskEnd > ref.to) decorations.push(DONE_TEXT.range(ref.to, taskEnd));
            if (isActive(ref.from)) decorations.push(SYNTAX.range(ref.from, ref.to));
            else decorations.push((done ? TASK_DONE : TASK_OPEN).range(ref.from, ref.to));
            return;
          }
          case 'HorizontalRule':
            if (isActive(ref.from)) decorations.push(SYNTAX.range(ref.from, ref.to));
            else decorations.push(HR_LINE.range(doc.lineAt(ref.from).from));
            return;
          case 'HTMLBlock':
          case 'HTMLTag':
          case 'Escape':
          case 'Entity':
            decorations.push(SYNTAX.range(ref.from, ref.to));
            return;
          default:
            return;
        }
      },
    });
  }

  return Decoration.set(decorations, true);
}

const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    eventHandlers: {
      // A rendered task box toggles between "[ ]" and "[x]" in the source.
      mousedown(event, view) {
        const target = event.target;
        if (event.button !== 0 || !(target instanceof HTMLElement)) return false;
        const box = target.closest('.cm-md-task');
        if (!box) return false;
        const from = view.posAtDOM(box);
        const marker = view.state.doc.sliceString(from, from + 3);
        if (!/^\[[ xX]\]$/.test(marker)) return false;
        view.dispatch({ changes: { from: from + 1, to: from + 2, insert: marker[1] === ' ' ? 'x' : ' ' } });
        event.preventDefault();
        return true;
      },
    },
  },
);

function extensions(label: string, placeholder: string | undefined, onDocChange: (doc: string) => void): Extension {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage }),
    markdownDecorations,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      'aria-label': label,
      spellcheck: 'true',
      autocorrect: 'on',
      autocapitalize: 'sentences',
    }),
    placeholder ? placeholderExtension(placeholder) : [],
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onDocChange(update.state.doc.toString());
    }),
  ];
}

/**
 * Markdown body editor. The source text is edited in place and drawn with its
 * formatting. Uncontrolled after mount: remount it (by key) to load a
 * different note.
 */
export function MarkdownEditor({ initialValue, onChange, label, placeholder, className, ref }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initial = useRef({ initialValue, label, placeholder });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { initialValue: doc, label: ariaLabel, placeholder: hint } = initial.current;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc,
        extensions: extensions(ariaLabel, hint, (next) => onChangeRef.current(next)),
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focusStart: () => {
        const view = viewRef.current;
        if (!view) return;
        view.focus();
        view.dispatch({ selection: { anchor: 0 }, scrollIntoView: true });
      },
    }),
    [],
  );

  return <div ref={hostRef} className={className ? `nwm-md ${className}` : 'nwm-md'} />;
}
