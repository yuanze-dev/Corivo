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
export declare function useDatabase(db: CorivoDatabase | null): {
    stats: DbStats | null;
    loading: boolean;
};
//# sourceMappingURL=useDatabase.d.ts.map