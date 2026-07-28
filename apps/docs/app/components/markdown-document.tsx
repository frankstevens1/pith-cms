import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { CopyableCodeBlock } from './copyable-code-block';

interface MarkdownDocumentProps {
  readonly source: string;
}

function textFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join('');
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textFromNode(node.props.children);
  }

  return '';
}

function languageFromNode(node: ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const language = languageFromNode(child);
      if (language) return language;
    }
    return undefined;
  }

  if (!isValidElement<{ className?: string }>(node)) {
    return undefined;
  }

  const className = node.props.className ?? '';
  return className.match(/(?:language|lang)-([^\s]+)/)?.[1];
}

function normalizeDocumentationLink(href: string | undefined): string | undefined {
  if (href === undefined || !href.startsWith('./') || !href.endsWith('.md')) {
    return href;
  }

  return `/${href.slice(2, -3)}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function headingId(children: ReactNode): string {
  return slugify(textFromNode(children));
}

export function MarkdownDocument({ source }: MarkdownDocumentProps) {
  return (
    <div className="docs-content">
      <ReactMarkdown
        components={{
          a: ({ children, href }) => <a href={normalizeDocumentationLink(href)}>{children}</a>,
          h1: ({ children }) => <h1 id={headingId(children)}>{children}</h1>,
          h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
          h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
          h4: ({ children }) => <h4 id={headingId(children)}>{children}</h4>,
          h5: ({ children }) => <h5 id={headingId(children)}>{children}</h5>,
          h6: ({ children }) => <h6 id={headingId(children)}>{children}</h6>,
          pre: ({ children }) => (
            <CopyableCodeBlock code={textFromNode(children)} language={languageFromNode(children)}>
              {children}
            </CopyableCodeBlock>
          ),
        }}
        rehypePlugins={[rehypeHighlight]}
        remarkPlugins={[remarkGfm]}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
