export interface ChangesetRow {
  table_name: string;
  pk: string;
  col_name: string | null;
  col_version: number;
  db_version: number;
  value: string | null;
  site_id: string;
}

export interface PushPayload {
  site_id: string;
  db_version: number;
  changesets: ChangesetRow[];
}

export interface PullPayload {
  site_id: string;
  since_version: number;
}

export interface PullResult {
  changesets: ChangesetRow[];
  current_version: number;
}

export interface SyncStatus {
  identity_id: string;
  device_id: string;
  last_sync_version: number;
  total_changesets: number;
}

export interface SyncRepository {
  pushChangesets(identityId: string, payload: PushPayload): { stored: number };
  pullChangesets(identityId: string, payload: PullPayload): PullResult;
  getSyncStatus(identityId: string, deviceId: string): SyncStatus;
}
