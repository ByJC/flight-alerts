import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { outDir: 'out/main' },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          settings: resolve(__dirname, 'src/preload/settings.ts'),
          overlay: resolve(__dirname, 'src/preload/overlay.ts'),
        },
      },
    },
  },
  renderer: {
    // electron-vite defaults renderer.root to src/renderer; override to project root
    // so Vite's dev server serves src/settings/ and src/overlay/ correctly.
    root: __dirname,
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          settings: resolve(__dirname, 'src/settings/index.html'),
          overlay: resolve(__dirname, 'src/overlay/index.html'),
        },
      },
    },
  },
});
