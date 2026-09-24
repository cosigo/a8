(() => {
  const BSC_CHAIN_ID = '0x38';

  const ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  const CIGO = '0x3a38e963f524E0dDFB75dFa1752b4Cd1364F5560';
  const BSC_USD = '0x55d398326f99059fF775485246999027B3197955';
  const CIGO_USDT_PAIR = '0xDed1e63B6262C0328876b7774f65c08505dd559A';

  const SELECTORS = {
    approve: '0x095ea7b3',
    allowance: '0xdd62ed3e',
    token0: '0x0dfe1681',
    token1: '0xd21220a7',
    getReserves: '0x0902f1ac',
    addLiquidity: '0xe8e33700'
  };

  let lastEdited = 'cigo';

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(text) {
    const el = $('liquidityStatus');
    if (el) el.textContent = text;
  }

  function cleanAmount(value) {
    return String(value || '').trim().replace(/,/g, '');
  }

  function parseUnits(value, decimals = 18) {
    const text = cleanAmount(value);
    if (!text || !/^\d+(\.\d+)?$/.test(text)) return 0n;

    const [whole, frac = ''] = text.split('.');
    const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);

    return BigInt(whole || '0') * (10n ** BigInt(decimals)) + BigInt(fracPadded || '0');
  }

  function formatUnits(raw, decimals = 18, maxDigits = 6) {
    const value = typeof raw === 'bigint' ? raw : BigInt(raw || 0);
    const base = 10n ** BigInt(decimals);
    const whole = value / base;
    const frac = value % base;

    let fracText = frac.toString().padStart(decimals, '0').slice(0, maxDigits);
    fracText = fracText.replace(/0+$/, '');

    const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fracText ? `${wholeText}.${fracText}` : wholeText;
  }

  function pad64(hex) {
    return String(hex).replace(/^0x/, '').padStart(64, '0');
  }

  function encodeAddress(address) {
    return pad64(String(address).toLowerCase().replace(/^0x/, ''));
  }

  function encodeUint(value) {
    return pad64(BigInt(value).toString(16));
  }

  function decodeAddress(wordHex) {
    return '0x' + String(wordHex).replace(/^0x/, '').slice(-40);
  }

  function wordAt(hex, index) {
    const clean = String(hex || '').replace(/^0x/, '');
    return '0x' + clean.slice(index * 64, (index + 1) * 64);
  }

  function hexToBigInt(hex) {
    if (!hex || hex === '0x') return 0n;
    return BigInt(hex);
  }

  async function ensureWallet() {
    if (!window.ethereum || !window.ethereum.request) {
      throw new Error('No wallet browser detected. Open in Rabby or another Web3 wallet.');
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BSC_CHAIN_ID }]
      });
    } catch (err) {
      if (err && err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: BSC_CHAIN_ID,
            chainName: 'BNB Smart Chain',
            nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
            rpcUrls: ['https://bsc-dataseed.bnbchain.org'],
            blockExplorerUrls: ['https://bscscan.com']
          }]
        });
      } else {
        throw err;
      }
    }

    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    const account = accounts && accounts[0];

    if (!account) {
      throw new Error('Connect wallet first.');
    }

    return account;
  }

  async function call(to, data) {
    return await window.ethereum.request({
      method: 'eth_call',
      params: [{ to, data }, 'latest']
    });
  }

  async function getPairState() {
    const token0 = decodeAddress(await call(CIGO_USDT_PAIR, SELECTORS.token0)).toLowerCase();
    const token1 = decodeAddress(await call(CIGO_USDT_PAIR, SELECTORS.token1)).toLowerCase();
    const reservesHex = await call(CIGO_USDT_PAIR, SELECTORS.getReserves);

    const reserve0 = hexToBigInt(wordAt(reservesHex, 0));
    const reserve1 = hexToBigInt(wordAt(reservesHex, 1));

    const cigoLower = CIGO.toLowerCase();
    const usdtLower = BSC_USD.toLowerCase();

    if (token0 === cigoLower && token1 === usdtLower) {
      return { reserveCigo: reserve0, reserveUsdt: reserve1 };
    }

    if (token0 === usdtLower && token1 === cigoLower) {
      return { reserveCigo: reserve1, reserveUsdt: reserve0 };
    }

    throw new Error('Unexpected CIGO / BSC-USD pair token order.');
  }

  function getAmounts() {
    return {
      cigo: parseUnits($('cigoAmount')?.value || '0'),
      usdt: parseUnits($('usdtAmount')?.value || '0')
    };
  }

  function updateApprovalButtonLabels() {
    const amounts = getAmounts();

    const cigoBtn = $('approveCigoLiquidityBtn');
    const usdtBtn = $('approveUsdtLiquidityBtn');

    if (cigoBtn) {
      cigoBtn.textContent = amounts.cigo > 0n
        ? `3 approve exact ${formatUnits(amounts.cigo, 18, 4)} CIGO`
        : '3 approve exact CIGO';
    }

    if (usdtBtn) {
      usdtBtn.textContent = amounts.usdt > 0n
        ? `4 approve exact ${formatUnits(amounts.usdt, 18, 4)} BSC-USD`
        : '4 approve exact BSC-USD';
    }
  }

  function setButtonsAfterEstimate() {
    const approveCigo = $('approveCigoLiquidityBtn');
    const approveUsdt = $('approveUsdtLiquidityBtn');

    if (approveCigo) approveCigo.disabled = false;
    if (approveUsdt) approveUsdt.disabled = false;

    checkAllowances().catch(() => {});
  }

  async function estimateAmounts() {
    await ensureWallet();

    const pair = await getPairState();
    let cigo = parseUnits($('cigoAmount')?.value || '0');
    let usdt = parseUnits($('usdtAmount')?.value || '0');

    if (cigo > 0n && usdt > 0n) {
      // Both fields may be filled after a previous estimate.
      // Use the field edited last and recalculate the other side.
      if (lastEdited === 'usdt') {
        cigo = usdt * pair.reserveCigo / pair.reserveUsdt;
        $('cigoAmount').value = formatUnits(cigo, 18, 6);
      } else {
        usdt = cigo * pair.reserveUsdt / pair.reserveCigo;
        $('usdtAmount').value = formatUnits(usdt, 18, 6);
      }
    } else if (cigo > 0n) {
      lastEdited = 'cigo';
      usdt = cigo * pair.reserveUsdt / pair.reserveCigo;
      $('usdtAmount').value = formatUnits(usdt, 18, 6);
    } else if (usdt > 0n) {
      lastEdited = 'usdt';
      cigo = usdt * pair.reserveCigo / pair.reserveUsdt;
      $('cigoAmount').value = formatUnits(cigo, 18, 6);
    } else {
      throw new Error('Enter a CIGO or BSC-USD amount first.');
    }

    updateApprovalButtonLabels();

    setStatus(
      `Estimated pair amount. CIGO: ${formatUnits(cigo, 18, 4)} / BSC-USD: ${formatUnits(usdt, 18, 4)}. ` +
      `Step 3 and Step 4: approve exact amounts before adding liquidity.`
    );

    setButtonsAfterEstimate();
  }

  async function allowance(token, owner) {
    const data = SELECTORS.allowance + encodeAddress(owner) + encodeAddress(ROUTER);
    return hexToBigInt(await call(token, data));
  }

  async function checkAllowances() {
    const account = await ensureWallet();
    const amounts = getAmounts();

    const addBtn = $('addLiquidityBtn');
    if (addBtn) addBtn.disabled = true;

    if (amounts.cigo <= 0n || amounts.usdt <= 0n) return false;

    const [cigoAllowance, usdtAllowance] = await Promise.all([
      allowance(CIGO, account),
      allowance(BSC_USD, account)
    ]);

    const cigoOk = cigoAllowance >= amounts.cigo;
    const usdtOk = usdtAllowance >= amounts.usdt;

    updateApprovalButtonLabels();

    if ($('approveCigoLiquidityBtn')) {
      $('approveCigoLiquidityBtn').disabled = cigoOk;
      if (cigoOk) $('approveCigoLiquidityBtn').textContent = '3 CIGO approved';
    }

    if ($('approveUsdtLiquidityBtn')) {
      $('approveUsdtLiquidityBtn').disabled = usdtOk;
      if (usdtOk) $('approveUsdtLiquidityBtn').textContent = '4 BSC-USD approved';
    }

    if (addBtn) addBtn.disabled = !(cigoOk && usdtOk);

    if (cigoOk && usdtOk) {
      setStatus('Exact approvals detected. Review amounts carefully, then add liquidity.');
    } else {
      setStatus(
        `Approval needed: ${cigoOk ? 'CIGO ok' : 'approve CIGO'} / ` +
        `${usdtOk ? 'BSC-USD ok' : 'approve BSC-USD'}.`
      );
    }

    return cigoOk && usdtOk;
  }

  async function sendApprove(token, amount, label) {
    const account = await ensureWallet();

    if (amount <= 0n) throw new Error(`Invalid ${label} amount.`);

    const humanAmount = formatUnits(amount, 18, 6);
    const ok = window.confirm(
      `Approve exact ${humanAmount} ${label} for PancakeSwap V2 router?\n\n` +
      `Router: ${ROUTER}\n\n` +
      `Cancel if this is not the token and amount you intended.`
    );

    if (!ok) {
      setStatus(`${label} approval cancelled before wallet request.`);
      return;
    }

    const data = SELECTORS.approve + encodeAddress(ROUTER) + encodeUint(amount);

    setStatus(`Requesting exact ${humanAmount} ${label} approval in wallet...`);

    const tx = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to: token,
        data
      }]
    });

    setStatus(`${label} approval submitted: ${tx}. Wait a few seconds, then click estimate amounts again.`);
    setTimeout(() => checkAllowances().catch(() => {}), 7000);
  }

  function minAmount(amount, slippageBps) {
    return amount * BigInt(10000 - Number(slippageBps || 100)) / 10000n;
  }

  async function addLiquidity() {
    const account = await ensureWallet();
    const approvalsReady = await checkAllowances();

    if (!approvalsReady) {
      throw new Error('Exact approvals are not ready yet.');
    }

    const amounts = getAmounts();
    if (amounts.cigo <= 0n || amounts.usdt <= 0n) {
      throw new Error('Invalid liquidity amounts.');
    }

    const slippageBps = Number($('lpSlippageBps')?.value || 100);
    const cigoMin = minAmount(amounts.cigo, slippageBps);
    const usdtMin = minAmount(amounts.usdt, slippageBps);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 20 * 60);

    const data =
      SELECTORS.addLiquidity +
      encodeAddress(CIGO) +
      encodeAddress(BSC_USD) +
      encodeUint(amounts.cigo) +
      encodeUint(amounts.usdt) +
      encodeUint(cigoMin) +
      encodeUint(usdtMin) +
      encodeAddress(account) +
      encodeUint(deadline);

    const humanCigo = formatUnits(amounts.cigo, 18, 6);
    const humanUsdt = formatUnits(amounts.usdt, 18, 6);
    const humanCigoMin = formatUnits(cigoMin, 18, 6);
    const humanUsdtMin = formatUnits(usdtMin, 18, 6);

    const confirmAddLiquidity = window.confirm(
      `Step 5: Add liquidity?\n\n` +
      `CIGO amount sent: ${humanCigo}\n` +
      `BSC-USD amount sent: ${humanUsdt}\n\n` +
      `Minimum CIGO before token-tax effects: ${humanCigoMin}\n` +
      `Minimum BSC-USD: ${humanUsdtMin}\n\n` +
      `Important: CIGO transfer tax may reduce the CIGO that actually reaches the pool. ` +
      `You will receive LP tokens and accept pool exposure, slippage, price movement, and possible impermanent loss.\n\n` +
      `Cancel if you are not intentionally adding liquidity.`
    );

    if (!confirmAddLiquidity) {
      setStatus('Step 5 cancelled before wallet request.');
      return;
    }

    setStatus('Step 5: requesting add-liquidity transaction in wallet. Review both token amounts, LP output, gas, and warnings before signing.');

    const tx = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to: ROUTER,
        data
      }]
    });

    setStatus(`Add-liquidity transaction submitted: ${tx}`);
  }

  function resetLiquidityForm() {
    const cigoInput = $('cigoAmount');
    const usdtInput = $('usdtAmount');

    if (cigoInput) {
      cigoInput.value = '';
      cigoInput.disabled = false;
      cigoInput.readOnly = false;
    }

    if (usdtInput) {
      usdtInput.value = '';
      usdtInput.disabled = false;
      usdtInput.readOnly = false;
    }

    lastEdited = 'cigo';

    const estimateBtn = $('estimateLiquidityBtn');
    const approveCigoBtn = $('approveCigoLiquidityBtn');
    const approveUsdtBtn = $('approveUsdtLiquidityBtn');
    const addBtn = $('addLiquidityBtn');

    if (estimateBtn) estimateBtn.disabled = false;
    if (approveCigoBtn) {
      approveCigoBtn.disabled = true;
      approveCigoBtn.textContent = '3 approve exact CIGO';
    }
    if (approveUsdtBtn) {
      approveUsdtBtn.disabled = true;
      approveUsdtBtn.textContent = '4 approve exact BSC-USD';
    }
    if (addBtn) addBtn.disabled = true;

    setStatus('Form reset. Enter one side only, then click Step 2 estimate amounts.');
  }


  function bind() {
    const cigoInput = $('cigoAmount');
    const usdtInput = $('usdtAmount');

    function resetApprovalButtons() {
      if ($('approveCigoLiquidityBtn')) $('approveCigoLiquidityBtn').disabled = true;
      if ($('approveUsdtLiquidityBtn')) $('approveUsdtLiquidityBtn').disabled = true;
      if ($('addLiquidityBtn')) $('addLiquidityBtn').disabled = true;
    }

    if (cigoInput) {
      cigoInput.addEventListener('input', () => {
        lastEdited = 'cigo';

        if (cleanAmount(cigoInput.value)) {
          if (usdtInput) usdtInput.value = '';
          setStatus('CIGO entered. Click estimate amounts to calculate the required BSC-USD side.');
        }

        updateApprovalButtonLabels();
        resetApprovalButtons();
      });
    }

    if (usdtInput) {
      usdtInput.addEventListener('input', () => {
        lastEdited = 'usdt';

        if (cleanAmount(usdtInput.value)) {
          if (cigoInput) cigoInput.value = '';
          setStatus('BSC-USD entered. Click estimate amounts to calculate the required CIGO side.');
        }

        updateApprovalButtonLabels();
        resetApprovalButtons();
      });
    }

    $('estimateLiquidityBtn')?.addEventListener('click', () => {
      estimateAmounts().catch((err) => setStatus(err.message || 'Estimate failed.'));
    });

    $('approveCigoLiquidityBtn')?.addEventListener('click', () => {
      const amount = getAmounts().cigo;
      sendApprove(CIGO, amount, 'CIGO').catch((err) => setStatus(err.message || 'CIGO approval failed.'));
    });

    $('approveUsdtLiquidityBtn')?.addEventListener('click', () => {
      const amount = getAmounts().usdt;
      sendApprove(BSC_USD, amount, 'BSC-USD').catch((err) => setStatus(err.message || 'BSC-USD approval failed.'));
    });

    $('addLiquidityBtn')?.addEventListener('click', () => {
      addLiquidity().catch((err) => setStatus(err.message || 'Add liquidity failed.'));
    });

    $('resetLiquidityBtn')?.addEventListener('click', () => {
      resetLiquidityForm();
    });

    resetLiquidityForm();
  }

  document.addEventListener('DOMContentLoaded', bind);
})();


