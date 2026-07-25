import { PublicShell } from '../components/public-shell';
import { pith } from '../../src/lib/pith';
import { formatDate } from '../../src/lib/format';

export default async function PostsPage() {
  const content = await pith.content.forRequest();
  const result = await content.listEntries('posts');

  return (
    <PublicShell>
      <section className="public-page">
        <p className="public-eyebrow">Live Markdown collection</p>
        <h1 className="public-page-title">Notes</h1>
        <p className="public-page-copy">
          These entries are read through Pith&apos;s public server API. The Markdown body stays a
          string until the consumer decides how to render it.
        </p>
        <div className="public-post-list">
          {result.entries.map((post) => (
            <a className="public-post-row" href={`/posts/${post.identifier}`} key={post.identifier}>
              <span className="public-post-row-title">{post.value.title}</span>
              <span className="public-meta">
                {post.value.publishedAt ? formatDate(post.value.publishedAt) : post.identifier}
              </span>
            </a>
          ))}
        </div>
        {result.invalidEntries.length > 0 ? (
          <p className="public-preview-note">
            {result.invalidEntries.length} invalid content file is available to diagnose in the
            editor.
          </p>
        ) : null}
      </section>
    </PublicShell>
  );
}
