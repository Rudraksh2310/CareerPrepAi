import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Pages that belong in the sitemap (public, indexable). Private/auth pages are noindex and left out.
const PUBLIC_PATHS = ['/', '/privacy', '/terms']
const PRIVATE_PATHS = ['/dashboard', '/upload', '/interview/', '/report/', '/account', '/login', '/register']

// SEO files that need the production origin. Set VITE_SITE_URL (e.g. https://example.com) at build time;
// without it robots.txt is still emitted but no sitemap, canonical or absolute og:image is (they would be wrong).
function seo(siteUrl) {
  return {
    name: 'careerprepai-seo',
    transformIndexHtml() {
      if (!siteUrl) return []
      const og = (property, content) => ({ tag: 'meta', attrs: { property, content }, injectTo: 'head' })
      return [
        { tag: 'link', attrs: { rel: 'canonical', href: `${siteUrl}/` }, injectTo: 'head' },
        og('og:url', `${siteUrl}/`),
        og('og:image', `${siteUrl}/og-image.jpg`),
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${siteUrl}/og-image.jpg` }, injectTo: 'head' }
      ]
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...PRIVATE_PATHS.map((p) => `Disallow: ${p}`)]
      if (siteUrl) robots.push('', `Sitemap: ${siteUrl}/sitemap.xml`)
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' })
      if (siteUrl) {
        const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${siteUrl}${p === '/' ? '/' : p}</loc></url>`).join('\n')
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
        })
      }
    }
  }
}

// Frontend talks to the FastAPI backend via VITE_API_BASE_URL (see .env.example).
// The dev proxy is kept so `npm run dev` works even before .env is set up.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const siteUrl = (env.VITE_SITE_URL || '').trim().replace(/\/+$/, '')
  return {
    plugins: [react(), seo(siteUrl)],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    }
  }
})
