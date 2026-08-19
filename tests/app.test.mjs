import test from 'node:test';
import assert from 'node:assert/strict';
import { nextChapter, collectStar, deriveConstellation } from '../app.js';

test('nextChapter moves through the chapter rail without exceeding bounds', () => {
  assert.equal(nextChapter(0, 1), 1);
  assert.equal(nextChapter(9, 1), 9);
  assert.equal(nextChapter(0, -1), 0);
});

test('collectStar is idempotent and preserves previous stars', () => {
  const first = collectStar([], 'AI');
  assert.deepEqual(first, ['AI']);
  assert.deepEqual(collectStar(first, 'AI'), ['AI']);
  assert.deepEqual(collectStar(first, 'GAME'), ['AI', 'GAME']);
});

test('deriveConstellation is deterministic and names the selected route', () => {
  assert.equal(deriveConstellation(['AI', 'GAME']), '想象航线');
  assert.equal(deriveConstellation(['CITY', 'GAME', 'AI', 'ANIME']), '夜行者协议');
  assert.equal(deriveConstellation([]), '低耗电模式');
});
