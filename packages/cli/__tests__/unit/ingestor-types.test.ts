import { describe, it, expectTypeOf } from 'vitest';
import type { RealtimeIngestor, IngestorPlugin } from '../../src/ingestors/types';

describe('IngestorPlugin interface', () => {
  it('RealtimeIngestor has required methods', () => {
    type T = RealtimeIngestor;
    expectTypeOf<T['startWatching']>().toBeFunction();
    expectTypeOf<T['stop']>().toBeFunction();
  });

  it('IngestorPlugin has name and create', () => {
    type T = IngestorPlugin;
    expectTypeOf<T['name']>().toBeString();
    expectTypeOf<T['create']>().toBeFunction();
  });
});
