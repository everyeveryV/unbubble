import test from 'node:test';
import assert from 'node:assert/strict';
import { FEED_ITEMS, QUESTION_WEIGHTS, RECIPES, SNAPSHOT } from '../data/feed.mjs';
import {
  calibrateStance,
  calculateNutrition,
  normalizedWeights,
  rankEngagement,
  rankOpen,
  stanceDistance,
} from '../src/algorithms.mjs';
import { encodePublishRecipe, keccak256, weightsToBps } from '../src/evm.mjs';
import { calibrationQuestionsEn, contentEn, messages } from '../src/i18n.mjs';

test('calibration stays in range and respects question direction', () => {
  assert.equal(calibrateStance([0, 0, 0, 0, 0], QUESTION_WEIGHTS), 0);
  assert.ok(calibrateStance([1, 1, -1, -1, 1], QUESTION_WEIGHTS) > 0.95);
  assert.ok(calibrateStance([-1, -1, 1, 1, -1], QUESTION_WEIGHTS) < -0.95);
});

test('stance distance is normalized to zero through one', () => {
  assert.equal(stanceDistance(-1, -1), 0);
  assert.equal(stanceDistance(-1, 1), 1);
  assert.equal(stanceDistance(-0.5, 0.5), 0.5);
});

test('weight normalization accepts edited totals', () => {
  const normalized = normalizedWeights({ relevance: 2, distance: 1, novelty: 1, evidence: 0, exploration: 0, repetition: 0 });
  assert.equal(normalized.relevance, 0.5);
  assert.equal(Object.values(normalized).reduce((a, b) => a + b, 0), 1);
});

test('both feeds contain the exact same content pool with stable ordering', () => {
  const engagement = rankEngagement(FEED_ITEMS, { userStance: 0.2, referenceDate: SNAPSHOT.capturedAt });
  const options = { userStance: 0.2, targetDistance: 0.4, weights: RECIPES.bridge.weights, seed: 'test-seed' };
  const openA = rankOpen(FEED_ITEMS, options);
  const openB = rankOpen(FEED_ITEMS, options);
  const ids = FEED_ITEMS.map((item) => item.id).sort();
  assert.deepEqual(engagement.map(({ item }) => item.id).sort(), ids);
  assert.deepEqual(openA.map(({ item }) => item.id).sort(), ids);
  assert.deepEqual(openA.map(({ item }) => item.id), openB.map(({ item }) => item.id));
});

test('distance control materially changes the top of Open Feed', () => {
  const base = { userStance: -0.45, weights: RECIPES.bridge.weights, seed: 'distance-test' };
  const familiar = rankOpen(FEED_ITEMS, { ...base, targetDistance: 0.15 }).slice(0, 5).map(({ item }) => item.id);
  const explore = rankOpen(FEED_ITEMS, { ...base, targetDistance: 0.7 }).slice(0, 5).map(({ item }) => item.id);
  assert.notDeepEqual(familiar, explore);
});

test('nutrition metrics are valid proportions', () => {
  const ranked = rankOpen(FEED_ITEMS, { userStance: 0, targetDistance: 0.4, weights: RECIPES.source.weights, seed: 'metrics' });
  const metrics = calculateNutrition(ranked, 0);
  Object.values(metrics).forEach((value) => assert.ok(value >= 0 && value <= 1));
  assert.equal(metrics.near + metrics.bridge + metrics.different, 1);
});

test('Keccak and ABI encoder match Ethereum conventions', () => {
  assert.equal(keccak256(''), 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');
  const bps = weightsToBps(RECIPES.bridge.weights, ['relevance', 'distance', 'novelty', 'evidence', 'exploration', 'repetition']);
  assert.equal(bps.reduce((sum, value) => sum + value, 0), 10_000);
  const calldata = encodePublishRecipe({ parentId: 12, name: 'Bridge Fork', weightsBps: bps, contentManifest: 'manifest-v1' });
  assert.match(calldata, /^0x[0-9a-f]+$/);
  assert.equal((calldata.length - 2) % 64, 8, 'four-byte selector precedes ABI words');
});

test('English localization covers every content item and calibration question', () => {
  assert.equal(calibrationQuestionsEn.length, 5);
  assert.equal(Object.keys(contentEn).length, FEED_ITEMS.length);
  FEED_ITEMS.forEach((item) => assert.ok(contentEn[item.id]?.summary, `missing English summary for ${item.id}`));
  assert.equal(Object.keys(messages.zh).length, Object.keys(messages.en).length);
});
