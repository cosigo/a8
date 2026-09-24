(() => {
  const CAP_USD = 500;
  const GAS_MIN_BNB = 0.00003;

  const E = (id) => document.getElementById(id);

  function status(msg) {
    const el = E('cleanStatus');
    if (el) el.textContent = msg;
  }

  function parseNumber(text) {
    const m = String(text || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  }

  function walletBalanceFor(symbol) {
    if (symbol === 'BSC-USD') return parseNumber(E('cleanUSDT')?.textContent);
    if (symbol === 'CIGO') return parseNumber(E('cleanCIGO')?.textContent);
    return NaN;
  }

  function bnbBalance() {
    return parseNumber(E('cleanBNB')?.textContent);
  }

  function checkCapAndBalance(action) {
    const from = E('cleanFrom')?.value;
    const to = E('cleanTo')?.value;
    const amount = parseNumber(E('cleanAmount')?.value);

    if (!Number.isFinite(amount) || amount <= 0) {
      status('Enter a valid amount first.');
      return false;
    }

    const bal = walletBalanceFor(from);

    if (!Number.isFinite(bal)) {
      status('Connect wallet and load balances before approving or swapping.');
      return false;
    }

    if (amount > bal) {
      status(`Entered amount exceeds wallet balance. You have ${bal.toLocaleString()} ${from === 'BSC-USD' ? 'BSC-USD (USDT)' : from}.`);
      return false;
    }

    const gas = bnbBalance();
    if ((action === 'approve' || action === 'swap') && Number.isFinite(gas) && gas < GAS_MIN_BNB) {
      status('BNB gas balance is very low. Add a little BNB before approving or swapping.');
      return false;
    }

    if (from === 'BSC-USD' && amount > CAP_USD) {
      status(`Public interface cap: maximum ${CAP_USD} BSC-USD (USDT) per swap.`);
      return false;
    }

    if (from === 'CIGO' && to === 'BSC-USD' && action !== 'estimate') {
      const estimatedOut = parseNumber(E('cleanEstimated')?.value);
      if (!Number.isFinite(estimatedOut)) {
        status(`Estimate first so the ${CAP_USD} BSC-USD (USDT) cap can be checked.`);
        return false;
      }

      if (estimatedOut > CAP_USD) {
        status(`Public interface cap: estimated output is above ${CAP_USD} BSC-USD (USDT). Reduce amount.`);
        return false;
      }
    }

    return true;
  }

  document.addEventListener('click', (ev) => {
    const id = ev.target && ev.target.id;
    if (!['cleanEstimateBtn', 'cleanApproveBtn', 'cleanSwapBtn'].includes(id)) return;

    const action =
      id === 'cleanEstimateBtn' ? 'estimate' :
      id === 'cleanApproveBtn' ? 'approve' :
      'swap';

    if (!checkCapAndBalance(action)) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  }, true);
})();

/* cancel / edit amount helper */
(() => {
  const E = (id) => document.getElementById(id);

  function setText(id, value) {
    const el = E(id);
    if (el) el.textContent = value;
  }

  function setValue(id, value) {
    const el = E(id);
    if (el) el.value = value;
  }

  function resetSwapUi() {
    setValue('cleanAmount', '0.50');
    setValue('cleanEstimated', 'No estimate yet');

    setText('cleanRoute', 'No quote yet');
    setText('cleanPrice', 'No quote yet');
    setText('cleanMin', 'No quote yet');
    setText('cleanAllowance', 'Not checked');
    setText('cleanStatus', 'Amount reset. Enter a new amount, then click estimate.');

    const approve = E('cleanApproveBtn');
    const swap = E('cleanSwapBtn');
    const estimate = E('cleanEstimateBtn');

    if (approve) {
      approve.disabled = false;
      approve.textContent = 'approve exact input';
    }

    if (swap) {
      swap.disabled = true;
      swap.textContent = 'swap';
    }

    if (estimate) {
      estimate.disabled = false;
      estimate.textContent = 'estimate';
    }

    const amount = E('cleanAmount');
    if (amount) {
      amount.focus();
      amount.select();
    }
  }

  document.addEventListener('click', (ev) => {
    if (!ev.target || ev.target.id !== 'cleanResetBtn') return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    resetSwapUi();
  }, true);
})();
