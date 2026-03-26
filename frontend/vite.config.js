import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws':  { target: 'ws://localhost:8080',  ws: true },
    },
  },
  build: {
    target: 'es2020',
    // esbuild (default) is fast; explicit here so Lighthouse audits prod build
    minify: 'esbuild',
    cssMinify: true,
    // Raise warning threshold — three.js chunk is intentionally ~500 KB
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Granular chunks: React, Three.js, and everything else separate
        // so browsers can cache them independently between deploys
        manualChunks(id) {
          if (id.includes('node_modules/three'))       return 'three'
          // Keep all React ecosystem in one chunk — splitting react/react-dom
          // causes circular init errors with react-router-dom v7
          if (id.includes('node_modules/react'))       return 'react'
          if (id.includes('node_modules/'))            return 'vendor'
        },
        // Deterministic filenames so CDN caches survive re-deploys unchanged
        entryFileNames:  'assets/[name]-[hash].js',
        chunkFileNames:  'assets/[name]-[hash].js',
        assetFileNames:  'assets/[name]-[hash][extname]',
      },
    },
  },
})
