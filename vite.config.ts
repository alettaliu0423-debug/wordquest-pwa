import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const base = process.env.VITE_BASE_PATH || '/';
if (!base.startsWith('/') || !base.endsWith('/') || base.includes('..')) {
  throw new Error('VITE_BASE_PATH must be a slash-delimited project path.');
}

export default defineConfig({ base, plugins: [react()] });
