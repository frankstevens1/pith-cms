import { pith } from '../../../../src/lib/pith';

export default async function PithEditorPage(props: {
  readonly params: Promise<Record<string, string | readonly string[] | undefined>>;
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}) {
  if (!pith.editor) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          Editor is not configured
        </h1>
        <p className="mt-3 text-slate-600">
          Set PITH_PASSWORD_HASH and PITH_SESSION_SECRET to enable the local editor.
        </p>
        <a className="mt-6 public-button public-button-secondary" href="/">
          Go back home
        </a>
      </main>
    );
  }

  const EditorPage = pith.editor.page;
  return <EditorPage {...props} />;
}
