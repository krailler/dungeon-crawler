/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 32px rgba(56, 189, 248, 0.25)",
      },
    },
  },
  plugins: [],
};
