import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { MarkdownDocument } from '../../components/markdown-document';
import { getDocumentationPage } from '../../../src/lib/documentation';
import { pith } from '../../../src/lib/pith';

interface DocumentationPageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const identifiers = await pith.content.getEntryIdentifiers('docs');
  return identifiers.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: DocumentationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getDocumentationPage(slug);

  if (!page) {
    return {};
  }

  return { title: page.value.title, description: page.value.description ?? '' };
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
        <p className="eyebrow">{page.value.title}</p>
        <Link href="/">All guides</Link>
      </div>
      <MarkdownDocument source={page.value.body} />
    </main>
  );
}
