import { MONAD_TESTNET } from './config.mjs';
import { keccak256 } from './evm.mjs';

const $ = (selector) => document.querySelector(selector);
const BYTECODE_URL = '../out/contracts_OpenFeedRegistry_sol_OpenFeedRegistry.bin';
const REGISTRY_STORAGE_KEY = 'unbubble:registry-address';
const state = { account: null, bytecode: null, deploying: false };

function setMessage(stage, message) {
  $('#deployStage').textContent = stage;
  $('#deployMessage').textContent = message;
}

function markStep(step, status) {
  const item = $(`[data-step="${step}"]`);
  item.classList.remove('active', 'complete', 'failed');
  if (status) item.classList.add(status);
}

function hexBytes(hex) {
  return Uint8Array.from(hex.match(/.{2}/g) || [], (pair) => Number.parseInt(pair, 16));
}

function formatMon(hexValue) {
  const wei = BigInt(hexValue);
  const whole = wei / 10n ** 18n;
  const fraction = ((wei % 10n ** 18n) / 10n ** 14n).toString().padStart(4, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''} MON`;
}

function explainError(error) {
  if (error?.code === 4001) return '你在钱包中取消了操作，链上没有发生变化。';
  if (error?.code === -32002) return '钱包里已有一个待处理请求，请先打开钱包完成或取消它。';
  const message = String(error?.message || error || '未知错误');
  if (/insufficient funds/i.test(message)) return '测试网 MON 不足，领取测试币后再部署。';
  if (/failed to fetch|network|rpc/i.test(message)) return '钱包无法连接 Monad Testnet RPC，请检查网络或钱包中的 RPC 设置。';
  return message.replace(/^Internal JSON-RPC error\.\s*/i, '');
}

async function loadBuild() {
  markStep('build', 'active');
  try {
    const response = await fetch(BYTECODE_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`无法读取编译产物（HTTP ${response.status}）`);
    const raw = (await response.text()).trim();
    if (!raw || raw.length % 2 || !/^[0-9a-f]+$/i.test(raw)) throw new Error('编译字节码格式无效');
    state.bytecode = `0x${raw}`;
    const fingerprint = keccak256(hexBytes(raw));
    $('#buildState').textContent = `已验证 · ${raw.length / 2} bytes`;
    $('#buildFingerprint').textContent = `keccak256 ${fingerprint.slice(0, 16)}…${fingerprint.slice(-8)}`;
    markStep('build', 'complete');
    setMessage('等待钱包', '构建已就绪。连接钱包后将切换到 Monad Testnet。');
  } catch (error) {
    $('#buildState').textContent = '构建不可用';
    $('#buildFingerprint').textContent = explainError(error);
    markStep('build', 'failed');
    setMessage('无法部署', '请先重新编译 OpenFeedRegistry 合约。');
  }
}

async function ensureMonadChain(provider) {
  const current = await provider.request({ method: 'eth_chainId' });
  if (current === MONAD_TESTNET.chainHex) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MONAD_TESTNET.chainHex }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({
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

async function refreshWalletSummary(provider) {
  const balanceHex = await provider.request({ method: 'eth_getBalance', params: [state.account, 'latest'] });
  $('#walletAddress').textContent = state.account;
  $('#walletBalance').textContent = formatMon(balanceHex);
  $('#walletSummary').hidden = false;
  $('#connectDeployWallet').textContent = `${state.account.slice(0, 6)}…${state.account.slice(-4)} · 已连接`;
  $('#deployRegistry').disabled = !state.bytecode || BigInt(balanceHex) === 0n;
  if (BigInt(balanceHex) === 0n) {
    setMessage('需要测试币', '钱包已连接，但余额为 0 MON。领取测试币后重新连接。');
  } else {
    setMessage('可以部署', '点击部署后，先检查钱包显示的网络与 Gas，再确认交易。');
  }
}

async function connectWallet() {
  const provider = window.ethereum;
  if (!provider) {
    setMessage('未检测到钱包', '请用安装了 MetaMask 或 Rabby 扩展的 Chrome / Edge 打开此页面。');
    markStep('wallet', 'failed');
    return;
  }

  markStep('wallet', 'active');
  $('#connectDeployWallet').disabled = true;
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    await ensureMonadChain(provider);
    state.account = accounts[0];
    await refreshWalletSummary(provider);
    markStep('wallet', 'complete');
  } catch (error) {
    markStep('wallet', 'failed');
    setMessage('钱包连接失败', explainError(error));
  } finally {
    $('#connectDeployWallet').disabled = false;
  }
}

async function waitForReceipt(provider, transactionHash) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const receipt = await provider.request({ method: 'eth_getTransactionReceipt', params: [transactionHash] });
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error('交易仍在等待确认。请在区块浏览器中用交易哈希继续查看。');
}

async function deployRegistry() {
  const provider = window.ethereum;
  if (!provider || !state.account || !state.bytecode || state.deploying) return;
  state.deploying = true;
  $('#deployRegistry').disabled = true;
  markStep('transaction', 'active');
  setMessage('估算 Gas', '正在用当前区块状态估算部署所需 Gas。');

  try {
    const transaction = { from: state.account, data: state.bytecode };
    const gas = await provider.request({ method: 'eth_estimateGas', params: [transaction] });
    setMessage('等待钱包确认', `估算 Gas：${BigInt(gas).toLocaleString('en-US')}。请在钱包中核对并确认。`);
    const transactionHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ ...transaction, gas }],
    });
    setMessage('交易已发送', `${transactionHash.slice(0, 12)}… 正在等待 Monad Testnet 确认。`);
    const receipt = await waitForReceipt(provider, transactionHash);
    if (receipt.status !== '0x1' || !receipt.contractAddress) throw new Error('部署交易执行失败');
    markStep('transaction', 'complete');
    markStep('verify', 'active');

    const code = await provider.request({ method: 'eth_getCode', params: [receipt.contractAddress, 'latest'] });
    if (!code || code === '0x') throw new Error('交易已确认，但部署地址上没有检测到合约代码');
    const recipeCountSelector = `0x${keccak256('recipeCount()').slice(0, 8)}`;
    const recipeCountHex = await provider.request({
      method: 'eth_call',
      params: [{ to: receipt.contractAddress, data: recipeCountSelector }, 'latest'],
    });
    const recipeCount = Number(BigInt(recipeCountHex));
    localStorage.setItem(REGISTRY_STORAGE_KEY, receipt.contractAddress);

    $('#contractAddress').textContent = receipt.contractAddress;
    $('#verificationCopy').textContent = `已检测到链上代码，并读取到 ${recipeCount} 套基础配方。地址已保存到本地产品。`;
    $('#explorerLink').href = `${MONAD_TESTNET.explorerUrl}/address/${receipt.contractAddress}`;
    $('#deploymentResult').hidden = false;
    markStep('verify', 'complete');
    setMessage('部署完成', '返回产品并刷新，即可用这个注册表发布新的配方版本。');
  } catch (error) {
    const activeStep = $('[data-step="verify"]').classList.contains('active') ? 'verify' : 'transaction';
    markStep(activeStep, 'failed');
    setMessage('部署未完成', explainError(error));
    $('#deployRegistry').disabled = false;
  } finally {
    state.deploying = false;
  }
}

$('#connectDeployWallet').addEventListener('click', connectWallet);
$('#deployRegistry').addEventListener('click', deployRegistry);
$('#copyContractAddress').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('#contractAddress').textContent);
  $('#copyContractAddress').textContent = '已复制';
});

window.ethereum?.on?.('accountsChanged', (accounts) => {
  state.account = accounts[0] || null;
  if (!state.account) location.reload();
  else refreshWalletSummary(window.ethereum).catch(() => location.reload());
});
window.ethereum?.on?.('chainChanged', () => location.reload());

loadBuild();
