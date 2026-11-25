// Cambista — Vite configuration
// Copyright (C) 2026 dani3lsamir
// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', target: 'es2020' },
  test: { environment: 'node' },
});
