/**
 * Test fixtures shared by the token, generator and contrast tests:
 * a small token tree in the kit's shape, and a throwaway repository root to hold it.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXTENSION_KEY } from './tokens.mjs';

export const KIT = {
  primitive: {
    $type: 'color',
    Brand: { 'Electric Blue': { $value: '#0260FD' } },
    Dark: { 'dark-900': { $value: '#030303' }, 'dark-200': { $value: '#6A6A6A' } },
    Neutral: { 'neutral-50': { $value: '#F6F6F6' } },
    Blue: { 'blue-600': { $value: '#0260FD' } },
  },
  semantic: {
    $type: 'color',
    Background: { 'bg-primary': { $value: '{primitive.Dark.dark-900}' } },
    Text: {
      'text-primary': { $value: '{primitive.Neutral.neutral-50}' },
      'text-brand': { $value: '{primitive.Blue.blue-600}' },
    },
    Card: {
      'card-bg-translucent': {
        $value: '{primitive.Dark.dark-900}',
        $extensions: { [EXTENSION_KEY]: { alpha: 0.6 } },
      },
    },
  },
};

/** Writes token files into a temporary root, removed when the test ends. Returns the root. */
export function tokenFixture(t, { kit = KIT, extensions } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tokens-'));
  mkdirSync(join(root, 'tokens'));
  writeFileSync(join(root, 'tokens/tokens.json'), JSON.stringify(kit));
  if (extensions) writeFileSync(join(root, 'tokens/extensions.json'), JSON.stringify(extensions));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
