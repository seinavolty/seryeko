/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        "paper-2": "var(--paper-2)",
        "paper-3": "var(--paper-3)",
        "paper-4": "var(--paper-4)",
        rule: "var(--rule)",
        muted: "var(--muted)",
        neutral2: "var(--neutral)",
        ink: "var(--ink)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-dim": "var(--accent-dim)",
        focus: "var(--focus)",
        success: "var(--success)",
        error: "var(--error)",
        "tag-romance": "var(--tag-romance)",
        "tag-action": "var(--tag-action)",
        "tag-comedy": "var(--tag-comedy)",
        "tag-thriller": "var(--tag-thriller)",
        "tag-fantasy": "var(--tag-fantasy)",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['"Geist"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        outlier: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '0.375rem',
        md: '0.75rem',
        lg: '1.25rem',
        xl: '1.75rem',
        pill: '100vmax',
      },
      height: {
        'nav-bottom': 'var(--nav-bottom-h)',
      },
    },
  },
  plugins: [],
}
