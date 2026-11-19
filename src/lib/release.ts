/** The git SHA of this build, set at build time (astro.config.mjs). */
declare const __RELEASE__: string | undefined;

export const RELEASE: string = typeof __RELEASE__ === 'string' ? __RELEASE__ : 'dev';
