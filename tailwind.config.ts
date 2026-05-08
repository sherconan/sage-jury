import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./data/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#F8F6F1",
          100: "#F1ECE0",
          200: "#E5DCC4",
          300: "#C9BC9A",
          400: "#A89870",
          500: "#7A6A4A",
          600: "#564A33",
          700: "#3A3122",
          800: "#1F1A12",
          900: "#0F0C08",
        },
        navy: {
          50: "#E6EAEF",
          100: "#C2CCD8",
          200: "#8FA0B5",
          300: "#5C7491",
          400: "#33526F",
          500: "#1A3553",
          600: "#0F2541",
          700: "#0A1A30",
          800: "#06101F",
          900: "#03080F",
        },
        gold: {
          50: "#FBF5E1",
          100: "#F5E6B5",
          200: "#EDD17C",
          300: "#E0B845",
          400: "#D4AF37",
          500: "#B5912B",
          600: "#8B6E1F",
          700: "#5F4B14",
        },
        cream: {
          50: "#FBF8F2",
          100: "#F5F0E8",
          200: "#EBE3D2",
        },
        verdict: {
          buy: "#15803D",
          buyStrong: "#0F5132",
          hold: "#A16207",
          avoid: "#B91C1C",
          avoidStrong: "#7F1D1D",
        },
      },
      fontFamily: {
        serif: ['"Playfair Display"', '"Noto Serif SC"', 'serif'],
        sans: ['"Inter"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        bench: "0 1px 0 rgba(212,175,55,0.18) inset, 0 14px 30px -18px rgba(6,16,31,0.28), 0 2px 4px rgba(6,16,31,0.05)",
        gavel: "0 24px 60px -30px rgba(6,16,31,0.55)",
        gold: "0 0 0 1px rgba(212,175,55,0.35), 0 12px 32px -16px rgba(212,175,55,0.45)",
      },
      backgroundImage: {
        "paper-grain": "radial-gradient(rgba(86,74,51,0.04) 1px, transparent 1px), radial-gradient(rgba(86,74,51,0.02) 1px, transparent 1px)",
        "wood-grain": "repeating-linear-gradient(90deg, rgba(86,74,51,0.02), rgba(86,74,51,0.02) 2px, transparent 2px, transparent 6px)",
        "gavel-rays": "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(212,175,55,0.12), transparent 60%)",
      },
      backgroundSize: {
        "paper-grain": "12px 12px, 24px 24px",
      },
      keyframes: {
        gavel: {
          "0%": { transform: "rotate(-25deg) translateY(-12px)", opacity: "0" },
          "60%": { transform: "rotate(15deg) translateY(0)", opacity: "1" },
          "100%": { transform: "rotate(0) translateY(0)", opacity: "1" },
        },
        gradeIn: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "60%": { transform: "scale(1.1)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        gavel: "gavel 0.6s cubic-bezier(.2,.7,.2,1.2) forwards",
        gradeIn: "gradeIn 0.5s cubic-bezier(.2,.7,.2,1.2) forwards",
        fadeUp: "fadeUp 0.5s ease-out forwards",
        shimmer: "shimmer 3s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
