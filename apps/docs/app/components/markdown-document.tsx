import { isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { documentationPages } from '../../src/lib/documentation';
import { CopyableCodeBlock } from './copyable-code-block';

interface MarkdownDocumentProps {
  readonly source: string;
}

// Markdown sources link to each other by filename (`./collections.md`), while the
// docs site routes by slug (`/content`). Resolve filenames through the page registry.
const slugByFilename: Map<string, string> = new Map(
  documentationPages.map((page) => [page.filename, page.slug]),
);

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

  const filename = href.slice(2);
  const slug = slugByFilename.get(filename);

  return slug === undefined ? href : `/${slug}`;
}

export function MarkdownDocument({ source }: MarkdownDocumentProps) {
  return (
    <div className="docs-content">
      <ReactMarkdown
        components={{
          a: ({ children, href }) => <a href={normalizeDocumentationLink(href)}>{children}</a>,
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
