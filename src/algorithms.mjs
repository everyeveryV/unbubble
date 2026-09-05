const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export function stableUnit(value) {
  let hash = 2166136261;
  const input = String(value);
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function stanceDistance(itemStance, userStance) {
  return clamp(Math.abs(itemStance - userStance) / 2);
}

export function calibrateStance(answers, questionWeights) {
  const denominator = questionWeights.reduce((sum, weight) => sum + Math.abs(weight), 0) || 1;
  return clamp(
    answers.reduce((sum, answer, index) => sum + answer * questionWeights[index], 0) / denominator,
    -1,
    1,
  );
}

function ageScore(publishedAt, referenceDate) {
  const ageDays = Math.max(0, (new Date(referenceDate) - new Date(publishedAt)) / 86_400_000);
  return clamp(1 - Math.log10(ageDays + 1) / 3.4);
}

function domainFrequency(items) {
  return items.reduce((counts, item) => {
    counts[item.sourceDomain] = (counts[item.sourceDomain] || 0) + 1;
    return counts;
  }, {});
}

export function scoreEngagement(item, { userStance, referenceDate }) {
  const features = {
    similarity: 1 - stanceDistance(item.stance, userStance),
    relevance: item.relevance,
    engagement: item.engagementPotential,
    recency: ageScore(item.publishedAt, referenceDate),
  };
  const components = {
    similarity: features.similarity * 40,
    relevance: features.relevance * 30,
    engagement: features.engagement * 25,
    recency: features.recency * 5,
  };
  return { total: clamp(Object.values(components).reduce((a, b) => a + b, 0), 0, 100), features, components };
}

export function rankEngagement(items, options) {
  return items
    .map((item) => ({ item, score: scoreEngagement(item, options) }))
    .sort((left, right) => right.score.total - left.score.total || left.item.id.localeCompare(right.item.id));
}

export function normalizedWeights(weights) {
  const total = Object.values(weights).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.max(0, Number(value) || 0) / total]));
}

export function scoreOpen(item, options) {
  const {
    userStance,
    targetDistance,
    weights,
    seed,
    frequencies,
    selectedSourceCounts = {},
  } = options;
  const itemDistance = stanceDistance(item.stance, userStance);
  const maxFrequency = Math.max(...Object.values(frequencies), 1);
  const alreadySelected = selectedSourceCounts[item.sourceDomain] || 0;
  const features = {
    relevance: item.relevance,
    distance: clamp(1 - Math.abs(itemDistance - targetDistance) / 0.7),
    novelty: clamp(0.55 * item.sourceIndependence + 0.45 * (1 - (frequencies[item.sourceDomain] - 1) / maxFrequency)),
    evidence: item.evidenceStrength,
    exploration: stableUnit(`${seed}:${item.id}`),
    repetition: clamp(alreadySelected / 2),
  };
  const normalized = normalizedWeights(weights);
  const components = {
    relevance: features.relevance * normalized.relevance * 100,
    distance: features.distance * normalized.distance * 100,
    novelty: features.novelty * normalized.novelty * 100,
    evidence: features.evidence * normalized.evidence * 100,
    exploration: features.exploration * normalized.exploration * 100,
    repetition: -features.repetition * normalized.repetition * 100,
  };
  return {
    total: clamp(Object.values(components).reduce((a, b) => a + b, 0), 0, 100),
    itemDistance,
    features,
    components,
  };
}

export function rankOpen(items, options) {
  const frequencies = domainFrequency(items);
  const selectedSourceCounts = {};
  const remaining = [...items];
  const ranked = [];

  while (remaining.length) {
    const candidates = remaining
      .map((item) => ({
        item,
        score: scoreOpen(item, { ...options, frequencies, selectedSourceCounts }),
      }))
      .sort((left, right) => right.score.total - left.score.total || left.item.id.localeCompare(right.item.id));
    const next = candidates[0];
    ranked.push(next);
    selectedSourceCounts[next.item.sourceDomain] = (selectedSourceCounts[next.item.sourceDomain] || 0) + 1;
    remaining.splice(remaining.findIndex((item) => item.id === next.item.id), 1);
  }
  return ranked;
}

export function calculateNutrition(ranked, userStance, limit = 10) {
  const slice = ranked.slice(0, limit);
  const distances = slice.map(({ item }) => stanceDistance(item.stance, userStance));
  const sources = new Set(slice.map(({ item }) => item.sourceDomain));
  const sourceCounts = slice.reduce((counts, { item }) => {
    counts[item.sourceDomain] = (counts[item.sourceDomain] || 0) + 1;
    return counts;
  }, {});
  const maxSourceCount = Math.max(...Object.values(sourceCounts), 0);
  const ratio = (predicate) => slice.filter(predicate).length / (slice.length || 1);

  return {
    near: ratio((_, index) => distances[index] < 0.25),
    bridge: ratio((_, index) => distances[index] >= 0.25 && distances[index] < 0.55),
    different: ratio((_, index) => distances[index] >= 0.55),
    sourceVariety: sources.size / (slice.length || 1),
    concentration: maxSourceCount / (slice.length || 1),
    evidence: ratio(({ item }) => item.evidenceStrength >= 0.65),
    originalSources: ratio(({ item }) => ['官方资料', '研究报告'].includes(item.sourceType)),
  };
}

export function canonicalRecipe(recipe) {
  const keys = ['relevance', 'distance', 'novelty', 'evidence', 'exploration', 'repetition'];
  return JSON.stringify({
    parentId: recipe.parentId || 0,
    weights: Object.fromEntries(keys.map((key) => [key, Number(recipe.weights[key]) || 0])),
    manifest: recipe.manifest || '',
  });
}

export function shortFingerprint(value) {
  const parts = [0, 1, 2, 3].map((salt) => Math.floor(stableUnit(`${salt}:${value}`) * 0xffffffff).toString(16).padStart(8, '0'));
  return `0x${parts.join('')}`;
}

export { clamp };
