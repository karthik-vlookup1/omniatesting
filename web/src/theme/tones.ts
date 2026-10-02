/**
 * Semantic tones. Every status in the product maps to exactly one of these, so colour means the
 * same thing everywhere. Colour is never the only signal: components pair it with text and an icon.
 */
export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

export const TONE_COLOR: Record<Tone, string> = {
  success: 'teal',
  warning: 'orange',
  danger: 'red',
  info: 'blue',
  neutral: 'slate',
  brand: 'blue',
};

/** Builds a typed status → badge mapping for one domain enum (e.g. txn_status). */
export function defineStatusMap<S extends string>(map: Record<S, { tone: Tone; label: string }>) {
  return map;
}
