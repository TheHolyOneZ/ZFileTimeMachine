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
      fontSize: {
        "2xs": ["11px", { lineHeight: "14px" }],
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "18px" }],
        base: ["14px", { lineHeight: "20px" }],
        md: ["15px", { lineHeight: "21px" }],
        lg: ["17px", { lineHeight: "22px", letterSpacing: "-0.012em" }],
        xl: ["20px", { lineHeight: "26px", letterSpacing: "-0.018em" }],
        "2xl": ["26px", { lineHeight: "32px", letterSpacing: "-0.024em" }],
        "3xl": ["34px", { lineHeight: "40px", letterSpacing: "-0.03em" }],
      },
      boxShadow: {
        hairline: "inset 0 0 0 1px hsl(var(--line))",
        card: "inset 0 1px 0 0 hsl(var(--highlight)), 0 0 0 1px hsl(var(--line)), 0 1px 2px -1px hsl(var(--shadow) / 0.2), 0 8px 24px -14px hsl(var(--shadow) / 0.45)",
        "card-hover": "inset 0 1px 0 0 hsl(var(--highlight)), 0 0 0 1px hsl(var(--line-strong)), 0 2px 4px -2px hsl(var(--shadow) / 0.25), 0 18px 40px -18px hsl(var(--shadow) / 0.6)",
        panel: "0 0 0 1px hsl(var(--line)), 0 1px 1px hsl(var(--shadow) / 0.08), 0 12px 40px -20px hsl(var(--shadow) / 0.5)",
        overlay: "inset 0 1px 0 0 hsl(var(--highlight)), 0 0 0 1px hsl(var(--line-strong)), 0 4px 12px -4px hsl(var(--shadow) / 0.3), 0 32px 80px -24px hsl(var(--shadow) / 0.75)",
        button: "inset 0 1px 0 0 hsl(0 0% 100% / 0.22), inset 0 -1px 0 0 hsl(0 0% 0% / 0.12), 0 1px 2px 0 hsl(var(--shadow) / 0.3), 0 4px 12px -6px hsl(var(--primary) / 0.55)",
        control: "inset 0 1px 0 0 hsl(var(--highlight)), 0 0 0 1px hsl(var(--line)), 0 1px 2px -1px hsl(var(--shadow) / 0.25)",
        knob: "0 1px 1px hsl(0 0% 0% / 0.12), 0 2px 6px -1px hsl(0 0% 0% / 0.3)",
      },
      colors: {
        canvas: "hsl(var(--canvas))",
        sidebar: "hsl(var(--sidebar))",
        chrome: "hsl(var(--canvas))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          sunken: "hsl(var(--surface-sunken))",
        },
        line: {
          DEFAULT: "hsl(var(--line))",
          strong: "hsl(var(--line-strong))",
        },
        positive: "hsl(var(--positive))",
        negative: "hsl(var(--negative))",
        caution: "hsl(var(--caution))",
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
        faint: "hsl(var(--faint))",
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
        xs: "calc(5px * var(--rs))",
        sm: "calc(7px * var(--rs))",
        md: "calc(9px * var(--rs))",
        lg: "calc(12px * var(--rs))",
        xl: "calc(16px * var(--rs))",
        "2xl": "calc(20px * var(--rs))",
        "3xl": "calc(26px * var(--rs))",
      },
      transitionTimingFunction: {
        zftm: "cubic-bezier(0.32, 0.72, 0, 1)",
        "zftm-in": "cubic-bezier(0.5, 0, 0.75, 0)",
      },
      opacity: {
        "1": "0.01", "2": "0.02", "3": "0.03", "4": "0.04", "6": "0.06", "8": "0.08",
        "12": "0.12", "15": "0.15", "18": "0.18", "22": "0.22", "35": "0.35", "45": "0.45", "55": "0.55", "65": "0.65", "85": "0.85", "98": "0.98",
      },
      spacing: {
        "4.5": "1.125rem",
        "13": "3.25rem",
        "18": "4.5rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
