/*
 * The second dataset. Its whole job is to answer "does this work with MY
 * things?" without a word of prose: the same <Vitrina>, the same props, the
 * same render props — content that is not a photograph, one toggle away.
 *
 * They are shipped as SVG FILES, not as emoji characters in a text node, and
 * that is deliberate. On macOS, Chrome draws emoji text from Apple Color Emoji,
 * a bitmap (sbix) font with pre-generated strikes at fixed sizes: under an
 * animated scale the glyph snaps between strikes, and the result looks exactly
 * like a broken reveal while the DOM, the tween and the geometry all measure
 * perfect. Vector art scales; the character does not. (The library renders text
 * content fine — see `--vitrina-object-font-size` in the README — it is the
 * JUDGING of a scale animation that emoji-as-text makes impossible.)
 *
 * Graphics: Twemoji 17.0.3, CC-BY 4.0 — see assets/CREDITS.md.
 */

/** Demo-side shape. Nothing here is a library concept. */
export interface Glyph {
  id: string;
  /** The emoji itself — used for the accessible name and the panel's copy. */
  character: string;
  name: string;
  /** Unicode code point, e.g. "U+1F30B". */
  codePoint: string;
  /** The Unicode block the character lives in. */
  block: string;
  /** The Unicode version that introduced it. */
  since: string;
}

export const GLYPHS: Glyph[] = [
  { id: 'volcano', character: '🌋', name: 'Volcano', codePoint: 'U+1F30B', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 6.0' },
  { id: 'ringed-planet', character: '🪐', name: 'Ringed planet', codePoint: 'U+1FA90', block: 'Symbols and Pictographs Extended-A', since: 'Unicode 12.0' },
  { id: 'squid', character: '🦑', name: 'Squid', codePoint: 'U+1F991', block: 'Supplemental Symbols and Pictographs', since: 'Unicode 9.0' },
  { id: 'cactus', character: '🌵', name: 'Cactus', codePoint: 'U+1F335', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 6.0' },
  { id: 'balloon', character: '🎈', name: 'Balloon', codePoint: 'U+1F388', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 6.0' },
  { id: 'mirror', character: '🪞', name: 'Mirror', codePoint: 'U+1FA9E', block: 'Symbols and Pictographs Extended-A', since: 'Unicode 13.0' },
  { id: 'ice', character: '🧊', name: 'Ice', codePoint: 'U+1F9CA', block: 'Supplemental Symbols and Pictographs', since: 'Unicode 12.0' },
  { id: 'spiral-shell', character: '🐚', name: 'Spiral shell', codePoint: 'U+1F41A', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 6.0' },
  { id: 'mushroom', character: '🍄', name: 'Mushroom', codePoint: 'U+1F344', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 6.0' },
  { id: 'old-key', character: '🗝️', name: 'Old key', codePoint: 'U+1F5DD', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 7.0' },
  { id: 'kite', character: '🪁', name: 'Kite', codePoint: 'U+1FA81', block: 'Symbols and Pictographs Extended-A', since: 'Unicode 12.0' },
  { id: 'compass', character: '🧭', name: 'Compass', codePoint: 'U+1F9ED', block: 'Supplemental Symbols and Pictographs', since: 'Unicode 11.0' },
  { id: 'candle', character: '🕯️', name: 'Candle', codePoint: 'U+1F56F', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 7.0' },
  { id: 'coral', character: '🪸', name: 'Coral', codePoint: 'U+1FAB8', block: 'Symbols and Pictographs Extended-A', since: 'Unicode 14.0' },
  { id: 'bone', character: '🦴', name: 'Bone', codePoint: 'U+1F9B4', block: 'Supplemental Symbols and Pictographs', since: 'Unicode 11.0' },
  { id: 'anchor', character: '⚓', name: 'Anchor', codePoint: 'U+2693', block: 'Miscellaneous Symbols', since: 'Unicode 4.1' },
  { id: 'tornado', character: '🌪️', name: 'Tornado', codePoint: 'U+1F32A', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 7.0' },
  { id: 'roller-skate', character: '🛼', name: 'Roller skate', codePoint: 'U+1F6FC', block: 'Transport and Map Symbols', since: 'Unicode 13.0' },
  { id: 'nesting-dolls', character: '🪆', name: 'Nesting dolls', codePoint: 'U+1FA86', block: 'Symbols and Pictographs Extended-A', since: 'Unicode 13.0' },
  { id: 'nazar-amulet', character: '🧿', name: 'Nazar amulet', codePoint: 'U+1F9FF', block: 'Supplemental Symbols and Pictographs', since: 'Unicode 11.0' },
  { id: 'yo-yo', character: '🪀', name: 'Yo-yo', codePoint: 'U+1FA80', block: 'Symbols and Pictographs Extended-A', since: 'Unicode 12.0' },
  { id: 'carousel-horse', character: '🎠', name: 'Carousel horse', codePoint: 'U+1F3A0', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 6.0' },
  { id: 'magic-wand', character: '🪄', name: 'Magic wand', codePoint: 'U+1FA84', block: 'Symbols and Pictographs Extended-A', since: 'Unicode 13.0' },
  { id: 'watermelon', character: '🍉', name: 'Watermelon', codePoint: 'U+1F349', block: 'Miscellaneous Symbols and Pictographs', since: 'Unicode 6.0' },
];

/*
 * Twemoji names its files after the code points, variation selector stripped.
 * The same glob-and-resolve as the specimens, so both datasets add a file the
 * same way.
 */
const FILES = import.meta.glob('../../assets/emoji/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byFile = new Map(
  Object.entries(FILES).map(([path, url]) => [path.split('/').pop()!.replace('.svg', ''), url]),
);

const fileNameOf = (character: string): string =>
  [...character]
    .filter((c) => c.codePointAt(0) !== 0xfe0f)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-');

export const glyphImage = (character: string): string => {
  const url = byFile.get(fileNameOf(character));
  if (!url) throw new Error(`No Twemoji file for "${character}"`);
  return url;
};
