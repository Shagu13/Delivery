import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            // Let the app be installable in dev too, so you can test on your phone.
            devOptions: { enabled: true },
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
                id: '/',
                name: 'Dilo Delivery',
                short_name: 'Dilo',
                description: 'Dilo Delivery — courier app',
                lang: 'ka',
                theme_color: '#F6AA02',
                background_color: '#f5f3ef',
                display: 'standalone',
                orientation: 'portrait',
                start_url: '/',
                scope: '/',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                    { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                ],
                screenshots: [
                    { src: 'screenshot-wide.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'Dilo Delivery on desktop' },
                    { src: 'screenshot-narrow.png', sizes: '720x1280', type: 'image/png', form_factor: 'narrow', label: 'Dilo Delivery on mobile' },
                ],
            },
            workbox: {
                // Layer our Web Push handlers onto the generated Workbox service worker
                // (push + notificationclick) — keeps all the precache/offline behaviour intact.
                importScripts: ['/push-sw.js'],
                // Don't let the SW cache API/SignalR traffic — always hit the network.
                navigateFallbackDenylist: [/^\/api/, /^\/hubs/],
                globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
                // Some bundled chunks (fonts, charts) are large — raise the precache cap.
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                // A new build's worker activates and claims open pages immediately;
                // src/pwa-auto-update.ts then reloads the page so users see it.
                skipWaiting: true,
                clientsClaim: true,
            },
        }),
    ],
    server: {
        port: 3100,
        proxy: {
            '/api': {
                target: 'https://localhost:7100',
                changeOrigin: true,
                secure: false,
            },
            // SignalR hub — needs WebSocket upgrade proxied through to the backend.
            '/hubs': {
                target: 'https://localhost:7100',
                changeOrigin: true,
                secure: false,
                ws: true,
            },
        },
    },
    build: {
        outDir: '../API/wwwroot',
        emptyOutDir: true,
        chunkSizeWarningLimit: 1500,
    },
});