import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Entwicklung: Vite auf :5173, API-Aufrufe gehen an Spring Boot auf :8080.
// Build: landet direkt in den statischen Ressourcen des Backends → ein einziges JAR.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
  build: {
    outDir: '../backend/src/main/resources/static',
    emptyOutDir: true,
  },
});
