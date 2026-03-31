/**
 * Corivo plugin interface contract
 *
 * npm packages that implement this interface can be registered with the heartbeat engine
 * through the `plugins` field in `config.json`.
 * `RealtimeCollector` is one plugin capability, and we can add more capabilities over time.
 */
import type { CorivoDatabase } from '../storage/database.js';

/** Real-time collection capability interface */
export interface RealtimeCollector {
  startWatching(db: CorivoDatabase): Promise<void>;
  /**
   * Stop listening and release resources.
   * Idempotent: Allowed to be called when startWatching is not called and should not throw an exception.
   */
  stop(): Promise<void>;
}

/**
 * Corivo plugin manifest
 *
 * Each plugin package's default export must conform to this interface.
 * name is only used for logs and does not perform version compatibility checking.
 */
export interface CorivoPlugin {
  name: string;
  create(): RealtimeCollector;
}
