import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0A0A0A", 700: "#1F2430", 500: "#3A5274", 300: "#8A9AB3", 100: "#E7ECF3", 50: "#F4F6FA" },
        brand: { DEFAULT: "#1F4FE0", 600: "#1A41BA", 50: "#EEF2FD" },
        star: { DEFAULT: "#C9A227", muted: "#E8DDB5" },
      },
      fontFamily: { sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(11,31,58,0.06), 0 1px 3px rgba(11,31,58,0.08)" },
    },
  },
  plugins: [],
};
export default config;
