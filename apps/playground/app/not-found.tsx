import { PublicShell } from './components/public-shell';

export default function NotFound() {
  return (
    <PublicShell>
      <section className="public-page">
        <p className="public-eyebrow">404</p>
        <h1 className="public-page-title">Content not found</h1>
        <p className="public-page-copy">
          The requested Pith entry does not exist in public content.
        </p>
      </section>
    </PublicShell>
  );
}
