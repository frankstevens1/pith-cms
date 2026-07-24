import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface DocumentationPageDefinition {
  readonly description: string;
  readonly filename: string;
  readonly slug: string;
  readonly title: string;
}

export const documentationPages = [
  {
    slug: 'quick-start',
    title: 'Quick start',
    description: 'Add Pith to a local App Router site and mount the editor.',
    filename: 'quick-start.md',
  },
  {
    slug: 'content',
    title: 'Collections',
    description: 'Define collections once. Get validation and inferred types from them.',
    filename: 'collections.md',
  },
  {
    slug: 'editor',
    title: 'Editor and preview',
    description: 'Protect mutations, preview unsaved work, and handle conflicts safely.',
    filename: 'editor.md',
  },
  {
    slug: 'storage',
    title: 'Storage and publishing',
    description: 'Choose a persistent filesystem or GitHub commits and pull requests.',
    filename: 'storage.md',
  },
  {
    slug: 'security',
    title: 'Security',
    description: 'Use Pith’s controls without skipping your deployment responsibilities.',
    filename: 'security.md',
  },
  {
    slug: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Diagnose setup, storage, preview, and security failures directly.',
    filename: 'troubleshooting.md',
  },
  {
    slug: 'migrations',
    title: 'Migrations',
    description: 'Change storage or auth without changing your content files.',
    filename: 'migrations.md',
  },
  {
    slug: 'errors',
    title: 'Errors and limits',
    description: 'Use stable Pith errors and know the boundaries of the first release.',
    filename: 'errors.md',
  },
  {
    slug: 'cli',
    title: 'CLI',
    description: 'Scaffold projects, manage collections, inspect content, and diagnose setup.',
    filename: 'cli.md',
  },
  {
    slug: 'compatibility',
    title: 'Compatibility',
    description: 'What runtimes, frameworks, and deployment environments Pith targets.',
    filename: 'compatibility.md',
  },
  {
    slug: 'known-limitations',
    title: 'Known limitations',
    description: 'Current scope boundaries and intentional omissions in this release.',
    filename: 'known-limitations.md',
  },
  {
    slug: 'public-api',
    title: 'Public API',
    description: 'Stable and internal API surfaces, plus the compatibility promise.',
    filename: 'public-api.md',
  },
  {
    slug: 'releasing',
    title: 'Releasing',
    description: 'Versioning policy, prerelease workflow, publication prerequisites, and rollback.',
    filename: 'releasing.md',
  },
] as const satisfies readonly DocumentationPageDefinition[];

const documentationDirectories = [
  resolve(process.cwd(), '../../docs'),
  resolve(process.cwd(), 'docs'),
];

export interface DocumentationPage extends DocumentationPageDefinition {
  readonly source: string;
}

export async function getDocumentationPage(slug: string): Promise<DocumentationPage | null> {
  const definition = documentationPages.find((page) => page.slug === slug);

  if (!definition) {
    return null;
  }

  let source: string | undefined;

  for (const directory of documentationDirectories) {
    try {
      source = await readFile(resolve(directory, definition.filename), 'utf8');
      break;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  if (source === undefined) {
    throw new Error(`Unable to locate documentation source ${definition.filename}.`);
  }

  return { ...definition, source };
}
