import { describe, it, expectTypeOf } from 'vitest';
import type { RealtimeCollector, CorivoPlugin, CorivoDatabase } from '../../src/ingestors/index.js';

describe('CorivoPlugin interface', () => {
  it('RealtimeCollector.startWatching accepts CorivoDatabase and returns Promise<void>', () => {
    type T = RealtimeCollector;
    expectTypeOf<T['startWatching']>().parameters.toEqualTypeOf<[CorivoDatabase]>();
    expectTypeOf<T['startWatching']>().returns.toEqualTypeOf<Promise<void>>();
  });

  it('RealtimeCollector.stop returns Promise<void>', () => {
    type T = RealtimeCollector;
    expectTypeOf<T['stop']>().returns.toEqualTypeOf<Promise<void>>();
  });

  it('CorivoPlugin.name is string', () => {
    type T = CorivoPlugin;
    expectTypeOf<T['name']>().toBeString();
  });

  it('CorivoPlugin.create returns RealtimeCollector', () => {
    type T = CorivoPlugin;
    expectTypeOf<T['create']>().returns.toEqualTypeOf<RealtimeCollector>();
  });
});
