import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MarkdownDocument } from '../components/markdown-document';
import { getDocumentationPage, documentationPages } from '../../src/lib/documentation';

interface DocumentationPageProps {
  readonly params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return documentationPages.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: DocumentationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getDocumentationPage(slug);

  return page ? { title: page.title, description: page.description } : {};
}

export default async function DocumentationPage({ params }: DocumentationPageProps) {
  const { slug } = await params;
  const page = await getDocumentationPage(slug);

  if (!page) {
    notFound();
  }

  return (
    <main className="docs-document">
      <div className="docs-document-header">
        <p className="eyebrow">{page.title}</p>
        <Link href="/">All guides</Link>
      </div>
      <MarkdownDocument source={page.source} />
    </main>
  );
}
