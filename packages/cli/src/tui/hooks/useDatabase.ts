import { useState, useEffect } from 'react';
import type { CorivoDatabase } from '../../storage/database.js';
import type { Block } from '../../models/index.js';

export interface DbStats {
  total: number;
  byStatus: Record<string, number>;
  byAnnotation: Record<string, number>;
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
        const rawStats = db.getStats();
        const health = db.checkHealth();
        const associations = db.queryAssociations({ limit: 500 });
        const recentBlocks = db.queryBlocks({ limit: 5 });
        setStats({
          total: rawStats.total,
          byStatus: rawStats.byStatus,
          byAnnotation: rawStats.byAnnotation,
          associationCount: associations.length,
          sizeBytes: health.size ?? 0,
          healthy: health.ok,
          recentBlocks,
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
