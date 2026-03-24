import { describe, it, expectTypeOf } from 'vitest';
import type { RealtimeIngestor, IngestorPlugin, CorivoDatabase } from '../../src/ingestors/index';

describe('IngestorPlugin interface', () => {
  it('RealtimeIngestor.startWatching accepts CorivoDatabase and returns Promise<void>', () => {
    type T = RealtimeIngestor;
    expectTypeOf<T['startWatching']>().parameters.toEqualTypeOf<[CorivoDatabase]>();
    expectTypeOf<T['startWatching']>().returns.toEqualTypeOf<Promise<void>>();
  });

  it('RealtimeIngestor.stop returns Promise<void>', () => {
    type T = RealtimeIngestor;
    expectTypeOf<T['stop']>().returns.toEqualTypeOf<Promise<void>>();
  });

  it('IngestorPlugin.name is string', () => {
    type T = IngestorPlugin;
    expectTypeOf<T['name']>().toBeString();
  });

  it('IngestorPlugin.create returns RealtimeIngestor', () => {
    type T = IngestorPlugin;
    expectTypeOf<T['create']>().returns.toEqualTypeOf<RealtimeIngestor>();
  });
});
