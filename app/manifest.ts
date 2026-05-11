import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '高考英语词汇学习',
    short_name: '词汇学习',
    description: '高考英语词汇学习 PWA — 随时随地背单词',
    start_url: '/',
    display: 'standalone',
    background_color: '#F2F2F7',
    theme_color: '#5E5CE6',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    categories: ['education'],
  }
}
