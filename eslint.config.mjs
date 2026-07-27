import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint 10 flat config. Next 16 removed the `next lint` command, so lint runs
 * through the eslint CLI directly (see package.json). eslint-config-next 16
 * ships native flat-config arrays, so no FlatCompat shim is needed.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    /*
     * eslint-config-next sets react.version to 'detect'. Its bundled
     * eslint-plugin-react performs that detection via context.getFilename(),
     * which ESLint 10 removed — so detection crashes the whole run. Pinning the
     * version explicitly skips the broken code path entirely.
     */
    settings: {
      react: { version: '19.2' },
    },
  },
  {
    ignores: ['.next/**', 'node_modules/**', 'public/**', 'lib/db/migrations/**', 'next-env.d.ts'],
  },
];

export default config;
