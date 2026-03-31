/**
 * @corivo/openclaw
 *
 * OpenClaw realtime ingestor plugin.
 * Installation: npm install -g @corivo/openclaw
 * Enable: Add "@corivo/openclaw" to the plugins array in ~/.corivo/config.json
 */
import { OpenClawIngestor } from './ingestor.js';
import type { CorivoPlugin } from 'corivo';

const plugin: CorivoPlugin = {
  name: '@corivo/openclaw',
  create: () => new OpenClawIngestor(),
};

export default plugin;
