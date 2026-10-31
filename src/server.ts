import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp(config);

try {
  await app.listen({ host: config.host, port: config.port });
  if (config.mode === 'vulnerable') {
    console.warn('SECURITY_MODE=vulnerable: this server contains deliberate security flaws. Never expose it beyond localhost.');
  }
  console.log(`Listening on http://${config.host}:${config.port} (${config.mode} mode)`);
} catch (error) {
  console.error(error);
  process.exit(1);
}
