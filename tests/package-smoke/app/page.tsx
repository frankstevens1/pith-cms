import { pith } from '../src/lib/pith';

export default async function SmokePage() {
  const content = await pith.content.forRequest();
  const page = await content.getEntry('pages', 'home');

  return <main>{page.value.title}</main>;
}
