import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3100,
        proxy: {
            '/api': {
                target: 'https://localhost:7100',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    build: {
        outDir: '../API/wwwroot',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
    },
});
