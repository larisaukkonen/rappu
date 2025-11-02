import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createEditor, Descendant, Transforms, Text, BaseEditor, Editor, Element as SlateElement } from 'slate';
import { Slate, Editable, withReact, ReactEditor } from 'slate-react';
import { withHistory, HistoryEditor } from 'slate-history';
import {
  TextBold24Regular,
  TextItalic24Regular,
  TextUnderline24Regular,
  Code24Regular,
  TextHeader124Regular,
  TextHeader224Regular,
  TextQuote24Regular,
  TextNumberListLtr24Regular,
  TextBulletListLtr24Regular,
} from '@fluentui/react-icons';

export type SlateEditorProps = {
  value: string; // HTML
  onChange: (html: string) => void;
  className?: string;
};

const ToolbarButton: React.FC<{ onMouseDown: (e: React.MouseEvent) => void; title: string } & React.PropsWithChildren> = ({ onMouseDown, title, children }) => (
  <button type="button" title={title} onMouseDown={onMouseDown} className="px-2 py-1 rounded border bg-white text-black hover:bg-zinc-50">
    {children}
  </button>
);

type CustomText = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; code?: boolean };
type CustomElement = { type: string; children: Descendant[] };
declare module 'slate' { interface CustomTypes { Editor: BaseEditor & ReactEditor & HistoryEditor; Element: CustomElement; Text: CustomText } }

const isMarkActive = (editor: Editor, mark: keyof CustomText) => {
  const marks = Editor.marks(editor) as any;
  return marks ? !!marks[mark] : false;
};
const toggleMark = (editor: Editor, mark: keyof CustomText) => {
  const active = isMarkActive(editor, mark);
  if (active) Editor.removeMark(editor, mark);
  else Editor.addMark(editor, mark, true);
};

