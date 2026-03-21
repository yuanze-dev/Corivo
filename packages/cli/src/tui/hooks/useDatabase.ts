import { useState, useEffect, useRef } from 'react';
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
  // 上次数据的指纹，用于跳过无变化的更新
  const lastFingerprintRef = useRef('');

  useEffect(() => {
    if (!db) { setLoading(false); return; }

    const fetch = () => {
      try {
        const tui = db.getTUIStats();
        const health = db.checkHealth();

        // 计算指纹：排除 recentBlocks 完整内容，仅用 id+vitality 标识
        const recentKey = (tui.recentBlocks as any[])
          .map(b => `${b.id}:${b.vitality}`)
          .join(',');
        const fingerprint = JSON.stringify({
          total: tui.total, weeklyNew: tui.weeklyNew, queryHits: tui.queryHits,
          byStatus: tui.byStatus, byNature: tui.byNature,
          associations: tui.associations, dbSize: tui.dbSize,
          ok: health.ok, recentKey,
        });

        // 数据未变化则跳过 setState，避免不必要的重渲染
        if (fingerprint === lastFingerprintRef.current) return;
        lastFingerprintRef.current = fingerprint;

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
