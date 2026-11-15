import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FONT, textWidth } from '../core/pixels.ts';

// index.html draws the first load's message inline (before any code loads), with its own copy of the glyphs.
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const F: Record<string, string> = JSON.parse(html.match(/const F = (\{.*\});/)![1]);
const M: string[] = JSON.parse(html.match(/const M = (\[.*\]);/)![1]);

test("the start-up message's inline glyphs are the game's own, and cover every message", () => {
  for (const [ch, glyph] of Object.entries(F)) assert.equal(glyph, FONT[ch], `glyph ${ch} matches src/core/pixels.ts`);
  assert.ok(M.length >= 10);
  for (const m of M) {
    for (const ch of m.replace(/ /g, '')) assert.ok(F[ch], `"${m}": glyph ${ch} is in the inline copy`);
    assert.ok(textWidth(m) <= 200, `"${m}" is short enough to sit on one or two lines`);
    assert.ok(!/\bRAF\b/.test(m), 'the RFC, not the RAF (formed in 1918)');
  }
});
