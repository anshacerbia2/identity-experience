/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';

import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The account security experience is served by the same BFF as the Admin Portal, under /account/
// (TDD-identity-experience-002 §Delivery), so every URL the build writes starts there.
//
// The build emits files only. Nothing is inlined: the BFF's content security policy allows
// scripts, styles and fonts from 'self' and nothing inline (TDD-identity-experience-001), so an
// inlined font or a data: stylesheet would be refused in production and pass in development.
export default defineConfig({
  base: '/account/',
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
    preprocessorOptions: {
      scss: {
        // Cascade layers take their order from the first stylesheet that names them. The build
        // splits CSS into chunks, and a component's chunk can load before the global stylesheet
        // that states the order: `components` was then declared first, `reset` after it, and the
        // reset's button rules beat every Button's own. Stating the order at the top of every
        // stylesheet makes it the same whichever loads first. A file with @use states it through
        // _layers.scss, and Sass allows nothing before an @use.
        additionalData: (source: string): string =>
          source.includes('@use')
            ? source
            : `@layer reset, tokens, base, components, utilities, overrides;\n${source}`,
      },
    },
  },
  build: {
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: true,
    target: 'es2023',
  },
  server: {
    // The BFF serves the built application in every environment that matters. Locally, Vite
    // serves it and forwards the BFF's routes, so the browser still sees one origin. A port of its
    // own, so the Admin Portal and the Developer Console can run beside it.
    port: 5175,
    proxy: {
      '/api': 'http://127.0.0.1:8090',
      '/auth': 'http://127.0.0.1:8090',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    restoreMocks: true,
    // Above the five seconds a find* query may wait (src/test/setup.ts), so the query reports
    // what it did not find rather than the test timing out around it.
    testTimeout: 15_000,
  },
});
