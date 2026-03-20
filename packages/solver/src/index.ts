import { buildServer } from './server.js';
import { config } from './config.js';

try {
  const app = await buildServer();
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  console.error(err);
  process.exit(1);
}
