(() => {
  const BSC_CHAIN_ID = '0x38';

  const CIGO = '0x3a38e963f524E0dDFB75dFa1752b4Cd1364F5560';
  const BSC_USD = '0x55d398326f99059fF775485246999027B3197955';

  const BALANCE_OF_SELECTOR = '0x70a08231';

  function shortAddress(address) {
    const value = String(address || '').trim();
    if (!value) return '';
    return `${value.slice(0, 6)}...${value.slice(-4)}`;
  }

  function padAddress(address) {
    return String(address || '').toLowerCase().replace(/^0x/, '').padStart(64, '0');
  }

  function hexToBigInt(hex) {
    if (!hex || hex === '0x') return 0n;
    return BigInt(hex);
  }

  function formatUnits(value, decimals = 18, maxDigits = 4) {
    const raw = typeof value === 'bigint' ? value : BigInt(value || 0);
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const frac = raw % base;

    let fracText = frac.toString().padStart(decimals, '0').slice(0, maxDigits);
    fracText = fracText.replace(/0+$/, '');

    const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return fracText ? `${wholeText}.${fracText}` : wholeText;
  }

  function formatUnitsFixed(value, decimals = 18, fixedDigits = 2) {
    const raw = typeof value === 'bigint' ? value : BigInt(value || 0);
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const frac = raw % base;

    const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const fracText = frac.toString().padStart(decimals, '0').slice(0, fixedDigits).padEnd(fixedDigits, '0');

    return `${wholeText}.${fracText}`;
  }

  function setStatus(text) {
    const ids = [
      'walletStatus',
      'walletAddress',
      'connectedWallet',
      'accountStatus',
      'poolWalletStatus',
      'connectStatus'
    ];

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    }
  }

  function findConnectButtons() {
    const direct = Array.from(document.querySelectorAll(
      '[data-wallet-connect], #connectWalletBtn, #connectBtn, #walletConnectBtn'
    ));

    const textMatched = Array.from(document.querySelectorAll('button, a')).filter((el) => {
      return /connect\s+wallet/i.test((el.textContent || '').trim());
    });

    return Array.from(new Set([...direct, ...textMatched]));
  }

  function ensureBalanceCard() {
    let card = document.getElementById('walletBalanceCard');
    if (card) return card;

    card = document.createElement('section');
    card.id = 'walletBalanceCard';
    card.className = 'card wallet-balance-card';
    card.innerHTML = `
      <div class="hd">
        <div class="title">connected wallet balances</div>
        <div class="hint">read-only wallet balance display</div>
      </div>

      <div class="status-grid" style="margin-top:14px;">
        <div class="stat">
          <div class="stat-label">wallet</div>
          <div class="stat-value" id="walletBalanceAddress">not connected</div>
        </div>

        <div class="stat">
          <div class="stat-label">BNB gas balance</div>
          <div class="stat-value" id="walletBnbBalance">-</div>
        </div>

        <div class="stat">
          <div class="stat-label">CIGO balance</div>
          <div class="stat-value" id="walletCigoBalance">-</div>
        </div>

        <div class="stat">
          <div class="stat-label">BSC-USD (USDT) balance</div>
          <div class="stat-value" id="walletUsdtBalance">-</div>
        </div>
      </div>

      <p class="hint" id="walletBalanceNote" style="margin-top:12px;">
        Balances are read from BNB Smart Chain through the connected wallet. No approval or swap is requested here.
      </p>
    `;

    // Place wallet balances in the explicit pool-page mount point when present.
    const mount = document.getElementById('walletBalanceMount');

    card.classList.add('in-pool-tools');

    if (mount) {
      mount.innerHTML = '';
      mount.appendChild(card);
    } else {
      const firstMain = document.querySelector('main .card, main .panel, main section, main article');
      if (firstMain && firstMain.parentNode) {
        firstMain.parentNode.insertBefore(card, firstMain.nextSibling);
      } else {
        document.body.appendChild(card);
      }
    }

    return card;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  async function ethCallBalanceOf(token, account) {
    const data = BALANCE_OF_SELECTOR + padAddress(account);
    const result = await window.ethereum.request({
      method: 'eth_call',
      params: [{ to: token, data }, 'latest']
    });

    return hexToBigInt(result);
  }

  async function renderWalletBalances(account) {
    ensureBalanceCard();

    setText('walletBalanceAddress', shortAddress(account));
    setText('walletBnbBalance', 'loading...');
    setText('walletCigoBalance', 'loading...');
    setText('walletUsdtBalance', 'loading...');
    setText('walletBalanceNote', 'Reading balances from BNB Smart Chain...');

    try {
      const [bnbRaw, cigoRaw, usdtRaw] = await Promise.all([
        window.ethereum.request({
          method: 'eth_getBalance',
          params: [account, 'latest']
        }),
        ethCallBalanceOf(CIGO, account),
        ethCallBalanceOf(BSC_USD, account)
      ]);

      setText('walletBnbBalance', `${formatUnits(hexToBigInt(bnbRaw), 18, 5)} BNB`);
      setText('walletCigoBalance', `${formatUnits(cigoRaw, 18, 4)} CIGO`);
      setText('walletUsdtBalance', `${formatUnitsFixed(usdtRaw, 18, 2)} BSC-USD`);

      setText(
        'walletBalanceNote',
        'Read-only display. This pool page does not request token approval or execute swaps.'
      );
    } catch (err) {
      console.warn('Balance read failed:', err);
      setText('walletBalanceNote', err && err.message ? err.message : 'Balance read failed.');
    }
  }

  async function ensureBsc() {
    if (!window.ethereum || !window.ethereum.request) return;

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
  }

  async function connectWallet(ev) {
    if (ev) ev.preventDefault();

    if (!window.ethereum || !window.ethereum.request) {
      ensureBalanceCard();
      setStatus('No wallet browser detected. Open this page inside Rabby or another Web3 wallet browser.');
      setText('walletBalanceNote', 'No wallet browser detected.');
      return;
    }

    const buttons = findConnectButtons();
    buttons.forEach((btn) => {
      btn.disabled = true;
      btn.dataset.oldText = btn.textContent;
      btn.textContent = btn.id === 'connectPoolWalletBtn' ? '1 connecting...' : 'connecting...';
    });

    try {
      await ensureBsc();

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      const account = accounts && accounts[0];
      if (!account) throw new Error('No wallet account returned.');

      setStatus(`connected: ${shortAddress(account)}`);

      buttons.forEach((btn) => {
        btn.textContent = btn.id === 'connectPoolWalletBtn' ? `1 connected ${shortAddress(account)}` : `connected ${shortAddress(account)}`;
      });

      await renderWalletBalances(account);
    } catch (err) {
      console.warn('Wallet connect failed:', err);
      setStatus(err && err.message ? err.message : 'Wallet connection failed.');

      buttons.forEach((btn) => {
        btn.textContent = btn.dataset.oldText || (btn.id === 'connectPoolWalletBtn' ? '1 connect wallet' : 'connect wallet');
      });
    } finally {
      buttons.forEach((btn) => {
        btn.disabled = false;
      });
    }
  }

  function init() {
    const buttons = findConnectButtons();
    ensureBalanceCard();

    if (!buttons.length) return;

    buttons.forEach((btn) => {
      btn.addEventListener('click', connectWallet);
    });

    if (window.ethereum && window.ethereum.request) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then((accounts) => {
          if (accounts && accounts[0]) {
            const account = accounts[0];
            setStatus(`connected: ${shortAddress(account)}`);
            buttons.forEach((btn) => {
              btn.textContent = btn.id === 'connectPoolWalletBtn' ? `1 connected ${shortAddress(account)}` : `connected ${shortAddress(account)}`;
            });
            renderWalletBalances(account);
          }
        })
        .catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
