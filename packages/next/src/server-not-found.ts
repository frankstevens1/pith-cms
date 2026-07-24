import { ContentNotFoundError } from '@pith-cms/core';
import { notFound } from 'next/navigation';
import type { ContentEntry, PithConfig } from '@pith-cms/core';

import type {
  ConfiguredCollectionName,
  PithInstance,
  InferConfiguredCollectionEntry,
  ReadEntryOptions,
} from './types.js';

export async function getEntryOrNotFound<
  TConfig extends PithConfig,
  TCollectionName extends ConfiguredCollectionName<TConfig>,
>(
  pith: PithInstance<TConfig>,
  collection: TCollectionName,
  identifier: string,
  options?: ReadEntryOptions,
): Promise<ContentEntry<InferConfiguredCollectionEntry<TConfig, TCollectionName>>> {
  try {
    return await pith.content.getEntry(collection, identifier, options);
  } catch (error) {
    if (error instanceof ContentNotFoundError) {
      return notFound();
    }

    throw error;
  }
}
