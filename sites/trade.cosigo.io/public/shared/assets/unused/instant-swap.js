(function () {
  const BSC_CHAIN_ID_HEX = '0x38';
  const BSC_CHAIN_ID_DEC = 56;

  const CIGO_TOKEN = '0x3a38e963f524E0dDFB75dFa1752b4Cd1364F5560';
  const BSC_USD_TOKEN = '0x55d398326f99059fF775485246999027B3197955';
  const PANCAKE_V2_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

  // Temporary safety caps for first live swap testing only.
  const SWAP_TEST_MAX_BSC_USD_RAW = 250000000000000000n; // 0.25 BSC-USD
  const SWAP_TEST_MAX_CIGO_RAW = 20000000000000000000n; // 20 CIGO

  const els = {
    cigoUsdt: document.getElementById('poolCigoUsdt'),
    cigoWbnb: document.getElementById('poolCigoWbnb'),
    total: document.getElementById('poolCigoTotal'),
    reserve: document.getElementById('poolReserveTotal'),
    updatedAt: document.getElementById('poolUpdatedAt'),

    connectBtn: document.getElementById('instantConnectBtn'),
    addCigoBtn: document.getElementById('instantAddCigoBtn'),
    quoteBtn: document.getElementById('instantQuoteBtn'),
    approveBtn: document.getElementById('instantApproveBtn'),
    approveDirectBtn: document.getElementById('instantApproveDirectBtn'),
    swapBtn: document.getElementById('instantSwapBtn'),
    checkAllowanceBtn: document.getElementById('instantCheckAllowanceBtn'),
    status: document.getElementById('instantStatus'),

    walletAddress: document.getElementById('instantWalletAddress'),
    walletNetwork: document.getElementById('instantWalletNetwork'),
    walletBNB: document.getElementById('instantWalletBNB'),
    walletCIGO: document.getElementById('instantWalletCIGO'),
    walletUSDT: document.getElementById('instantWalletUSDT'),

    fromToken: document.getElementById('fromToken'),
    toToken: document.getElementById('toToken'),
    amountIn: document.getElementById('amountIn'),
    estimatedOut: document.getElementById('estimatedOut'),
    slippageBps: document.getElementById('instantSlippageBps'),
    routeText: document.getElementById('instantRouteText'),
    priceText: document.getElementById('instantPriceText'),
    minReceivedText: document.getElementById('instantMinReceivedText'),
    allowanceText: document.getElementById('instantAllowanceText'),
  };

  let selectedAccount = '';
  let lastQuote = null;

  function setText(el, value) {
    if (el) el.textContent = value;
  }

  function setValue(el, value) {
    if (el) el.value = value;
  }

  function setStatus(value) {
    setText(els.status, value);
  }

  function fmt(value, digits = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'unavailable';
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  }

  function shortAddress(addr) {
    if (!addr || addr.length < 12) return addr || 'Not connected';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function hexToBigInt(value) {
    try {
      return BigInt(value || '0x0');
    } catch {
      return 0n;
    }
  }

  function formatUnits(raw, decimals = 18, digits = 4) {
    const value = typeof raw === 'bigint' ? raw : hexToBigInt(raw);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const fraction = value % base;

    let fractionText = fraction.toString().padStart(decimals, '0');
    fractionText = fractionText.slice(0, digits).replace(/0+$/, '');

    return fractionText ? `${whole}.${fractionText}` : whole.toString();
  }

  function parseUnits(value, decimals = 18) {
    const clean = String(value || '').trim().replace(/,/g, '');

    if (!/^\d+(\.\d+)?$/.test(clean)) {
      throw new Error('Enter a valid positive amount.');
    }

    const [whole, frac = ''] = clean.split('.');
    const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
    const raw = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, '');

    const out = BigInt(raw || '0');

    if (out <= 0n) {
      throw new Error('Amount must be greater than zero.');
    }

    return out;
  }

  function toHex32(value) {
    return BigInt(value).toString(16).padStart(64, '0');
  }

  function encodeAddress(addr) {
    return addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  }

  function balanceOfData(wallet) {
    return `0x70a08231${encodeAddress(wallet)}`;
  }

  function encodeApproveData(spender, amount) {
    // approve(address,uint256) selector: 0x095ea7b3
    return `0x095ea7b3${encodeAddress(spender)}${toHex32(amount)}`;
  }

  function encodeAllowanceData(owner, spender) {
    // allowance(address,address) selector: 0xdd62ed3e
    return `0xdd62ed3e${encodeAddress(owner)}${encodeAddress(spender)}`;
  }

  function decodeUint256(raw) {
    const hex = String(raw || '0x0').replace(/^0x/, '') || '0';
    return BigInt(`0x${hex}`);
  }

  function encodeGetAmountsOut(amountIn, path) {
    // getAmountsOut(uint256,address[]) selector: 0xd06ca61f
    const selector = 'd06ca61f';
    const offset = toHex32(64n);
    const length = toHex32(BigInt(path.length));
    const encodedPath = path.map(encodeAddress).join('');

    return `0x${selector}${toHex32(amountIn)}${offset}${length}${encodedPath}`;
  }

  function encodeSwapSupportingFeeData(amountIn, amountOutMin, path, recipient, deadline) {
    // swapExactTokensForTokensSupportingFeeOnTransferTokens(
    //   uint256 amountIn,
    //   uint256 amountOutMin,
    //   address[] path,
    //   address to,
    //   uint256 deadline
    // )
    // selector: 0x5c11d795
    const selector = '5c11d795';
    const pathOffset = 160n; // 5 static args * 32 bytes
    const encodedPath = path.map(encodeAddress).join('');

    return `0x${selector}` +
      `${toHex32(amountIn)}` +
      `${toHex32(amountOutMin)}` +
      `${toHex32(pathOffset)}` +
      `${encodeAddress(recipient)}` +
      `${toHex32(deadline)}` +
      `${toHex32(BigInt(path.length))}` +
      encodedPath;
  }

  function decodeGetAmountsOut(raw) {
    const hex = String(raw || '').replace(/^0x/, '');

    if (hex.length < 64 * 4) {
      throw new Error('Router quote returned no usable amount.');
    }

    const length = Number(BigInt(`0x${hex.slice(64, 128)}`));
    if (length < 2) {
      throw new Error('Router quote path was incomplete.');
    }

    const secondAmountStart = 128 + 64;
    const secondAmountHex = hex.slice(secondAmountStart, secondAmountStart + 64);

    return BigInt(`0x${secondAmountHex}`);
  }

  function tokenAddress(symbol) {
    if (symbol === 'CIGO') return CIGO_TOKEN;
    if (symbol === 'BSC-USD') return BSC_USD_TOKEN;
    throw new Error(`Unsupported token: ${symbol}`);
  }

  function tokenDigits(symbol) {
    if (symbol === 'CIGO') return 2;
    if (symbol === 'BSC-USD') return 4;
    return 4;
  }

  function formatDisplayNumber(value, digits = 4) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'unavailable';
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits,
    });
  }

  function minOutWithSlippage(amountOut, slippageBps) {
    const bps = BigInt(Number(slippageBps || 300));
    return amountOut * (10000n - bps) / 10000n;
  }

  function quotePriceText(from, to, amountInText, amountOutText) {
    const input = Number(String(amountInText || '').replace(/,/g, ''));
    const output = Number(String(amountOutText || '').replace(/,/g, ''));

    if (!Number.isFinite(input) || !Number.isFinite(output) || input <= 0 || output <= 0) {
      return 'unavailable';
    }

    if (from === 'BSC-USD' && to === 'CIGO') {
      return `1 CIGO ≈ ${formatDisplayNumber(input / output, 6)} BSC-USD`;
    }

    if (from === 'CIGO' && to === 'BSC-USD') {
      return `1 CIGO ≈ ${formatDisplayNumber(output / input, 6)} BSC-USD`;
    }

    return 'unavailable';
  }

  function normalizePair() {
    if (!els.fromToken || !els.toToken) return;

    if (els.fromToken.value === els.toToken.value) {
      els.toToken.value = els.fromToken.value === 'CIGO' ? 'BSC-USD' : 'CIGO';
    }
  }

  async function walletRequest(method, params = []) {
    if (!window.ethereum) {
      throw new Error('No wallet detected. Rabby Wallet is recommended.');
    }

    return window.ethereum.request({ method, params });
  }

  async function getChainId() {
    return walletRequest('eth_chainId');
  }

  async function ensureBsc() {
    const chainId = await getChainId();

    if (String(chainId).toLowerCase() === BSC_CHAIN_ID_HEX) {
      return true;
    }

    try {
      await walletRequest('wallet_switchEthereumChain', [
        { chainId: BSC_CHAIN_ID_HEX }
      ]);
      return true;
    } catch (err) {
      if (err && err.code === 4902) {
        await walletRequest('wallet_addEthereumChain', [{
          chainId: BSC_CHAIN_ID_HEX,
          chainName: 'BNB Smart Chain',
          nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18
          },
          rpcUrls: ['https://bsc-dataseed.binance.org/'],
          blockExplorerUrls: ['https://bscscan.com/']
        }]);
        return true;
      }

      throw err;
    }
  }

  async function getNativeBalance(wallet) {
    const raw = await walletRequest('eth_getBalance', [wallet, 'latest']);
    return formatUnits(raw, 18, 4);
  }

  async function getTokenBalance(token, wallet, decimals = 18) {
    const raw = await walletRequest('eth_call', [{
      to: token,
      data: balanceOfData(wallet)
    }, 'latest']);

    return formatUnits(raw, decimals, 4);
  }

  async function refreshWalletBalances() {
    if (!selectedAccount) return;

    const chainId = await getChainId();
    const chainText = Number(chainId) === BSC_CHAIN_ID_DEC || String(chainId).toLowerCase() === BSC_CHAIN_ID_HEX
      ? 'BNB Smart Chain'
      : `Wrong network (${chainId})`;

    setText(els.walletNetwork, chainText);

    const [bnb, cigo, usdt] = await Promise.all([
      getNativeBalance(selectedAccount),
      getTokenBalance(CIGO_TOKEN, selectedAccount, 18),
      getTokenBalance(BSC_USD_TOKEN, selectedAccount, 18),
    ]);

    setText(els.walletBNB, fmt(bnb, 4));
    setText(els.walletCIGO, fmt(cigo, 4));
    setText(els.walletUSDT, fmt(usdt, 4));
  }

  async function addCigoToWallet() {
    try {
      if (els.addCigoBtn) {
        els.addCigoBtn.textContent = 'opening wallet...';
      }

      setStatus('Requesting CIGO token import in wallet...');

      await ensureBsc();

      const imageUrl = `${window.location.origin}/shared/assets/icons/cigo_256.png`;

      const added = await walletRequest('wallet_watchAsset', {
        type: 'ERC20',
        options: {
          address: CIGO_TOKEN,
          symbol: 'CIGO',
          decimals: 18,
          image: imageUrl
        }
      });

      if (added) {
        setStatus('CIGO import request accepted by wallet.');
        if (els.addCigoBtn) {
          els.addCigoBtn.textContent = 'CIGO added / visible';
        }
      } else {
        setStatus('CIGO import was not completed.');
        if (els.addCigoBtn) {
          els.addCigoBtn.textContent = 'add CIGO to Rabby';
        }
      }
    } catch (err) {
      setStatus(err.message || 'Wallet could not import CIGO.');
      if (els.addCigoBtn) {
        els.addCigoBtn.textContent = 'add CIGO to Rabby';
      }
    }
  }

  async function connectWallet() {
    try {
      setText(els.walletAddress, 'Connecting...');
      setText(els.walletNetwork, 'Checking...');

      const accounts = await walletRequest('eth_requestAccounts');
      selectedAccount = accounts && accounts[0] ? accounts[0] : '';

      if (!selectedAccount) {
        throw new Error('No wallet account returned.');
      }

      await ensureBsc();

      setText(els.walletAddress, shortAddress(selectedAccount));
      if (els.walletAddress) {
        els.walletAddress.title = selectedAccount;
      }

      if (els.connectBtn) {
        els.connectBtn.textContent = 'wallet connected';
      }

      await refreshWalletBalances();
      setStatus('Wallet connected. Estimate mode is active. Approval and swap remain disabled.');
    } catch (err) {
      setText(els.walletAddress, 'Not connected');
      setText(els.walletNetwork, err.message || 'Wallet error');

      if (els.connectBtn) {
        els.connectBtn.textContent = 'connect wallet';
      }
    }
  }

  async function checkInputAllowance() {
    try {
      normalizePair();

      if (!selectedAccount) {
        await connectWallet();
      }

      if (!selectedAccount) {
        throw new Error('Connect wallet before checking approval.');
      }

      await ensureBsc();

      const from = els.fromToken?.value || 'BSC-USD';
      const token = tokenAddress(from);
      const amountRaw = parseUnits(els.amountIn?.value || '', 18);

      setText(els.allowanceText, 'Checking...');
      setStatus(`Checking ${from} approval for Pancake V2 Router. No transaction will be sent.`);

      const raw = await walletRequest('eth_call', [{
        to: token,
        data: encodeAllowanceData(selectedAccount, PANCAKE_V2_ROUTER)
      }, 'latest']);

      const allowanceRaw = decodeUint256(raw);
      const allowanceText = formatUnits(allowanceRaw, 18, tokenDigits(from));
      const enough = allowanceRaw >= amountRaw;

      if (enough) {
        setText(els.allowanceText, `${fmt(allowanceText, tokenDigits(from))} ${from} approved`);

        /* instantApproveDirectBtn direct handler */
  if (els.approveDirectBtn) {
    els.approveDirectBtn.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();

      const from = els.fromToken?.value || 'BSC-USD';
      els.approveDirectBtn.textContent = `opening Rabby for ${from}...`;
      setStatus('Direct approve button clicked. Opening Rabby approval request...');

      approveInputToken().finally(function () {
        const fromNow = els.fromToken?.value || 'BSC-USD';
        els.approveDirectBtn.textContent = `approve ${fromNow}`;
      });

      return false;
    };
  }

  if (els.approveBtn) {
          els.approveBtn.textContent = 'approved';
          els.approveBtn.disabled = true;
        }

        if (els.checkAllowanceBtn) {
          els.checkAllowanceBtn.textContent = 'approval verified';
        }

        enableSwapButton();
        setStatus(`${from} approval verified for this input amount. Tiny swap test is enabled for this input only.`);
      } else {
        setText(els.allowanceText, `${fmt(allowanceText, tokenDigits(from))} ${from} approved — not enough`);

        if (els.approveBtn) {
          els.approveBtn.textContent = `approve ${from}`;
          els.approveBtn.disabled = false;
          els.approveBtn.title = `Approve exact ${from} input amount.`;
        }

        if (els.approveDirectBtn) {
          els.approveDirectBtn.textContent = `approve ${from}`;
          els.approveDirectBtn.disabled = false;
          els.approveDirectBtn.title = `Approve exact ${from} input amount.`;
        }

        if (els.checkAllowanceBtn) {
          els.checkAllowanceBtn.textContent = 'check approval';
        }

        disableSwapButton();
        setStatus(`Approval is below input amount. Approve exact ${from} amount before swap testing.`);
      }

      return enough;
    } catch (err) {
      setText(els.allowanceText, 'Not verified');
      setStatus(err.message || 'Could not check approval.');
      return false;
    }
  }

  function assertTinySwapTestLimit(from, amountRaw) {
    if (from === 'BSC-USD' && amountRaw > SWAP_TEST_MAX_BSC_USD_RAW) {
      throw new Error('Tiny swap test mode is capped at 0.25 BSC-USD.');
    }

    if (from === 'CIGO' && amountRaw > SWAP_TEST_MAX_CIGO_RAW) {
      throw new Error('Tiny swap test mode is capped at 20 CIGO.');
    }
  }

  function disableSwapButton() {
    if (els.swapBtn) {
      els.swapBtn.disabled = true;
      els.swapBtn.textContent = 'swap';
    }
  }

  function enableSwapButton() {
    if (els.swapBtn) {
      els.swapBtn.disabled = false;
      els.swapBtn.textContent = 'swap test';
    }
  }

  async function approveInputToken() {
    try {
      setStatus('Approve button clicked. Preparing exact token approval...');

      normalizePair();

      if (!selectedAccount) {
        await connectWallet();
      }

      if (!selectedAccount) {
        throw new Error('Connect wallet before approving.');
      }

      await ensureBsc();

      const from = els.fromToken?.value || 'BSC-USD';
      const amountText = els.amountIn?.value || '';
      const amountRaw = parseUnits(amountText, 18);
      const token = tokenAddress(from);

      if (from !== 'BSC-USD' && from !== 'CIGO') {
        throw new Error('Unsupported approval token.');
      }

      if (from === 'BSC-USD' && amountRaw > SWAP_TEST_MAX_BSC_USD_RAW) {
        throw new Error('Tiny test mode is capped at 0.25 BSC-USD for now.');
      }

      if (from === 'CIGO' && amountRaw > SWAP_TEST_MAX_CIGO_RAW) {
        throw new Error('Tiny test mode is capped at 20 CIGO for now.');
      }

      if (els.approveBtn) {
        els.approveBtn.disabled = true;
        els.approveBtn.textContent = 'opening Rabby...';
      }

      setStatus(`Opening Rabby to approve exactly ${amountText} ${from} for Pancake V2 Router.`);

      const txHash = await walletRequest('eth_sendTransaction', [{
        from: selectedAccount,
        to: token,
        data: encodeApproveData(PANCAKE_V2_ROUTER, amountRaw)
      }]);

      setStatus(`Approval submitted: ${txHash}. Waiting briefly, then checking allowance.`);
      if (els.approveBtn) {
        els.approveBtn.textContent = 'approval submitted';
      }

      window.setTimeout(function () {
        checkInputAllowance().catch(() => {});
      }, 6000);

    } catch (err) {
      setStatus(err.message || 'Approval failed or was rejected.');
      if (els.approveBtn) {
        const from = els.fromToken?.value || 'BSC-USD';
        els.approveBtn.disabled = false;
        els.approveBtn.textContent = `approve ${from}`;
      }
    }
  }

  async function estimateQuote() {
    try {
      normalizePair();

      const from = els.fromToken?.value || 'BSC-USD';
      const to = els.toToken?.value || 'CIGO';
      const amountRaw = parseUnits(els.amountIn?.value || '', 18);
      const path = [tokenAddress(from), tokenAddress(to)];

      setValue(els.estimatedOut, 'Estimating...');
      setStatus('Reading Pancake V2 router estimate. No transaction will be sent.');

      await ensureBsc();

      const data = encodeGetAmountsOut(amountRaw, path);
      const raw = await walletRequest('eth_call', [{
        to: PANCAKE_V2_ROUTER,
        data
      }, 'latest']);

      const amountOut = decodeGetAmountsOut(raw);
      const outText = formatUnits(amountOut, 18, tokenDigits(to));

      const slippageBps = Number(els.slippageBps?.value || 300);
      const minOut = minOutWithSlippage(amountOut, slippageBps);
      const minOutText = formatUnits(minOut, 18, tokenDigits(to));

      setValue(els.estimatedOut, `≈ ${fmt(outText, tokenDigits(to))} ${to}`);
      setText(els.routeText, `${from} → ${to}`);
      setText(els.priceText, quotePriceText(from, to, els.amountIn?.value || '', outText));
      setText(els.minReceivedText, `≈ ${fmt(minOutText, tokenDigits(to))} ${to} after ${formatDisplayNumber(slippageBps / 100, 1)}% slippage`);

      lastQuote = {
        from,
        to,
        amountInRaw: amountRaw.toString(),
        amountOutRaw: amountOut.toString(),
        minOutRaw: minOut.toString()
      };

      if (els.approveBtn) {
        els.approveBtn.disabled = false;
        els.approveBtn.textContent = `approve ${from}`;
      }

      if (els.checkAllowanceBtn) {
        els.checkAllowanceBtn.disabled = false;
        els.checkAllowanceBtn.textContent = 'check approval';
      }

      setText(els.allowanceText, 'Checking...');
      disableSwapButton();
      setStatus('Estimate complete. Checking approval automatically. Swap remains disabled until approval is verified.');

      if (selectedAccount) {
        window.setTimeout(function () {
          checkInputAllowance().catch(() => {});
        }, 300);
      } else {
        setText(els.allowanceText, 'Connect wallet to check');
      }
    } catch (err) {
      setValue(els.estimatedOut, 'No estimate');
      setStatus(err.message || 'Could not estimate route.');
    }
  }

  async function executeTinySwap() {
    try {
      normalizePair();

      if (!selectedAccount) {
        await connectWallet();
      }

      if (!selectedAccount) {
        throw new Error('Connect wallet before swapping.');
      }

      await ensureBsc();

      const from = els.fromToken?.value || 'BSC-USD';
      const to = els.toToken?.value || 'CIGO';
      const amountRaw = parseUnits(els.amountIn?.value || '', 18);

      assertTinySwapTestLimit(from, amountRaw);

      if (!lastQuote ||
          lastQuote.from !== from ||
          lastQuote.to !== to ||
          lastQuote.amountInRaw !== amountRaw.toString()) {
        throw new Error('Click estimate again before swapping.');
      }

      const approved = await checkInputAllowance();
      if (!approved) {
        throw new Error('Input token is not approved for this amount.');
      }

      const path = [tokenAddress(from), tokenAddress(to)];
      const minOutRaw = BigInt(lastQuote.minOutRaw);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

      if (els.swapBtn) {
        els.swapBtn.disabled = true;
        els.swapBtn.textContent = 'swapping...';
      }

      setStatus(`Opening wallet for tiny swap test: ${from} → ${to}. Verify router, amount, and minimum received in Rabby.`);

      const data = encodeSwapSupportingFeeData(
        amountRaw,
        minOutRaw,
        path,
        selectedAccount,
        deadline
      );

      const txHash = await walletRequest('eth_sendTransaction', [{
        from: selectedAccount,
        to: PANCAKE_V2_ROUTER,
        data
      }]);

      setStatus(`Swap submitted: ${txHash}. Exact approval may be consumed. Estimate again before another swap.`);

      if (els.swapBtn) {
        els.swapBtn.disabled = true;
        els.swapBtn.textContent = 'swap submitted';
      }

      if (els.approveBtn) {
        els.approveBtn.disabled = true;
        els.approveBtn.textContent = 'estimate again';
      }

      if (els.allowanceText) {
        setText(els.allowanceText, 'Recheck after swap');
      }

      lastQuote = null;

      window.setTimeout(function () {
        refreshWalletBalances().catch(() => {});
        loadPool().catch(() => {});
      }, 8000);
    } catch (err) {
      setStatus(err.message || 'Swap failed or was rejected.');
      if (els.swapBtn) {
        els.swapBtn.disabled = false;
        els.swapBtn.textContent = 'swap test';
      }
    }
  }

  async function loadPool() {
    try {
      const res = await fetch('/api/pool/cigo', { cache: 'no-store' });
      const data = await res.json();

      if (!res.ok || !data.ok || !data.pool) {
        throw new Error(data.error || 'pool API unavailable');
      }

      const p = data.pool;

      setText(els.cigoUsdt, `${fmt(p.cigoUsdtPoolBalance)} CIGO`);
      setText(els.cigoWbnb, `${fmt(p.cigoWbnbPoolBalance)} CIGO`);
      setText(els.total, `${fmt(p.poolLiquidityCigo)} CIGO`);
      setText(els.reserve, `${fmt(p.committedReserve)} CIGO`);

      const updated = p.updatedAt ? new Date(p.updatedAt) : null;
      setText(
        els.updatedAt,
        updated && !Number.isNaN(updated.getTime())
          ? updated.toLocaleString()
          : 'live'
      );
    } catch (err) {
      setText(els.cigoUsdt, 'unavailable');
      setText(els.cigoWbnb, 'unavailable');
      setText(els.total, 'unavailable');
      setText(els.reserve, 'unavailable');
      setText(els.updatedAt, err.message || 'error');
    }
  }

  window.cigoApproveInputToken = approveInputToken;

  if (els.connectBtn) {
    els.connectBtn.addEventListener('click', connectWallet);
  }

  if (els.addCigoBtn) {
    els.addCigoBtn.addEventListener('click', addCigoToWallet);
  }

  if (els.quoteBtn) {
    els.quoteBtn.addEventListener('click', estimateQuote);
  }

  if (els.approveBtn) {
    els.approveBtn.onclick = function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      setStatus('Approve button clicked. Direct handler active...');
      approveInputToken();
      return false;
    };
  }

  if (els.checkAllowanceBtn) {
    els.checkAllowanceBtn.addEventListener('click', checkInputAllowance);
  }

  if (els.swapBtn) {
    els.swapBtn.addEventListener('click', executeTinySwap);
  }

  if (els.fromToken) {
    els.fromToken.addEventListener('change', function () {
      els.toToken.value = els.fromToken.value === 'CIGO' ? 'BSC-USD' : 'CIGO';
      setValue(els.estimatedOut, 'No estimate yet');
      if (els.approveBtn) {
        els.approveBtn.disabled = true;
        els.approveBtn.textContent = 'approve';
      }
    });
  }

  if (els.toToken) {
    els.toToken.addEventListener('change', function () {
      els.fromToken.value = els.toToken.value === 'CIGO' ? 'BSC-USD' : 'CIGO';
      setValue(els.estimatedOut, 'No estimate yet');
      setText(els.routeText, 'No quote yet');
      setText(els.priceText, 'No quote yet');
      setText(els.minReceivedText, 'No quote yet');
    });
  }

  if (els.slippageBps) {
    els.slippageBps.addEventListener('change', function () {
      setValue(els.estimatedOut, 'No estimate yet');
      setText(els.routeText, 'No quote yet');
      setText(els.priceText, 'No quote yet');
      setText(els.minReceivedText, 'No quote yet');
    });
  }

  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', function (accounts) {
      selectedAccount = accounts && accounts[0] ? accounts[0] : '';
      setText(els.walletAddress, selectedAccount ? shortAddress(selectedAccount) : 'Not connected');
      refreshWalletBalances().catch(() => {});
    });

    window.ethereum.on?.('chainChanged', function () {
      refreshWalletBalances().catch(() => {});
    });
  }

  normalizePair();
  loadPool();

  window.setInterval(loadPool, 30000);
  window.setInterval(function () {
    refreshWalletBalances().catch(() => {});
  }, 30000);
})();

/* approve-click-cache-fix */
(function () {
  const VERSION = 'approve-click-cache-fix-20260612-2118';

  function visibleStatus(text) {
    const el = document.getElementById('instantStatus');
    if (el) el.textContent = text;
  }

  window.addEventListener('load', function () {
    console.log(VERSION);
  });

  document.addEventListener('click', function (ev) {
    const btn = ev.target && ev.target.closest
      ? ev.target.closest('#instantApproveBtn')
      : null;

    if (!btn) return;

    console.log('fallback approve button click observed', VERSION);

    // If the main handler is working, it will update the status immediately.
    // This fallback is only diagnostic: it proves whether the click reaches JS.
    visibleStatus('Approve button click detected. If Rabby does not open, main approval handler is not attached correctly.');
  }, true);
})();

/* direct approve button binding */
window.addEventListener('load', function () {
  const btn = document.getElementById('instantApproveBtn');
  const status = document.getElementById('instantStatus');

  if (!btn) {
    if (status) status.textContent = 'Debug: approve button not found.';
    return;
  }

  btn.addEventListener('click', function () {
    if (status) {
      status.textContent = 'Debug: approve button click reached browser. If Rabby does not open, check BNB gas balance.';
    }
  }, true);
});
