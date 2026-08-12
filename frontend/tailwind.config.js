/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F4EE',
        panel: '#FFFFFF',
        panel2: '#F1EDE3',
        line: '#E3DDCE',
        ink: '#191B22',
        muted: '#6B7280',
        amber: '#C8790C',
        teal: '#0E8E7E',
        coral: '#C4472F'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace']
      },
      borderRadius: {
        card: '14px'
      }
    }
  },
  plugins: []
}