const LIST_TYPES = ['numbered-list', 'bulleted-list'];
const isBlockActive = (editor: Editor, type: string) => {
  const [m] = Editor.nodes(editor, {
    match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && (n as any).type === type,
  });
  return !!m;
};
const toggleBlock = (editor: Editor, type: string) => {
  const isList = LIST_TYPES.includes(type);
  const isActive = isBlockActive(editor, type);

  // Always unwrap any list containers first
  Transforms.unwrapNodes(editor, {
    match: n => !Editor.isEditor(n) && SlateElement.isElement(n) && LIST_TYPES.includes((n as any).type),
    split: true,
  });

  // Set selected blocks to new type
  Transforms.setNodes(editor, { type: isActive ? 'paragraph' : isList ? 'list-item' : type } as any, {
    match: n => SlateElement.isElement(n) && !Editor.isEditor(n),
  });

  // If creating a list, wrap list-items with the appropriate list container
  if (!isActive && isList) {
    Transforms.wrapNodes(editor, { type, children: [] } as any, {
      match: n => SlateElement.isElement(n) && (n as any).type === 'list-item',
    });
  }
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const serialize = (nodes: Descendant[]): string => nodes.map(n => nodeToHtml(n)).join('');
const nodeToHtml = (node: any): string => {
  if (Text.isText(node)) {
    let s = esc(node.text);
    if (node.bold) s = `<strong>${s}</strong>`;
    if (node.italic) s = `<em>${s}</em>`;
    if (node.underline) s = `<u>${s}</u>`;
    if (node.code) s = `<code>${s}</code>`;
    return s;
  }
  const children = node.children.map((c: any) => nodeToHtml(c)).join('');
  switch (node.type) {
    case 'heading-one': return `<h1>${children}</h1>`;
    case 'heading-two': return `<h2>${children}</h2>`;
    case 'block-quote': return `<blockquote>${children}</blockquote>`;
    case 'numbered-list': return `<ol>${children}</ol>`;
    case 'bulleted-list': return `<ul>${children}</ul>`;
    case 'list-item': return `<li>${children}</li>`;
    case 'code-block': return `<pre><code>${children}</code></pre>`;
    default: return `<p>${children}</p>`;
  }
};

const deserialize = (html: string): Descendant[] => {
  try {
    const d = new DOMParser().parseFromString(html || '<p></p>', 'text/html');
    const walk = (el: Node): Descendant[] => {
      const out: Descendant[] = [];
      el.childNodes.forEach(child => {
        if (child.nodeType === 3) { out.push({ text: String(child.textContent || '') } as any); return; }
        if (!(child instanceof HTMLElement)) return;
        const tag = child.tagName.toLowerCase();
        const kids = walk(child);
        switch (tag) {
          case 'h1': out.push({ type: 'heading-one', children: kids } as any); break;
          case 'h2': out.push({ type: 'heading-two', children: kids } as any); break;
          case 'blockquote': out.push({ type: 'block-quote', children: kids } as any); break;
          case 'ol': out.push({ type: 'numbered-list', children: kids } as any); break;
          case 'ul': out.push({ type: 'bulleted-list', children: kids } as any); break;
          case 'li': out.push({ type: 'list-item', children: kids } as any); break;
          case 'pre': out.push({ type: 'code-block', children: kids } as any); break;
          case 'strong': out.push({ text: child.textContent || '', bold: true } as any); break;
          case 'em': out.push({ text: child.textContent || '', italic: true } as any); break;
          case 'u': out.push({ text: child.textContent || '', underline: true } as any); break;
          case 'code': out.push({ text: child.textContent || '', code: true } as any); break;
          default: out.push({ type: 'paragraph', children: kids } as any); break;
        }
      });
      if (!out.length) out.push({ text: '' } as any);
      return out;
    };
    return walk(d.body);
  } catch { return [{ type: 'paragraph', children: [{ text: '' }] } as any]; }
};

const Element = ({ attributes, children, element }: any) => {
  switch (element.type) {
    case 'heading-one': return <h1 {...attributes}>{children}</h1>;
    case 'heading-two': return <h2 {...attributes}>{children}</h2>;
    case 'block-quote': return <blockquote {...attributes}>{children}</blockquote>;
    case 'numbered-list': return <ol {...attributes}>{children}</ol>;
    case 'bulleted-list': return <ul {...attributes}>{children}</ul>;
    case 'list-item': return <li {...attributes}>{children}</li>;
    case 'code-block': return <pre {...attributes}><code>{children}</code></pre>;
    default: return <p {...attributes}>{children}</p>;
  }
};

const Leaf = ({ attributes, children, leaf }: any) => {
  if (leaf.bold) children = <strong>{children}</strong>;
  if (leaf.italic) children = <em>{children}</em>;
  if (leaf.underline) children = <u>{children}</u>;
  if (leaf.code) children = <code>{children}</code>;
  return <span {...attributes}>{children}</span>;
};

export default function SlateEditor({ value, onChange, className }: SlateEditorProps) {
  const editor = useMemo(() => withHistory(withReact(createEditor() as Editor)), []);
  const [internalValue, setInternalValue] = useState<Descendant[]>(() => deserialize(value));
  const lastHtmlRef = useRef<string>(value);
  const slateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value !== lastHtmlRef.current) {
      setInternalValue(deserialize(value));
    }
  }, [value]);

  return (
    <div className={className} ref={slateRef}>
      <Slate
        editor={editor}
        value={internalValue}
        onChange={(v) => {
          setInternalValue(v);
          const html = serialize(v);
          lastHtmlRef.current = html;
          onChange(html);
        }}
      >
        <div className="flex flex-wrap gap-1 mb-2">
          <ToolbarButton title="Bold" onMouseDown={(e)=>{e.preventDefault(); toggleMark(editor,'bold');}}>
            <TextBold24Regular />
          </ToolbarButton>
          <ToolbarButton title="Italic" onMouseDown={(e)=>{e.preventDefault(); toggleMark(editor,'italic');}}>
            <TextItalic24Regular />
          </ToolbarButton>
          <ToolbarButton title="Underline" onMouseDown={(e)=>{e.preventDefault(); toggleMark(editor,'underline');}}>
            <TextUnderline24Regular />
          </ToolbarButton>
          <ToolbarButton title="Code" onMouseDown={(e)=>{e.preventDefault(); toggleMark(editor,'code');}}>
            <Code24Regular />
          </ToolbarButton>
          <ToolbarButton title="H1" onMouseDown={(e)=>{e.preventDefault(); toggleBlock(editor,'heading-one');}}>
            <TextHeader124Regular />
          </ToolbarButton>
          <ToolbarButton title="H2" onMouseDown={(e)=>{e.preventDefault(); toggleBlock(editor,'heading-two');}}>
            <TextHeader224Regular />
          </ToolbarButton>
          <ToolbarButton title="Quote" onMouseDown={(e)=>{e.preventDefault(); toggleBlock(editor,'block-quote');}}>
            <TextQuote24Regular />
          </ToolbarButton>
          <ToolbarButton title="Numbered List" onMouseDown={(e)=>{e.preventDefault(); toggleBlock(editor,'numbered-list');}}>
            <TextNumberListLtr24Regular />
          </ToolbarButton>
          <ToolbarButton title="Bulleted List" onMouseDown={(e)=>{e.preventDefault(); toggleBlock(editor,'bulleted-list');}}>
            <TextBulletListLtr24Regular />
          </ToolbarButton>
        </div>
        <Editable
          className="p-3 rounded-md bg-white text-black border outline-none focus:ring-2 focus:ring-zinc-300 slate-editable"
          style={{ minHeight: '14em', lineHeight: '1.4em' }}
          renderElement={(p)=> <Element {...p}/>} renderLeaf={(p)=> <Leaf {...p}/>} placeholder="Kirjoita..."
          onKeyDown={(e)=>{
            if (!e.metaKey && !e.ctrlKey) return;
            switch(e.key.toLowerCase()){
              case 'b': e.preventDefault(); toggleMark(editor,'bold'); break;
              case 'i': e.preventDefault(); toggleMark(editor,'italic'); break;
              case 'u': e.preventDefault(); toggleMark(editor,'underline'); break;
            }
          }}
        />
      </Slate>
    </div>
  );
}




