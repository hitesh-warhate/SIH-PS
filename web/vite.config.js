import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `vite preview` (the built app) needs the same proxy as `vite dev`, or every /api call goes nowhere.
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:4000' } },
});
