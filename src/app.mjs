import { CALIBRATION_QUESTIONS, FEED_ITEMS, QUESTION_WEIGHTS, RECIPES, SNAPSHOT } from '../data/feed.mjs';
import {
  calibrateStance,
  calculateNutrition,
  canonicalRecipe,
  rankEngagement,
  rankOpen,
  shortFingerprint,
  stanceDistance,
} from './algorithms.mjs';
import { CONTENT_MANIFEST_ID, MONAD_TESTNET, REGISTRY_ADDRESS } from './config.mjs';
import { encodePublishRecipe, weightsToBps } from './evm.mjs';
import { calibrationQuestionsEn, conflictEn, contentEn, formatMessage, messages, sourceTypeEn } from './i18n.mjs';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const html = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const weightKeys = ['relevance', 'distance', 'novelty', 'evidence', 'exploration', 'repetition'];
const recipePresentation = {
  bridge: { glyph: '桥', title: 'presetBridge', description: 'presetBridgeDesc', effect: 'bridgeEffect' },
  source: { glyph: '源', title: 'presetSource', description: 'presetSourceDesc', effect: 'sourceEffect' },
  evidence: { glyph: '证', title: 'presetEvidence', description: 'presetEvidenceDesc', effect: 'evidenceEffect' },
};
const distancePresets = [
  { value: 0.15, labelKey: 'familiar' },
  { value: 0.4, labelKey: 'balanced' },
  { value: 0.7, labelKey: 'explore' },
];
const REGISTRY_STORAGE_KEY = 'unbubble:registry-address';

const storedStance = sessionStorage.getItem('unbubble:stance');
const requestedLocale = new URLSearchParams(location.search).get('lang');
const storedRecipeId = localStorage.getItem('unbubble:active-recipe');
const initialRecipeId = RECIPES[storedRecipeId] ? storedRecipeId : 'bridge';
const state = {
  locale: requestedLocale || localStorage.getItem('unbubble:language') || 'zh',
  userStance: storedStance === null ? 0 : Number(storedStance),
  targetDistance: 0.4,
  recipeId: initialRecipeId,
  weights: structuredClone(RECIPES[initialRecipeId].weights),
  appliedRecipeId: RECIPES[storedRecipeId] ? storedRecipeId : null,
  editMode: false,
  weightsDirty: false,
  answers: [],
  calibrationIndex: 0,
  metricFeed: 'open',
  view: 'compare',
  seenItems: new Set(),
  readSteps: new Set([0]),
  account: null,
  chainId: null,
  seed: sessionStorage.getItem('unbubble:seed') || `${Date.now()}-${Math.random()}`,
  rankings: { engagement: [], open: [] },
};
if (!messages[state.locale]) state.locale = 'zh';
sessionStorage.setItem('unbubble:seed', state.seed);
document.body.dataset.view = state.view;

function t(key, variables) {
  return formatMessage(messages[state.locale][key] || messages.zh[key] || key, variables);
}

function registryAddress() {
  const stored = localStorage.getItem(REGISTRY_STORAGE_KEY);
  return /^0x[0-9a-fA-F]{40}$/.test(stored || '') ? stored : REGISTRY_ADDRESS;
}

function localItem(item) {
  if (state.locale !== 'en') return item;
  const translated = contentEn[item.id] || {};
  return { ...item, title: translated.title || item.title, summary: translated.summary || item.summary, sourceType: sourceTypeEn[item.sourceType] || item.sourceType };
}

