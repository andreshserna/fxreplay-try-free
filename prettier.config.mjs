/** Formatting for code and config. Markdown and the token data files are left as written. */
export default {
  singleQuote: true,
  printWidth: 100,
  plugins: ['prettier-plugin-astro'],
  overrides: [{ files: '*.astro', options: { parser: 'astro' } }],
};
