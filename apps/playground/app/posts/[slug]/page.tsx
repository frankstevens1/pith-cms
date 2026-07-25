import type { Metadata } from 'next';
import { ContentNotFoundError } from '@pith-cms/core';
import { notFound } from 'next/navigation';

import { PublicShell } from '../../components/public-shell';
import { pith } from '../../../src/lib/pith';
import { formatDate } from '../../../src/lib/format';

interface PostPageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const identifiers = await pith.content.getEntryIdentifiers('posts');

  return identifiers.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const content = await pith.content.forRequest();
  const post = await content.getOptionalEntry('posts', slug);

  return post ? { title: post.value.title } : {};
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const content = await pith.content.forRequest();
  let post;

  try {
    post = await content.getEntry('posts', slug);
  } catch (error) {
    if (error instanceof ContentNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <PublicShell>
      <article className="public-page">
        <a className="public-text-link" href="/posts">
          ← Notes
        </a>
        <h1 className="public-post-title mt-8">{post.value.title}</h1>
        {post.value.publishedAt ? (
          <p className="public-meta mt-4">{formatDate(post.value.publishedAt)}</p>
        ) : null}
        <div className="public-post-body">{post.value.body}</div>
      </article>
    </PublicShell>
  );
}