function applyStaticLocale() {
  const set = (selector, key) => { const element = $(selector); if (element) element.textContent = t(key); };
  document.documentElement.lang = state.locale === 'zh' ? 'zh-CN' : 'en';
  document.title = state.locale === 'zh' ? 'Unbubble — 开放推荐算法实验台' : 'Unbubble — Open recommendation lab';
  $('meta[name="description"]').content = state.locale === 'zh' ? 'Unbubble — 比较、检查和 Fork 推荐算法。' : 'Unbubble — compare, inspect, and fork recommendation algorithms.';
  $('.skip-link').textContent = state.locale === 'zh' ? '跳到 Feed' : 'Skip to feeds';
  set('.brand-lockup p', 'brandTag');
  set('.topic-lockup span', 'currentTopic');
  set('.topic-lockup strong', 'topic');
  set('.hero-kicker', 'heroKicker');
  set('#heroTitle', 'heroTitle');
  set('.hero-lede', 'heroLead');
  set('.hero-cta span', 'heroCta');
  $('.hero-collage').setAttribute('aria-label', t('heroPreviewLabel'));
  set('.hero-card-feed header span', 'heroPool');
  set('.hero-card-feed footer span:first-child', 'mobileEngagement');
  set('.hero-card-feed footer span:last-child', 'mobileOpen');
  set('.hero-card-recipe small', 'recipe');
  set('.hero-card-recipe strong', 'presetBridge');
  set('.hero-card-recipe p', 'heroRecipeHint');
  set('.hero-card-question p', 'heroQuestion');
  set('.hero-card-path small', 'heroPath');
  set('.hero-card-path strong', 'heroPathProgress');
  set('.hero-card-metric small', 'variety');
  set('.hero-card-metric p', 'heroSourceCount');
  set('.hero-card-chain small', 'heroNetwork');
  set('.hero-card-chain strong', 'heroVerified');
  set('.hero-card-chain > span em', 'heroOnchain');
  $('#networkLabel').textContent = state.account ? t('connectedNetwork') : t('network');
  $('#walletButton').textContent = state.account ? `${state.account.slice(0, 6)}…${state.account.slice(-4)}` : t('connectWallet');
  $('.status-strip > span:nth-child(1)').innerHTML = `<strong>20</strong> ${t('contentCount')}`;
  $('.status-strip > span:nth-child(2)').innerHTML = `<strong id="sourceCount">${new Set(FEED_ITEMS.map((item) => item.sourceDomain)).size}</strong> ${t('sourceCount')}`;
  set('.status-strip > span:nth-child(3)', 'snapshot');
  set('.status-strip > span:nth-child(4)', 'originalLinks');
  set('#recalibrateButton', 'recalibrate');
  set('.stance-readout h2', 'yourStance');
  set('.stance-axis span:first-child', 'culture');
  set('.stance-axis span:last-child', 'speculation');
  set('.control-rail > .rail-section:nth-child(2) h2', 'bubbleDistance');
  set('.range-labels span:nth-child(1)', 'familiar');
  set('.range-labels span:nth-child(2)', 'balanced');
  set('.range-labels span:nth-child(3)', 'explore');
  set('.control-rail > .rail-section:nth-child(2) > p', 'distanceDesc');
  set('.recipe-section h2', 'recipeQuestion');
  set('.recipe-intro', 'recipeIntro');
  set('.advanced-settings summary > span', 'advancedSettings');
  set('.advanced-settings summary > small', 'sixWeights');
  set('#resetWeights', 'resetRecipe');
  set('.mobile-tabs [data-view="engagement"]', 'mobileEngagement');
  set('.mobile-tabs [data-view="compare"]', 'compare');
  set('.mobile-tabs [data-view="open"]', 'mobileOpen');
  set('.mobile-tabs [data-view="raw"]', 'mobileRaw');
  set('.engagement-title p', 'engagementDesc');
  set('.open-title p', 'openDesc');
  set('.same-pool-stamp span', 'samePool');
  set('.metric-header > span', 'currentRead');
  set('.metric-header h2', 'nutrition');
  set('#metricEngagement', 'mobileEngagement');
  set('#metricOpen', 'mobileOpen');
  set('.bridge-path h2', 'path');
  set('.path-intro', 'pathIntro');
  ['path0', 'path1', 'path2', 'path3', 'path4'].forEach((key, index) => {
    const item = $(`#bridgePath [data-step="${index}"]`);
    if (item) item.childNodes[item.childNodes.length - 1].textContent = t(key);
  });
  set('.method-note h2', 'labelMethod');
  set('.method-note p', 'labelMethodDesc');
  set('#methodButton', 'seeScale');
  set('#calibrationDialog h2', 'calibrationHeading');
  set('#calibrationDialog form > p', 'calibrationPrivacy');
  const answers = $$('#calibrationDialog [data-answer]');
  const answerCopy = [['disagree', 'disagreeHint'], ['uncertain', 'uncertainHint'], ['agree', 'agreeHint']];
  answers.forEach((button, index) => {
    $('span', button).textContent = t(answerCopy[index][0]);
    $('small', button).textContent = t(answerCopy[index][1]);
  });
  set('#calibrationSkip', 'neutral');
  set('#methodDialog .dialog-kicker', 'methodKicker');
  set('#methodDialog h2', 'methodHeading');
  const methodRows = $$('#methodDialog .method-grid > div');
  const methodCopy = ['methodMinus', 'methodZero', 'methodPlus', 'methodEvidence'];
  methodRows.forEach((row, index) => {
    $('dt', row).textContent = index === 3 ? (state.locale === 'zh' ? '证据 0–1' : 'Evidence 0–1') : `${state.locale === 'zh' ? '立场' : 'Stance'} ${['−1', '0', '+1'][index]}`;
    $('dd', row).textContent = t(methodCopy[index]);
  });
  $$('.dialog-close').forEach((button) => button.setAttribute('aria-label', t('close')));
  $$('.language-switch button').forEach((button) => {
    const active = button.dataset.language === state.locale;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function setLocale(locale) {
  if (!messages[locale] || locale === state.locale) return;
  state.locale = locale;
  localStorage.setItem('unbubble:language', locale);
  applyStaticLocale();
  renderAll();
  if ($('#calibrationDialog').open) updateCalibrationQuestion();
}

function formatDate(value) {
  return new Intl.DateTimeFormat(state.locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function stanceText(value) {
  if (value < -0.28) return t('stanceCulture');
  if (value > 0.28) return t('stanceRisk');
  return t('stanceMiddle');
}

function getRankings() {
  state.rankings.engagement = rankEngagement(FEED_ITEMS, {
    userStance: state.userStance,
    referenceDate: SNAPSHOT.capturedAt,
  });
  state.rankings.open = rankOpen(FEED_ITEMS, {
    userStance: state.userStance,
    targetDistance: state.targetDistance,
    weights: state.weights,
    seed: state.seed,
  });
}

function renderStance() {
  $('#stanceValue').textContent = `${state.userStance >= 0 ? '+' : ''}${state.userStance.toFixed(2)}`;
  $('#stanceMarker').style.left = `${(state.userStance + 1) * 50}%`;
  $('#stanceCopy').textContent = t('stanceLead', { value: stanceText(state.userStance) });
  const preset = distancePresets.find((entry) => entry.value === state.targetDistance);
  $('#distanceValue').textContent = `${t(preset.labelKey)} · ${preset.value.toFixed(2)}`;
}

function renderRecipes() {
  $('#recipeTabs').innerHTML = Object.entries(RECIPES).map(([id, recipe]) => {
    const presentation = recipePresentation[id];
    return `<button type="button" role="tab" aria-selected="${id === state.recipeId}" class="${id === state.recipeId ? 'active' : ''}" data-recipe="${id}">
      <span class="recipe-glyph" aria-hidden="true">${presentation.glyph}</span>
      <span class="recipe-tab-copy"><strong>${t(presentation.title)}</strong><small>${t(presentation.description)}</small></span>
      <span class="recipe-check" aria-hidden="true">✓</span>
    </button>`;
  }).join('');
  $('#recipeEffect').textContent = t(recipePresentation[state.recipeId].effect);

  $('#weightControls').innerHTML = weightKeys.map((key) => `
    <div class="weight-control">
      <label for="weight-${key}">${t(key)}</label>
      <input id="weight-${key}" data-weight="${key}" type="range" min="0" max="45" step="1" value="${state.weights[key]}" ${state.editMode ? '' : 'disabled'} />
      <output>${state.weights[key]}</output>
    </div>`).join('');
  const total = Object.values(state.weights).reduce((sum, value) => sum + value, 0);
  $('#weightTotal').textContent = total === 100 ? '100%' : t('normalized', { value: total });
  $('#resetWeights').disabled = !state.editMode;
  renderRecipeActions();
}

function renderRecipeActions() {
  const isApplied = state.appliedRecipeId === state.recipeId && !state.editMode;
  const useButton = $('#useRecipeButton');
  const forkButton = $('#forkRecipeButton');
  const publishButton = $('#publishButton');

  $('#baseRecipeLabel').textContent = `#${RECIPES[state.recipeId].parentId} ${RECIPES[state.recipeId].name}`;
  if (state.editMode) {
    $('#lineageCurrent').textContent = t('editingFork');
    useButton.hidden = true;
    publishButton.hidden = false;
    publishButton.disabled = !state.weightsDirty;
    publishButton.textContent = state.weightsDirty ? t('publishVersion') : t('adjustFirst');
    forkButton.textContent = t('cancelModify');
    $('#recipeActionHint').textContent = t('editHint');
    return;
  }

  $('#lineageCurrent').textContent = t(isApplied ? 'inUse' : 'previewing');
  useButton.hidden = false;
  useButton.disabled = isApplied;
  useButton.textContent = isApplied ? t('inUse') : t('useRecipe');
  forkButton.textContent = t('copyModify');
  publishButton.hidden = true;
  publishButton.disabled = true;
  $('#recipeActionHint').textContent = t('actionHint');
}

function renderCard(entry, rank, feedType) {
  const { score } = entry;
  const item = localItem(entry.item);
  const accentLabel = feedType === 'open' ? t('distanceScore', { value: score.itemDistance.toFixed(2) }) : t('similarityScore', { value: Math.round(score.features.similarity * 100) });
  return `
    <article class="feed-card" data-item-id="${item.id}">
      <span class="feed-rank">${String(rank + 1).padStart(2, '0')}</span>
      <span class="feed-score" title="${t('scoreTitle')}">${Math.round(score.total)}</span>
      <div class="card-meta"><strong>${html(item.sourceName)}</strong><span>${formatDate(item.publishedAt)}</span><span>${html(item.sourceType)}</span></div>
      <h3>${html(item.title)}</h3>
      <p>${html(item.summary)}</p>
      <div class="stance-mini"><label>${accentLabel}</label><span class="stance-track"><i style="left:${(item.stance + 1) * 50}%"></i></span></div>
      <div class="card-actions">
        <button type="button" data-detail="${item.id}" data-feed="${feedType}">${t('whyHere')}</button>
        <a href="${html(item.url)}" target="_blank" rel="noopener noreferrer" data-read="${item.id}">${t('original')}</a>
      </div>
    </article>`;
}

function renderRawCard(item, rank) {
  item = localItem(item);
  return `
    <article class="feed-card" data-item-id="${item.id}">
      <span class="feed-rank">${String(rank + 1).padStart(2, '0')}</span>
      <div class="card-meta"><strong>${html(item.sourceName)}</strong><span>${formatDate(item.publishedAt)}</span></div>
      <h3>${html(item.title)}</h3><p>${html(item.summary)}</p>
      <div class="card-actions"><a href="${html(item.url)}" target="_blank" rel="noopener noreferrer">${t('original')}</a></div>
    </article>`;
}

function renderFeeds() {
  $('#engagementFeed').innerHTML = state.rankings.engagement.map((entry, index) => renderCard(entry, index, 'engagement')).join('');
  $('#openFeed').innerHTML = state.rankings.open.map((entry, index) => renderCard(entry, index, 'open')).join('');
  $('#rawFeed').innerHTML = [...FEED_ITEMS]
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt) || a.id.localeCompare(b.id))
    .map(renderRawCard).join('');
}

function renderNutrition() {
  const metrics = calculateNutrition(state.rankings[state.metricFeed], state.userStance);
  const rows = [
    [t('near'), metrics.near, 'var(--coral)', t('nearHint')],
    [t('bridge'), metrics.bridge, 'var(--yellow)', t('bridgeHint')],
    [t('different'), metrics.different, 'var(--teal)', t('differentHint')],
    [t('variety'), metrics.sourceVariety, 'var(--teal)', t('varietyHint')],
    [t('concentration'), metrics.concentration, 'var(--coral)', t('concentrationHint')],
    [t('strongEvidence'), metrics.evidence, 'var(--ink)', t('strongEvidenceHint')],
    [t('primarySources'), metrics.originalSources, 'var(--ink)', t('primarySourcesHint')],
  ];
  $('#nutritionMetrics').innerHTML = rows.map(([label, value, color, hint]) => `
    <div class="metric-row"><header><span>${label}</span><strong>${Math.round(value * 100)}%</strong></header>
    <small>${hint}</small>
    <div class="metric-bar" style="--metric-color:${color}"><i style="width:${value * 100}%"></i></div></div>`).join('') +
    `<p class="metric-note">${t('metricNote')}</p>`;
  $('#metricEngagement').classList.toggle('active', state.metricFeed === 'engagement');
  $('#metricOpen').classList.toggle('active', state.metricFeed === 'open');
}

function renderBridgePath() {
  $$('#bridgePath li').forEach((item, index) => item.classList.toggle('complete', state.readSteps.has(index)));
  $('#readProgress').textContent = t('pathProgress', { current: state.readSteps.size });
}

function renderAll() {
  getRankings();
  renderStance();
  renderRecipes();
  renderFeeds();
  renderNutrition();
  renderBridgePath();
}

function markRead(item) {
  state.seenItems.add(item.id);
  const distance = stanceDistance(item.stance, state.userStance);
  if (distance < 0.25) state.readSteps.add(1);
  if (item.evidenceStrength >= 0.72) state.readSteps.add(2);
  if (distance >= 0.4) state.readSteps.add(3);
  if (distance >= 0.65) state.readSteps.add(4);
  renderBridgePath();
}

function showDetails(itemId, feedType) {
  const entry = state.rankings[feedType].find(({ item }) => item.id === itemId);
  if (!entry) return;
  markRead(entry.item);
  const item = localItem(entry.item);
  const sortedComponents = Object.entries(entry.score.components).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  $('#detailContent').innerHTML = `
    <div class="dialog-kicker">${t('receipt', { feed: feedType === 'open' ? 'Open Feed' : 'Engagement Feed' })}</div>
    <h2>${html(item.title)}</h2>
    <p>${html(item.summary)}</p>
    <div class="reason-grid">${sortedComponents.map(([key, value]) => `
      <div class="reason-cell ${value < 0 ? 'negative' : ''}"><span>${t(key)}</span><strong>${value >= 0 ? '+' : ''}${value.toFixed(1)}</strong></div>`).join('')}</div>
    <dl class="source-facts">
      <div><dt>${t('totalScore')}</dt><dd>${entry.score.total.toFixed(1)} / 100</dd></div>
      <div><dt>${t('confidence')}</dt><dd>${Math.round(item.classificationConfidence * 100)}%</dd></div>
      <div><dt>${t('stanceCoordinate')}</dt><dd>${t('stanceCoordinateValue', { value: `${item.stance >= 0 ? '+' : ''}${item.stance.toFixed(2)}` })}</dd></div>
      <div><dt>${t('conflict')}</dt><dd>${html(state.locale === 'en' ? conflictEn[item.conflictOfInterest] || item.conflictOfInterest : item.conflictOfInterest)}</dd></div>
      <div><dt>${t('labelMethod')}</dt><dd>${t('humanCurated')}</dd></div>
      <div><dt>${t('source')}</dt><dd><a href="${html(item.url)}" target="_blank" rel="noopener noreferrer">${html(item.sourceDomain)} ↗</a></dd></div>
    </dl>`;
  $('#detailDialog').showModal();
}

function updateCalibrationQuestion() {
  const index = state.calibrationIndex;
  $('#calibrationQuestion').textContent = (state.locale === 'en' ? calibrationQuestionsEn : CALIBRATION_QUESTIONS)[index];
  $('#calibrationProgress').style.width = `${index / CALIBRATION_QUESTIONS.length * 100}%`;
  $('.dialog-kicker', $('#calibrationDialog')).textContent = t('calibrationKicker', { current: index + 1, total: CALIBRATION_QUESTIONS.length });
}

function finishCalibration(stance = null) {
  state.userStance = stance ?? calibrateStance(state.answers, QUESTION_WEIGHTS);
  sessionStorage.setItem('unbubble:stance', state.userStance);
  $('#calibrationDialog').close();
  renderAll();
  showToast(t('stanceUpdated', { value: `${state.userStance >= 0 ? '+' : ''}${state.userStance.toFixed(2)}` }));
}

function openCalibration() {
  state.answers = [];
  state.calibrationIndex = 0;
  updateCalibrationQuestion();
  $('#calibrationDialog').showModal();
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function recipePayload() {
  return {
    parentId: RECIPES[state.recipeId].parentId,
    weights: state.weights,
    manifest: CONTENT_MANIFEST_ID,
  };
}

function openPublish() {
  const payload = recipePayload();
  const fingerprint = shortFingerprint(canonicalRecipe(payload));
  const connected = Boolean(state.account);
  const registry = registryAddress();
  const ready = connected && state.chainId === MONAD_TESTNET.chainId && Boolean(registry);
  $('#publishContent').innerHTML = `
    <div class="dialog-kicker">${t('publishKicker')}</div>
    <h2>${t('publishHeading', { name: html(RECIPES[state.recipeId].name) })}</h2>
    <p>${t('publishIntro')}</p>
    <div class="publish-summary"><span>${t('fingerprint')}</span><code>${fingerprint}</code><span>${t('manifest')}</span><code>${CONTENT_MANIFEST_ID}</code></div>
    <div class="publish-weights">${weightKeys.map((key) => `<div><span>${t(key)}</span><strong>${state.weights[key]}</strong></div>`).join('')}</div>
    <p>${registry ? t('registry', { address: registry }) : t('registryMissing')}</p>
    <div class="publish-actions">
      <button class="button button-outline" type="button" id="downloadRecipe">${t('exportJson')}</button>
      <button class="button button-teal" type="button" id="publishAction" ${ready ? '' : 'disabled'}>${connected ? (ready ? t('sendTransaction') : t('chainNotReady')) : t('connectFirst')}</button>
    </div>`;
  $('#publishDialog').showModal();
  $('#downloadRecipe').addEventListener('click', downloadRecipe);
  $('#publishAction').addEventListener('click', sendPublishTransaction);
}

async function sendPublishTransaction() {
  const registry = registryAddress();
  if (!state.account || !registry) return;
  const name = `${RECIPES[state.recipeId].name} Fork`;
  const data = encodePublishRecipe({
    parentId: RECIPES[state.recipeId].parentId,
    name,
    weightsBps: weightsToBps(state.weights, weightKeys),
    contentManifest: CONTENT_MANIFEST_ID,
  });
  try {
    const transactionHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from: state.account, to: registry, data }],
    });
    $('#lineageCurrent').textContent = `待确认 ${transactionHash.slice(0, 10)}…`;
    $('#publishDialog').close();
    showToast(t('transactionSent'));
  } catch (error) {
    showToast(error?.message || t('transactionFailed'));
  }
}

