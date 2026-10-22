import { defineConfig } from 'vite';

// Relative base so the built site works from any folder or host path.
// One JS bundle so the page can also be inlined into a single file.
export default defineConfig({
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
