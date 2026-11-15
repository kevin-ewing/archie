// Development only: a tiny endpoint the in-game `archie.photo(path)` posts a frame to, so an agent (or you)
// can save real game photos (plane, clouds, HUD) straight into the project. Never part of a build.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const savePhotos = (): Plugin => ({
  name: 'archie-save-photo',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__archie/photo', (req, res) => {
      const path = new URL(req.url ?? '', 'http://localhost').searchParams.get('path') ?? 'debug/photo.png';
      const file = resolve(server.config.root, path);
      if (req.method !== 'POST' || relative(server.config.root, file).startsWith('..') || !/\.(png|jpg)$/.test(file)) {
        res.statusCode = 400;
        return res.end('POST a PNG/JPEG to a path inside the project');
      }
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, Buffer.concat(chunks));
        res.end(relative(server.config.root, file));
      });
    });
  },
});

export default defineConfig({ plugins: [savePhotos()] });
