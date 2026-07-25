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
