/**
 * Color math for the contrast check: WCAG 2.x relative luminance and contrast ratio.
 * https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */

/** Parses #RGB, #RGBA, #RRGGBB or #RRGGBBAA into { r, g, b, a } with channels in 0..1. */
export function parseHex(hex) {
  const match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a hex color: ${hex}`);
  let digits = match[1];
  if (digits.length <= 4) digits = [...digits].map((digit) => digit + digit).join('');
  const channel = (index) => parseInt(digits.slice(index, index + 2), 16) / 255;
  return { r: channel(0), g: channel(2), b: channel(4), a: digits.length === 8 ? channel(6) : 1 };
}

const linear = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

export function luminance({ r, g, b }) {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Paints a translucent color over an opaque backdrop. */
export function composite(color, backdrop) {
  const mix = (top, bottom) => top * color.a + bottom * (1 - color.a);
  return { r: mix(color.r, backdrop.r), g: mix(color.g, backdrop.g), b: mix(color.b, backdrop.b), a: 1 };
}

/** Contrast ratio between two opaque colors, from 1 to 21. Not rounded. */
export function contrastRatio(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}
