/**
 * @corivo/openclaw
 *
 * OpenClaw realtime ingestor 插件。
 * 安装：npm install -g @corivo/openclaw
 * 启用：在 ~/.corivo/config.json 的 ingestors 数组中添加 "@corivo/openclaw"
 */
import { OpenClawIngestor } from './ingestor.js';
import type { IngestorPlugin } from 'corivo';

const plugin: IngestorPlugin = {
  name: '@corivo/openclaw',
  create: () => new OpenClawIngestor(),
};

export default plugin;
