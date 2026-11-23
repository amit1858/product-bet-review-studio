import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { readConfig } from './config';
import { createApp } from './app';

const config = readConfig();
const production = process.argv.includes('--production');
const app = createApp(config, undefined, production);
if (production) {
  app.use('/assets', express.static(path.resolve('dist/assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(path.resolve('dist'), { maxAge: 0 }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
const server = app.listen(config.port, config.host, () => console.log(`Product Bet Review Studio: ${config.origin}`));
server.requestTimeout = 100000;
server.headersTimeout = 15000;
process.once('SIGTERM', () => server.close());
process.once('SIGINT', () => server.close());
