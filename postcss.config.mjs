/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind v4 moved the PostCSS plugin into its own package.
    '@tailwindcss/postcss': {},
  },
};

export default config;
