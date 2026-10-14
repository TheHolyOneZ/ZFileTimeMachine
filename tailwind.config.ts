import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', "system-ui", "-apple-system", '"Segoe UI"', "sans-serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", '"Cascadia Code"', "Menlo", "monospace"],
      },
      boxShadow: {

        card: "inset 0 1px 0 0 hsl(var(--highlight)), 0 1px 2px 0 hsl(var(--shadow) / 0.25), 0 12px 32px -16px hsl(var(--shadow) / 0.45)",
        "card-hover": "inset 0 1px 0 0 hsl(var(--highlight)), 0 2px 4px 0 hsl(var(--shadow) / 0.25), 0 18px 40px -16px hsl(var(--shadow) / 0.6)",
        overlay: "inset 0 1px 0 0 hsl(var(--highlight)), 0 24px 64px -12px hsl(var(--shadow) / 0.7), 0 0 0 1px hsl(var(--border))",
        button: "inset 0 1px 0 0 hsl(0 0% 100% / 0.18), 0 1px 2px 0 hsl(var(--shadow) / 0.35)",
      },
      colors: {
        chrome: "hsl(var(--chrome))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },


      opacity: {
        "1": "0.01", "2": "0.02", "3": "0.03", "4": "0.04", "6": "0.06", "8": "0.08",
        "12": "0.12", "18": "0.18", "22": "0.22", "98": "0.98",
      },
      spacing: {
        "4.5": "1.125rem",
        "18": "4.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
