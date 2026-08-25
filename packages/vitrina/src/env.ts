/*
 * Development or production, without demanding Node's types: the literal
 * `process.env.NODE_ENV` is the one token every bundler rewrites (and Node
 * provides); the local ambient declaration keeps consumers whose tsconfig pins
 * `types` compiling. Where neither bundler nor Node exists (unbundled browser
 * ESM) the read throws and we assume development — every warning built on this
 * is advice, and advice belongs in development.
 *
 * Internal: not exported from `src/index.ts`.
 */

declare const process: { env: { NODE_ENV?: string } } | undefined;

export function isProduction(): boolean {
  try {
    return process!.env.NODE_ENV === 'production';
  } catch {
    return false;
  }
}
