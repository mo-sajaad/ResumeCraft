import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vitest must not load the real frontend/.env; tests/ has no env files.
const isUnitTest = Boolean(process.env.VITEST);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  ...(isUnitTest && { envDir: './tests' }),
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'jsdom',
    dir: './tests',
    setupFiles: './tests/setupTests.js',
    globals: true,
    // Cleared so values exported in the shell cannot configure Firebase either.
    env: {
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_AUTH_DOMAIN: '',
      VITE_FIREBASE_PROJECT_ID: '',
      VITE_FIREBASE_STORAGE_BUCKET: '',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '',
      VITE_FIREBASE_APP_ID: ''
    }
  }
});