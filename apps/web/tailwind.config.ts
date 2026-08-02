import type { Config } from 'tailwindcss';

const config: Config = {
  // Everything under src/, not a list of three directories.
  //
  // The narrow globs silently broke every screen outside them: src/auth/ and
  // src/brand/ were not scanned, so their utilities were never generated and
  // the sign-in page rendered with no padding, no gaps and no width. Valid
  // markup, clean types, successful build, visibly broken page — nothing
  // fails when a class is missing, it simply is not there.
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        'background-alt': 'hsl(var(--background-alt) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        'surface-strong': 'hsl(var(--surface-strong) / <alpha-value>)',
        'surface-tint': 'hsl(var(--surface-tint) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        'border-strong': 'hsl(var(--border-strong) / <alpha-value>)',
        ink: 'hsl(var(--text) / <alpha-value>)',
        muted: 'hsl(var(--text-muted) / <alpha-value>)',
        faint: 'hsl(var(--text-faint) / <alpha-value>)',
        brand: {
          DEFAULT: 'hsl(var(--brand) / <alpha-value>)',
          strong: 'hsl(var(--brand-strong) / <alpha-value>)',
          soft: 'hsl(var(--brand-soft) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          soft: 'hsl(var(--accent-soft) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'hsl(var(--success) / <alpha-value>)',
          soft: 'hsl(var(--success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning) / <alpha-value>)',
          soft: 'hsl(var(--warning-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger) / <alpha-value>)',
          soft: 'hsl(var(--danger-soft) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'hsl(var(--info) / <alpha-value>)',
          soft: 'hsl(var(--info-soft) / <alpha-value>)',
        },
      },
      fontSize: {
        // Below Tailwind's xs. For chrome that has to be present without
        // competing: stage labels, units, row metadata.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      fontFamily: {
        // Loaded via next/font in app/layout.tsx, so they are subset and
        // self-hosted rather than depending on what the operating system
        // happens to ship.
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)',
      },
      borderRadius: {
        '2xl': '1.5rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
};

export default config;
