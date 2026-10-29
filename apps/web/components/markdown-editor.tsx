'use client';

import { useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';

import { cn } from '@/lib/utils';

/**
 * WYSIWYG editor without a toolbar: Markdown shortcuts (#, **, -, [ ], >, ```) format as you type,
 * and the content is read and written as Markdown so it stays portable (and readable via MCP).
 */
export function MarkdownEditor({ value, onChange, placeholder, autoFocus, className, label, onUploadImage }: {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  label?: string;
  /** Pasted or dropped images are uploaded with this and embedded as ![name](url). */
  onUploadImage?: (file: File) => Promise<string | null>;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const uploadRef = useRef(onUploadImage);
  uploadRef.current = onUploadImage;

  const insertImages = (files: File[], position?: number) => {
    const upload = uploadRef.current;
    const images = files.filter((file) => file.type.startsWith('image/'));
    if (!upload || !images.length) return false;
    void (async () => {
      for (const file of images) {
        const src = await upload(file);
        if (!src || !editor) continue;
        const chain = editor.chain().focus();
        (position !== undefined ? chain.insertContentAt(position, { type: 'image', attrs: { src, alt: file.name } }) : chain.setImage({ src, alt: file.name })).run();
      }
    })();
    return true;
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ HTMLAttributes: { class: 'rounded-lg border', loading: 'lazy' } }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown,
    ],
    content: value,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: {
        class: cn(
          'markdown-editor prose prose-zinc max-w-none dark:prose-invert focus:outline-none',
          'prose-headings:font-semibold prose-headings:tracking-tight prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl',
          'prose-p:my-2 prose-p:leading-7 prose-li:my-0.5 prose-pre:rounded-lg prose-a:text-primary prose-code:before:content-none prose-code:after:content-none',
        ),
        ...(label ? { 'aria-label': label } : {}),
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (!insertImages(files)) return false;
        event.preventDefault();
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        if (!insertImages(files, position)) return false;
        event.preventDefault();
        return true;
      },
    },
    onUpdate: ({ editor: current }) => onChangeRef.current(current.getMarkdown()),
  });

  return <EditorContent editor={editor} className={cn('cursor-text', className)} onClick={() => editor?.commands.focus()} />;
}
