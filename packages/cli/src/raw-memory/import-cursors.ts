import type { HostId } from '../hosts/types.js';
import type { CorivoDatabase } from '../storage/database.js';

export class HostImportCursorStore {
  constructor(private readonly db: CorivoDatabase) {}

  get(host: HostId): string | null {
    return this.db.getHostImportCursor(host);
  }

  set(host: HostId, cursor: string): void {
    this.db.setHostImportCursor(host, cursor);
  }
}
