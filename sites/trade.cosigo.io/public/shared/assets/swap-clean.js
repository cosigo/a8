(function () {
  const BSC_CHAIN_ID = '0x38';
  const CIGO = '0x3a38e963f524E0dDFB75dFa1752b4Cd1364F5560';
  const BSC_USD = '0x55d398326f99059fF775485246999027B3197955';
  const ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

  const MAX_BSC_USD = 250000000000000000n; // 0.25 BSC-USD
  const MAX_CIGO = 20000000000000000000n;  // Amount entered. Estimate first, approve only if needed, then swap.

  let account = '';
  let lastQuote = null;
  let approvalInFlight = false;
  let swapInFlight = false;

  const E = id => document.getElementById(id);

  function shortenTxText(text) {
    return String(text || '').replace(/0x[a-fA-F0-9]{64}/g, (tx) => {
      return tx.slice(0, 10) + '…' + tx.slice(-8);
    });
  }

  function status(text) {
    const el = E('cleanStatus');
    if (!el) return;
    el.textContent = shortenTxText(text);
    el.title = String(text || '');
  }

  async function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (_) {
        // Fall through to the compatibility copy path.
      }
    }

    const helper = document.createElement('textarea');
    helper.value = value;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand('copy');
    helper.remove();
    if (!copied) throw new Error('Clipboard copy was blocked.');
  }

  function statusSwapSubmitted(tx) {
    const el = E('cleanStatus');
    if (!el) return;

    const abbreviated = shortenTxText(tx);
    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'cigo-tx-copy';
    copyButton.textContent = `copy ${abbreviated}`;
    copyButton.title = `Copy full transaction hash: ${tx}`;
    copyButton.setAttribute('aria-label', 'Copy the full submitted swap transaction hash');

    copyButton.addEventListener('click', async () => {
      try {
        await copyText(tx);
        copyButton.textContent = 'copied ✓';
        copyButton.title = 'Full transaction hash copied';
        setTimeout(() => {
          copyButton.textContent = `copy ${abbreviated}`;
          copyButton.title = `Copy full transaction hash: ${tx}`;
        }, 2200);
      } catch (_) {
        copyButton.textContent = 'copy failed';
        copyButton.title = tx;
      }
    });

    el.replaceChildren(
      document.createTextNode('Swap submitted: '),
      copyButton,
      document.createTextNode(' Wait for transaction completed. Then click estimate before another swap.')
    );
    el.title = `Swap submitted: ${tx}. Wait for transaction completed. Then click estimate before another swap.`;
  }

  function quoteText(id) {
    const el = E(id);
    if (!el) return '';
    return (el.value || el.textContent || '').trim();
  }

  function selectedSlippageText() {
    const el = E('cleanSlippage') || document.querySelector('select[id*="slippage" i]');
    const raw = (el && (el.options ? el.options[el.selectedIndex]?.text : el.value)) || '1.0%';
    const m = String(raw).match(/[0-9]+(?:\.[0-9]+)?\s*%/);
    return m ? m[0].replace(/\s+/g, '') : '1.0%';
  }

  function refreshQuoteResult() {
    const box = E('cleanQuoteResult');
    if (!box) return;

    const expected = quoteText('cleanEstimated');
    const minimum = quoteText('cleanMin');

    if (!expected || /no quote/i.test(expected) || /no quote/i.test(minimum)) {
      box.hidden = true;
      return;
    }

    E('cleanQuoteExpected').textContent = expected;
    E('cleanQuoteMinimum').textContent = minimum;
    E('cleanQuoteSlip').textContent = selectedSlippageText();
    box.hidden = false;
  }

  function clearQuoteResult() {
    const box = E('cleanQuoteResult');
    if (!box) return;
    E('cleanQuoteExpected').textContent = 'No quote yet';
    E('cleanQuoteMinimum').textContent = 'No quote yet';
    box.hidden = true;
  }


  function short(addr) { return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : 'Not connected'; }

  function encAddress(addr) {
    return String(addr).toLowerCase().replace(/^0x/, '').padStart(64, '0');
  }

  function encUint(v) {
    return BigInt(v).toString(16).padStart(64, '0');
  }

  function parseUnits(value, decimals = 18) {
    const clean = String(value || '').trim().replace(/,/g, '');
    if (!/^\d+(\.\d+)?$/.test(clean)) throw new Error('Enter a valid positive amount.');

    const [whole, frac = ''] = clean.split('.');
    const raw = BigInt((whole + frac.slice(0, decimals).padEnd(decimals, '0')).replace(/^0+(?=\d)/, '') || '0');
    if (raw <= 0n) throw new Error('Amount must be greater than zero.');
    return raw;
  }

  function formatUnits(raw, decimals = 18, digits = 4) {
    const v = typeof raw === 'bigint' ? raw : BigInt(raw || 0);
    const base = 10n ** BigInt(decimals);
    const whole = v / base;
    const frac = v % base;
    let txt = frac.toString().padStart(decimals, '0').slice(0, digits).replace(/0+$/, '');
    return txt ? `${whole}.${txt}` : whole.toString();
  }

  function fmt(value, digits = 4) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'unavailable';
    return n.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  function approveData(spender, amount) {
    return '0x095ea7b3' + encAddress(spender) + encUint(amount);
  }

  function balanceData(wallet) {
    return '0x70a08231' + encAddress(wallet);
  }

  function allowanceData(owner, spender) {
    return '0xdd62ed3e' + encAddress(owner) + encAddress(spender);
  }

  function getAmountsOutData(amountIn, path) {
    const selector = 'd06ca61f';
    const offset = encUint(64n);
    const length = encUint(BigInt(path.length));
    return '0x' + selector + encUint(amountIn) + offset + length + path.map(encAddress).join('');
  }

  function decodeAmountsOut(raw) {
    const h = String(raw || '').replace(/^0x/, '');
    if (h.length < 256) throw new Error('Router quote returned no usable amount.');
    return BigInt('0x' + h.slice(192, 256));
  }

  function decodeUint(raw) {
    const h = String(raw || '0x0').replace(/^0x/, '') || '0';
    return BigInt('0x' + h);
  }

  function swapData(amountIn, amountOutMin, path, recipient, deadline) {
    const selector = '5c11d795';
    const pathOffset = 160n;
    return '0x' + selector +
      encUint(amountIn) +
      encUint(amountOutMin) +
      encUint(pathOffset) +
      encAddress(recipient) +
      encUint(deadline) +
      encUint(BigInt(path.length)) +
      path.map(encAddress).join('');
  }

  async function req(method, params = []) {
    if (!window.ethereum) throw new Error('No wallet detected. Rabby Wallet is recommended.');
    return window.ethereum.request({ method, params });
  }

  async function ensureBsc() {
    const chainId = await req('eth_chainId');
    if (String(chainId).toLowerCase() === BSC_CHAIN_ID) return;
    await req('wallet_switchEthereumChain', [{ chainId: BSC_CHAIN_ID }]);
  }

  function tokenAddress(symbol) {
    if (symbol === 'BSC-USD') return BSC_USD;
    if (symbol === 'CIGO') return CIGO;
    throw new Error('Unsupported token.');
  }

  function tokenCap(symbol) {
    if (symbol === 'BSC-USD') return MAX_BSC_USD;
    if (symbol === 'CIGO') return MAX_CIGO;
    throw new Error('Unsupported token.');
  }

  function tokenDigits(symbol) {
    return symbol === 'CIGO' ? 2 : 4;
  }

  function normalizePair() {
    if (E('cleanFrom').value === E('cleanTo').value) {
      E('cleanTo').value = E('cleanFrom').value === 'BSC-USD' ? 'CIGO' : 'BSC-USD';
    }
  }

  async function tokenBalance(token) {
    const raw = await req('eth_call', [{ to: token, data: balanceData(account) }, 'latest']);
    return formatUnits(decodeUint(raw), 18, 4);
  }

  async function refreshBalances() {
    if (!account) return;

    const [bnbRaw, usdt, cigo] = await Promise.all([
      req('eth_getBalance', [account, 'latest']),
      tokenBalance(BSC_USD),
      tokenBalance(CIGO)
    ]);

    E('cleanBNB').textContent = formatUnits(decodeUint(bnbRaw), 18, 6);
    E('cleanUSDT').textContent = fmt(usdt, 4);
    E('cleanCIGO').textContent = fmt(cigo, 4);
  }

  async function connect() {
    status('Connecting wallet...');
    const accounts = await req('eth_requestAccounts');
    account = accounts && accounts[0] ? accounts[0] : '';
    if (!account) throw new Error('No wallet account returned.');

    await ensureBsc();

    E('cleanAddress').textContent = short(account);
    E('cleanAddress').title = account;
    E('cleanNetwork').textContent = 'BNB Smart Chain';
    E('cleanConnectBtn').textContent = 'wallet connected';

    await refreshBalances();
    status('Wallet connected.');
  }

  async function checkAllowance(amountRaw, from) {
    if (!account) return false;

    const raw = await req('eth_call', [{
      to: tokenAddress(from),
      data: allowanceData(account, ROUTER)
    }, 'latest']);

    const allowance = decodeUint(raw);
    const allowanceText = formatUnits(allowance, 18, tokenDigits(from));
    const enough = allowance >= amountRaw;

    E('cleanAllowance').textContent = enough
      ? `${fmt(allowanceText, tokenDigits(from))} ${from} approved`
      : `${fmt(allowanceText, tokenDigits(from))} ${from} approved — not enough`;

    E('cleanApproveBtn').disabled = enough;
    E('cleanApproveBtn').textContent = enough ? 'approved' : `approve ${from}`;

    if (enough) {
      E('cleanSwapBtn').disabled = false;
      E('cleanSwapBtn').textContent = 'swap';
    } else {
      E('cleanSwapBtn').disabled = true;
      E('cleanSwapBtn').textContent = 'approve first';
    }

    return enough;
  }

  async function estimate() {
    normalizePair();

    E('cleanSwapBtn').disabled = true;
    E('cleanSwapBtn').textContent = 'checking...';

    if (!account) await connect();

    const from = E('cleanFrom').value;
    const to = E('cleanTo').value;
    const amountRaw = parseUnits(E('cleanAmount').value, 18);
    const path = [tokenAddress(from), tokenAddress(to)];

    status('Reading router estimate...');
    await ensureBsc();

    const raw = await req('eth_call', [{
      to: ROUTER,
      data: getAmountsOutData(amountRaw, path)
    }, 'latest']);

    const outRaw = decodeAmountsOut(raw);
    const slippageBps = BigInt(Number(E('cleanSlippage').value || 100));
    const minRaw = outRaw * (10000n - slippageBps) / 10000n;

    const outText = formatUnits(outRaw, 18, tokenDigits(to));
    const minText = formatUnits(minRaw, 18, tokenDigits(to));

    E('cleanEstimated').value = `≈ ${fmt(outText, tokenDigits(to))} ${to}`;
    E('cleanRoute').textContent = `${from} → ${to}`;
    E('cleanMin').textContent = `≈ ${fmt(minText, tokenDigits(to))} ${to}`;

    const inNum = Number(E('cleanAmount').value);
    const outNum = Number(outText);
    E('cleanPrice').textContent = from === 'BSC-USD'
      ? `1 CIGO ≈ ${fmt(inNum / outNum, 6)} BSC-USD`
      : `1 CIGO ≈ ${fmt(outNum / inNum, 6)} BSC-USD`;

    lastQuote = { from, to, amountRaw: amountRaw.toString(), minRaw: minRaw.toString() };

    const enough = await checkAllowance(amountRaw, from);
    status(enough ? 'Estimate complete. Approval verified. Swap is ready.' : 'Estimate complete. Approval needed.');
  }

  async function approve() {
    try {
      if (approvalInFlight) {
        status('Approval already in progress. Wait for Rabby confirmation, then click estimate again.');
        return;
      }

      approvalInFlight = true;

      normalizePair();

      if (!account) await connect();

      const from = E('cleanFrom').value;
      const amountText = E('cleanAmount').value;
      const amountRaw = parseUnits(amountText, 18);

E('cleanApproveBtn').disabled = true;
      E('cleanApproveBtn').textContent = 'opening Rabby...';

      status(`Opening Rabby to approve exactly ${amountText} ${from} for Pancake V2 Router.`);
      await ensureBsc();

      const tx = await req('eth_sendTransaction', [{
        from: account,
        to: tokenAddress(from),
        data: approveData(ROUTER, amountRaw)
      }]);

      status(`Approval submitted: ${tx}. Wait for transaction completed, then click estimate again. Do not approve again.`);
      E('cleanApproveBtn').textContent = 'approval submitted';
      E('cleanApproveBtn').disabled = true;

      setTimeout(() => {
        approvalInFlight = false;
        checkAllowance(amountRaw, from).catch(() => {});
      }, 8000);
    } catch (err) {
      approvalInFlight = false;
      status(err.message || 'Approval failed or rejected.');
      const from = E('cleanFrom').value;
      E('cleanApproveBtn').disabled = false;
      E('cleanApproveBtn').textContent = `approve ${from}`;
    }
  }

  async function swap() {
    try {
      if (swapInFlight) {
        status('Swap already in progress. Wait for Rabby confirmation.');
        return;
      }

      swapInFlight = true;

      normalizePair();

      if (!account) await connect();

      const from = E('cleanFrom').value;
      const to = E('cleanTo').value;
      const amountRaw = parseUnits(E('cleanAmount').value, 18);

if (!lastQuote || lastQuote.from !== from || lastQuote.to !== to || lastQuote.amountRaw !== amountRaw.toString()) {
        throw new Error('Click estimate again before swapping.');
      }

      const enough = await checkAllowance(amountRaw, from);
      if (!enough) throw new Error('Approval is not enough for this input.');

      const path = [tokenAddress(from), tokenAddress(to)];
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

      E('cleanSwapBtn').disabled = true;
      E('cleanSwapBtn').textContent = 'opening Rabby...';

      status(`Opening Rabby for swap: ${from} → ${to}.`);
      await ensureBsc();

      const txRequest = {
        from: account,
        to: ROUTER,
        data: swapData(amountRaw, BigInt(lastQuote.minRaw), path, account, deadline)
      };

      status('Preflight checking exact swap before sending transaction...');

      try {
        await req('eth_call', [txRequest, 'latest']);
      } catch (err) {
        throw new Error('Preflight failed. Swap was NOT sent. Likely approval/transferFrom problem: ' + (err.message || 'unknown error'));
      }

      status(`Preflight passed. Opening Rabby for swap: ${from} → ${to}.`);

      const tx = await req('eth_sendTransaction', [txRequest]);

      statusSwapSubmitted(tx);
      E('cleanSwapBtn').disabled = true;
      E('cleanSwapBtn').textContent = 'swap submitted';
      E('cleanAllowance').textContent = 'Recheck after swap';
      E('cleanApproveBtn').disabled = true;
      E('cleanApproveBtn').textContent = 'estimate again';
      lastQuote = null;
      swapInFlight = false;

      setTimeout(() => {
        refreshBalances().catch(() => {});
      }, 8000);
    } catch (err) {
      swapInFlight = false;
      status(err.message || 'Swap failed or rejected.');
      E('cleanSwapBtn').disabled = false;
      E('cleanSwapBtn').textContent = 'swap';
    }
  }

  E('cleanConnectBtn').onclick = () => connect().catch(err => status(err.message || 'Connect failed.'));
  // quote-result-auto-refresh-patch
  const quoteObserver = new MutationObserver(refreshQuoteResult);
  ['cleanEstimated', 'cleanMin'].forEach((id) => {
    const el = E(id);
    if (el) quoteObserver.observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  });

  ['cleanAmount', 'cleanFrom', 'cleanTo', 'cleanSlippage'].forEach((id) => {
    const el = E(id);
    if (el) el.addEventListener('change', clearQuoteResult);
    if (el && id === 'cleanAmount') el.addEventListener('input', clearQuoteResult);
  });

  E('cleanEstimateBtn').onclick = async function () {
    await estimate();
    refreshQuoteResult();
  };
  E('cleanApproveBtn').onclick = approve;
  E('cleanSwapBtn').onclick = swap;

  E('cleanFrom').onchange = function () {
    E('cleanTo').value = E('cleanFrom').value === 'BSC-USD' ? 'CIGO' : 'BSC-USD';
    E('cleanAllowance').textContent = 'Not checked';
    E('cleanSwapBtn').disabled = true;
  };

  E('cleanTo').onchange = function () {
    E('cleanFrom').value = E('cleanTo').value === 'CIGO' ? 'BSC-USD' : 'CIGO';
    E('cleanAllowance').textContent = 'Not checked';
    E('cleanSwapBtn').disabled = true;
  };

  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', function () { location.reload(); });
    window.ethereum.on?.('chainChanged', function () { location.reload(); });
  }
})();
