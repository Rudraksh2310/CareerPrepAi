/** @type {import('tailwindcss').Config} */
// Every colour is a CSS variable (RGB triplet) defined in src/index.css for the light and dark themes, so
// opacity modifiers like `bg-panel2/60` keep working in both.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces and text
        bg: v('bg'),
        panel: v('panel'),
        panel2: v('panel2'),
        line: v('line'),
        'line-strong': v('line-strong'),
        ink: v('ink'),
        muted: v('muted'),
        // Brand accents. Use these as FILLS and on the dark call room.
        amber: v('amber'),
        teal: v('teal'),
        coral: v('coral'),
        // Text-safe versions of the accents for use on the page surfaces (all >= 4.5:1 in both themes)
        'amber-ink': v('amber-ink'),
        'teal-ink': v('teal-ink'),
        'coral-ink': v('coral-ink'),
        // Tinted backgrounds for status/feedback
        'teal-soft': v('teal-soft'),
        'coral-soft': v('coral-soft'),
        'amber-soft': v('amber-soft'),
        // Inverted band (final CTA, skip link)
        inverse: v('inverse'),
        'on-inverse': v('on-inverse')
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', 'system-ui', 'sans-serif'],
        body: ['"Atkinson Hyperlegible Next"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      borderRadius: {
        card: '10px'
      },
      maxWidth: {
        page: '100rem',
        prose: '60ch'
      }
    }
  },
  plugins: []
}