function downloadRecipe() {
  const payload = { name: `${RECIPES[state.recipeId].name} Fork`, chainId: MONAD_TESTNET.chainId, ...recipePayload() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'unbubble-recipe.json';
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(t('exported'));
}

async function ensureMonadChain() {
  const ethereum = window.ethereum;
  const current = await ethereum.request({ method: 'eth_chainId' });
  if (current === MONAD_TESTNET.chainHex) return;
  try {
    await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_TESTNET.chainHex }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: MONAD_TESTNET.chainHex,
        chainName: MONAD_TESTNET.chainName,
        nativeCurrency: MONAD_TESTNET.nativeCurrency,
        rpcUrls: [MONAD_TESTNET.rpcUrl],
        blockExplorerUrls: [MONAD_TESTNET.explorerUrl],
      }],
    });
  }
}

async function connectWallet() {
  if (!window.ethereum) {
    showToast(t('noWallet'));
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    await ensureMonadChain();
    state.account = accounts[0];
    state.chainId = Number(await window.ethereum.request({ method: 'eth_chainId' }));
    $('#walletButton').textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)}`;
    $('#networkLabel').textContent = t('connectedNetwork');
    showToast(t('walletConnected'));
  } catch (error) {
    showToast(error?.message || t('walletFailed'));
  }
}

$('#distanceControl').addEventListener('input', (event) => {
  state.targetDistance = distancePresets[Number(event.target.value)].value;
  renderAll();
});
$('#recipeTabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-recipe]');
  if (!button) return;
  state.recipeId = button.dataset.recipe;
  state.weights = structuredClone(RECIPES[state.recipeId].weights);
  state.editMode = false;
  state.weightsDirty = false;
  renderAll();
});
$('#weightControls').addEventListener('input', (event) => {
  if (!state.editMode || !event.target.dataset.weight) return;
  state.weights[event.target.dataset.weight] = Number(event.target.value);
  state.weightsDirty = weightKeys.some((key) => state.weights[key] !== RECIPES[state.recipeId].weights[key]);
  event.target.parentElement.querySelector('output').textContent = event.target.value;
  const total = Object.values(state.weights).reduce((sum, value) => sum + value, 0);
  $('#weightTotal').textContent = total === 100 ? '100%' : t('normalized', { value: total });
  getRankings();
  renderFeeds();
  renderNutrition();
  renderRecipeActions();
});
$('#resetWeights').addEventListener('click', () => {
  if (!state.editMode) return;
  state.weights = structuredClone(RECIPES[state.recipeId].weights);
  state.weightsDirty = false;
  renderAll();
  showToast(t('resetDone'));
});

function useSelectedRecipe() {
  state.appliedRecipeId = state.recipeId;
  localStorage.setItem('unbubble:active-recipe', state.recipeId);
  renderRecipeActions();
  showToast(t('recipeApplied', { name: t(recipePresentation[state.recipeId].title) }));
}

function toggleForkMode() {
  if (state.editMode) {
    state.editMode = false;
    state.weightsDirty = false;
    state.weights = structuredClone(RECIPES[state.recipeId].weights);
    renderAll();
    showToast(t('forkCancelled'));
    return;
  }

  state.editMode = true;
  state.weightsDirty = false;
  $('#advancedSettings').open = true;
  renderRecipes();
  showToast(t('forkStarted'));
}
$('#feedColumns').addEventListener('click', (event) => {
  const detail = event.target.closest('[data-detail]');
  const read = event.target.closest('[data-read]');
  if (detail) showDetails(detail.dataset.detail, detail.dataset.feed);
  if (read) {
    const item = FEED_ITEMS.find((candidate) => candidate.id === read.dataset.read);
    if (item) markRead(item);
  }
});
$('#metricEngagement').addEventListener('click', () => { state.metricFeed = 'engagement'; renderNutrition(); });
$('#metricOpen').addEventListener('click', () => { state.metricFeed = 'open'; renderNutrition(); });
$('#recalibrateButton').addEventListener('click', openCalibration);
$('#calibrationSkip').addEventListener('click', () => finishCalibration(0));
$$('[data-answer]').forEach((button) => button.addEventListener('click', () => {
  state.answers.push(Number(button.dataset.answer));
  state.calibrationIndex += 1;
  if (state.calibrationIndex >= CALIBRATION_QUESTIONS.length) finishCalibration();
  else updateCalibrationQuestion();
}));
$('#methodButton').addEventListener('click', () => $('#methodDialog').showModal());
$('#useRecipeButton').addEventListener('click', useSelectedRecipe);
$('#forkRecipeButton').addEventListener('click', toggleForkMode);
$('#publishButton').addEventListener('click', () => {
  if (state.editMode && state.weightsDirty) openPublish();
});
$('#walletButton').addEventListener('click', connectWallet);
$$('.language-switch button').forEach((button) => button.addEventListener('click', () => setLocale(button.dataset.language)));
$$('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => $(`#${button.dataset.closeDialog}`).close()));
$$('.mobile-tabs button').forEach((button) => button.addEventListener('click', () => {
  state.view = button.dataset.view;
  document.body.dataset.view = state.view;
  $$('.mobile-tabs button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
}));

applyStaticLocale();
renderAll();
if (storedStance === null && new URLSearchParams(location.search).get('skipCalibration') !== '1') requestAnimationFrame(openCalibration);
