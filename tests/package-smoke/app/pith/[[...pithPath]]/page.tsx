import { pith } from '../../../src/lib/pith';

export default function PithEditorPage(props: {
  readonly params: Promise<Record<string, string | readonly string[] | undefined>>;
  readonly searchParams: Promise<Record<string, string | readonly string[] | undefined>>;
}) {
  const EditorPage = pith.editor.page;

  return <EditorPage {...props} />;
}
