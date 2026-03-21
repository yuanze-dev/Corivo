import { useState, useEffect } from 'react';
import type { CorivoDatabase } from '../../storage/database.js';
import type { Block } from '../../models/index.js';

export interface DbStats {
  total: number;
  weeklyNew: number;
  queryHits: number;
  byStatus: Record<string, number>;
  byAnnotation: Record<string, number>;
  byNature: Record<string, number>;
  associationCount: number;
  sizeBytes: number;
  healthy: boolean;
  recentBlocks: Block[];
}

export function useDatabase(db: CorivoDatabase | null): { stats: DbStats | null; loading: boolean } {
  const [stats, setStats] = useState<DbStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) { setLoading(false); return; }

    const fetch = () => {
      try {
        const tui = db.getTUIStats();
        const health = db.checkHealth();
        setStats({
          total: tui.total,
          weeklyNew: tui.weeklyNew,
          queryHits: tui.queryHits,
          byStatus: tui.byStatus,
          byAnnotation: {},
          byNature: tui.byNature,
          associationCount: tui.associations,
          sizeBytes: tui.dbSize,
          healthy: health.ok,
          recentBlocks: tui.recentBlocks as unknown as Block[],
        });
      } catch {
        // DB error — leave stats null
      } finally {
        setLoading(false);
      }
    };

    fetch();
    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [db]);

  return { stats, loading };
}
