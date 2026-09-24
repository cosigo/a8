document.addEventListener('DOMContentLoaded', () => {
    const els = {
        status: document.getElementById('swapStatus'),
        connectBtn: document.getElementById('connectBtn'),
        quoteBtn: document.getElementById('quoteBtn'),
        swapBtn: document.getElementById('swapBtn'),
        buyCigoBtn: document.getElementById('buyCigoBtn'),
        addCigoTopBtn: document.getElementById('addCigoTopBtn'),

        walletAddress: document.getElementById('walletAddress'),
        walletBNB: document.getElementById('walletBNB'),
        walletCIGO: document.getElementById('walletCIGO'),
        walletUSDT: document.getElementById('walletUSDT'),

        fromToken: document.getElementById('fromToken'),
        toToken: document.getElementById('toToken'),
        amountIn: document.getElementById('amountIn'),
        quoteStatusField: document.getElementById('quoteStatusField'),

        requestPanel: document.getElementById('requestPanel'),
        requestEmpty: document.getElementById('requestEmpty'),
        requestBody: document.getElementById('requestBody'),
        requestId: document.getElementById('requestId'),
        requestRoute: document.getElementById('requestRoute'),
        requestInput: document.getElementById('requestInput'),
        requestOutput: document.getElementById('requestOutput'),
        requestValue: document.getElementById('requestValue'),
        requestStatus: document.getElementById('requestStatus'),
        copyRequestBtn: document.getElementById('copyRequestBtn'),
        clearRequestBtn: document.getElementById('clearRequestBtn'),
        submitRequestBtn: document.getElementById('submitRequestBtn'),
        refreshRequestBtn: document.getElementById('refreshRequestBtn'),

        settlementBox: document.getElementById('settlementBox'),
        settlementTitle: document.getElementById('settlementTitle'),
        settlementCopy: document.getElementById('settlementCopy'),
        settlementList: document.getElementById('settlementList'),
        settlementNote: document.getElementById('settlementNote'),

        pricingPolicyNote: document.getElementById('pricingPolicyNote'),
        walletLimitNote: document.getElementById('walletLimitNote'),

        copyCigoContractTopBtn: document.getElementById('copyCigoContractTopBtn'),
        cigoContractTop: document.getElementById('cigoContractTop'),

        cigoAvailableNow: document.getElementById('cigoAvailableNow'),
        cigoCommittedReserve: document.getElementById('cigoCommittedReserve'),
        cigoCustodianShort: document.getElementById('cigoCustodianShort'),
        cigoTreasuryShort: document.getElementById('cigoTreasuryShort'),

        copyButtons: document.querySelectorAll('[data-copy]')
    };

    const CONFIG = {
        API_BASE: '/api',
        STORAGE_KEY_CURRENT_REQUEST: 'trade.cosigo.currentRequest',
        BSC_CHAIN_ID: '0x38',
        REQUEST_REFRESH_MS: 15000,
        COPY_RESET_MS: 1400,
        CONNECT_BTN_DEFAULT: '1) Connect wallet',
        CONNECT_BTN_READY: '2) Wallet ready',
        CONNECT_BTN_WRONG_NETWORK: '2) Wrong network',
        MARKET_ROUTE_ENABLED: false
    };

    const ADDRESSES = {
        CIGO: '0x3a38e963f524E0dDFB75dFa1752b4Cd1364F5560',
        USDT: '0x55d398326f99059fF775485246999027B3197955'
    };

    const REQUEST_STATUS_TEXT = {
        draft: 'Not yet submitted',
        submitted: 'Pending review',
        reviewed: 'Action required',
        completed: 'Completed'
    };

    const REQUEST_STATUS_CLASS = {
        draft: 'request-status-draft',
        submitted: 'request-status-submitted',
        reviewed: 'request-status-reviewed',
        completed: 'request-status-completed'
    };

    const state = {
        currentRequest: null,
        connectedAddress: null,
        walletSessionStarted: false,
        walletLimit: {
            usdtDailyWalletCap: 0,
            usedLast24h: 0,
            remaining24h: 0
        },
        balances: {
            BNB: 0,
            CIGO: 0,
            USDT: 0
        },
        pricing: {
            ozUsdReference: 100,
            cigoUsdReference: 0.0177,
            cigoInboundHaircutRate: 0.10,
            cigoOutboundPremiumRate: 0.05,
            cigoSellBasis: 0.009,
            cigoBuyBasis: 0.0105,
            cosigoUsdBasis: 100 / 31103.4768,
            usdtUsdBasis: 1,
            digitalExitFeeRate: 0.015,
            physicalRedemptionFeeRate: 0.25,
            version: 1,
            updatedAt: null
        },
        requestAutoRefreshTimer: null
    };

    function setAppStatus(message) {
        if (els.status) els.status.textContent = message;
    }

    function setQuoteStatus(message) {
        if (els.quoteStatusField) els.quoteStatusField.value = message;
    }

    function numberOr(value, fallback) {
        const num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatAssetAmount(value, asset) {
        const num = Number(value);
        if (!Number.isFinite(num)) return String(value ?? '');

        let maxDigits = 6;
        if (asset === 'COSIGO') maxDigits = 0;
        if (asset === 'CIGO') maxDigits = 1;
        if (asset === 'USDT') maxDigits = 2;
        if (asset === 'BNB') maxDigits = 4;

        return num.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: maxDigits
        });
    }

    function formatUsdAmount(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '$0.00';

        return `$${num.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function formatPercent(value) {
        const num = Number(value) * 100;
        if (!Number.isFinite(num)) return '0%';

        return `${num.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        })}%`;
    }

    function formatPoolAmount(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return '-';

        return num.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4
        });
    }

    function shortenAddress(address) {
        const value = String(address || '').trim();
        if (!value) return '-';
        return `${value.slice(0, 6)}...${value.slice(-4)}`;
    }

    function renderCigoPool(pool) {
        if (!pool) return;

        if (els.cigoAvailableNow) {
            els.cigoAvailableNow.textContent = `${formatPoolAmount(pool.availableFulfillment)} CIGO`;
        }

        if (els.cigoCommittedReserve) {
            els.cigoCommittedReserve.textContent = `${formatPoolAmount(pool.committedReserve)} CIGO`;
        }

        if (els.cigoCustodianShort) {
            els.cigoCustodianShort.textContent = shortenAddress(pool.custodianAddress);
            els.cigoCustodianShort.href = `https://bscscan.com/address/${pool.custodianAddress}`;
        }

        if (els.cigoTreasuryShort) {
            els.cigoTreasuryShort.textContent = shortenAddress(pool.treasuryAddress);
            els.cigoTreasuryShort.href = `https://bscscan.com/address/${pool.treasuryAddress}`;
        }
    }

    function getRequestStatusText(status) {
        return REQUEST_STATUS_TEXT[status] || status || '-';
    }

    function applyRequestStatusStyle(status) {
        if (!els.requestStatus) return;

        els.requestStatus.className = '';
        if (!status) return;

        els.requestStatus.classList.add('request-status-pill');

        const cls = REQUEST_STATUS_CLASS[status];
        if (cls) {
            els.requestStatus.classList.add(cls);
        }
    }

    async function copyText(value) {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            return true;
        }

        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();

        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }

        document.body.removeChild(ta);
        return ok;
    }

    function bindCopyButton(button, getValue, idleText = 'copy', successText = 'copied') {
        if (!button) return;

        button.addEventListener('click', async () => {
            const value = getValue();
            if (!value) return;

            const ok = await copyText(value);
            button.textContent = ok ? successText : 'copy failed';

            setTimeout(() => {
                button.textContent = idleText;
            }, CONFIG.COPY_RESET_MS);
        });
    }

    function updateRouteGuidance() {
        if (els.buyCigoBtn) els.buyCigoBtn.textContent = 'buy CIGO';
        if (els.quoteBtn) els.quoteBtn.textContent = '3) Get quote';
        if (els.swapBtn) els.swapBtn.textContent = '4) Request swap';
    }

    function updateWalletSummary(address, bnb, cigo, usdt) {
        state.connectedAddress = address;
        state.balances = {
            BNB: numberOr(bnb, 0),
            CIGO: numberOr(cigo, 0),
            USDT: numberOr(usdt, 0)
        };

        if (els.walletAddress) {
            els.walletAddress.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        }
        if (els.walletBNB) {
            els.walletBNB.textContent = state.balances.BNB.toFixed(4);
        }
        if (els.walletCIGO) {
            els.walletCIGO.textContent = state.balances.CIGO.toFixed(2);
        }
        if (els.walletUSDT) {
            els.walletUSDT.textContent = state.balances.USDT.toFixed(2);
        }
    }

    function clearWalletSummary() {
        state.connectedAddress = null;
        state.balances = {
            BNB: 0,
            CIGO: 0,
            USDT: 0
        };
        state.walletLimit = {
            usdtDailyWalletCap: 0,
            usedLast24h: 0,
            remaining24h: 0
        };

        if (els.walletAddress) els.walletAddress.textContent = 'Not connected';
        if (els.walletBNB) els.walletBNB.textContent = '0.0000';
        if (els.walletCIGO) els.walletCIGO.textContent = '0.00';
        if (els.walletUSDT) els.walletUSDT.textContent = '0.00';
        if (els.connectBtn) els.connectBtn.textContent = CONFIG.CONNECT_BTN_DEFAULT;

        updateWalletLimitNote();
    }

    function updateWalletLimitNote() {
        if (!els.walletLimitNote) return;

        if (!state.connectedAddress) {
            els.walletLimitNote.textContent = '24-hour USDT wallet cap will appear after wallet connection.';
            return;
        }

        if (!state.walletLimit.usdtDailyWalletCap) {
            els.walletLimitNote.textContent = 'No 24-hour USDT wallet cap is currently set.';
            return;
        }

        els.walletLimitNote.innerHTML =
            `<strong>24-hour USDT wallet cap:</strong> ` +
            `${formatAssetAmount(state.walletLimit.usedLast24h, 'USDT')} used / ` +
            `${formatAssetAmount(state.walletLimit.usdtDailyWalletCap, 'USDT')} total · ` +
            `<strong>${formatAssetAmount(state.walletLimit.remaining24h, 'USDT')} remaining</strong>`;
    }

    async function loadWalletLimitState(wallet) {
        if (!wallet) {
            state.walletLimit = {
                usdtDailyWalletCap: 0,
                usedLast24h: 0,
                remaining24h: 0
            };
            updateWalletLimitNote();
            return;
        }

        try {
            const data = await apiJson(`${CONFIG.API_BASE}/limits/wallet/${encodeURIComponent(wallet)}`);
            state.walletLimit = {
                usdtDailyWalletCap: numberOr(data.usdtDailyWalletCap, 0),
                usedLast24h: numberOr(data.usedLast24h, 0),
                remaining24h: numberOr(data.remaining24h, 0)
            };
        } catch (err) {
            console.error('Failed to load wallet limits', err);
            state.walletLimit = {
                usdtDailyWalletCap: 0,
                usedLast24h: 0,
                remaining24h: 0
            };
        }

        updateWalletLimitNote();
    }

    async function assertUsdtWalletCap(fromAsset, amount) {
        if (String(fromAsset).toUpperCase() !== 'USDT') return;
        if (!state.connectedAddress) return;

        await loadWalletLimitState(state.connectedAddress);

        if (
            state.walletLimit.usdtDailyWalletCap > 0 &&
            Number(amount) > state.walletLimit.remaining24h + 1e-9
        ) {
            throw new Error(
                `24-hour USDT cap exceeded. Remaining allowance: ${formatAssetAmount(state.walletLimit.remaining24h, 'USDT')} USDT.`
            );
        }
    }

    async function ensureBSC() {
        const { ethereum } = window;
        if (!ethereum) throw new Error('MetaMask not found');

        const chainId = await ethereum.request({ method: 'eth_chainId' });
        if (chainId === CONFIG.BSC_CHAIN_ID) return;

        try {
            await ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: CONFIG.BSC_CHAIN_ID }]
            });
        } catch (err) {
            alert('Switch to BNB Chain manually');
            throw err;
        }
    }

    async function isBSC() {
        if (!window.ethereum) return false;
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        return chainId === CONFIG.BSC_CHAIN_ID;
    }

    function fromBaseUnitHexToNumber(hexValue, decimals = 18, fractionDigits = 6) {
        try {
            const raw = BigInt(hexValue || '0x0');
            const base = 10n ** BigInt(decimals);
            const whole = raw / base;
            const fraction = raw % base;

            let fractionText = fraction.toString().padStart(decimals, '0');
            fractionText = fractionText.slice(0, fractionDigits).replace(/0+$/, '');

            return Number(fractionText ? `${whole}.${fractionText}` : whole.toString());
        } catch {
            return 0;
        }
    }

    async function getBNBBalance(address) {
        const hex = await window.ethereum.request({
            method: 'eth_getBalance',
            params: [address, 'latest']
        });

        return fromBaseUnitHexToNumber(hex, 18, 6);
    }

    async function getTokenBalance(address, tokenAddress) {
        const data = '0x70a08231' + address.toLowerCase().replace(/^0x/, '').padStart(64, '0');

        const hex = await window.ethereum.request({
            method: 'eth_call',
            params: [{ to: tokenAddress, data }, 'latest']
        });

        return fromBaseUnitHexToNumber(hex, 18, 6);
    }

    async function getCigoBalance(address) {
        return getTokenBalance(address, ADDRESSES.CIGO);
    }

    async function getUsdtBalance(address) {
        return getTokenBalance(address, ADDRESSES.USDT);
    }

    async function getRabbyProvider() {
    // Best method: EIP-6963 wallet discovery.
    return await new Promise((resolve) => {
        let found = null;

        function handler(event) {
            const { info, provider } = event.detail || {};

            if (info?.rdns === 'io.rabby') {
                found = provider;
                window.removeEventListener('eip6963:announceProvider', handler);
                resolve(provider);
            }
        }

        window.addEventListener('eip6963:announceProvider', handler);
        window.dispatchEvent(new Event('eip6963:requestProvider'));

        setTimeout(() => {
            window.removeEventListener('eip6963:announceProvider', handler);

            // Fallback: direct Rabby-injected provider.
            if (window.ethereum?.isRabby) {
                resolve(window.ethereum);
                return;
            }

            resolve(found);
        }, 600);
    });
}

async function getBestWalletProvider() {
    const rabbyProvider = await getRabbyProvider();

    if (rabbyProvider) {
        return {
            provider: rabbyProvider,
            label: 'Rabby'
        };
    }

    if (window.ethereum) {
        return {
            provider: window.ethereum,
            label: window.ethereum.isMetaMask ? 'MetaMask' : 'wallet'
        };
    }

    return {
        provider: null,
        label: 'wallet'
    };
}

async function addCigoToWallet() {
    const BNB_CHAIN_ID = '0x38';

    const BNB_CHAIN_PARAMS = {
        chainId: BNB_CHAIN_ID,
        chainName: 'BNB Smart Chain',
        nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18
        },
        rpcUrls: [
            'https://bsc-dataseed.bnbchain.org'
        ],
        blockExplorerUrls: [
            'https://bscscan.com'
        ]
    };

    const CIGO_TOKEN_PARAMS = {
        type: 'ERC20',
        options: {
            address: '0x3a38e963f524E0dDFB75dFa1752b4Cd1364F5560',
            symbol: 'CIGO',
            decimals: 18,
            image: 'https://market.cosigo.io/shared/assets/icons/cigo_256.png'
        }
    };

    try {
        if (!window.ethereum) {
            alert('MetaMask or compatible wallet not found.');
            return;
        }

        const currentChainId = await window.ethereum.request({
            method: 'eth_chainId'
        });

        if (String(currentChainId).toLowerCase() !== BNB_CHAIN_ID.toLowerCase()) {
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: BNB_CHAIN_ID }]
                });
            } catch (switchErr) {
                const errorCode = switchErr?.code || switchErr?.data?.originalError?.code;

                if (errorCode === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [BNB_CHAIN_PARAMS]
                    });

                    await window.ethereum.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: BNB_CHAIN_ID }]
                    });
                } else {
                    console.error('BNB Smart Chain switch failed:', switchErr);
                    alert('Please switch MetaMask to BNB Smart Chain and try again.');
                    return;
                }
            }
        }

        const added = await window.ethereum.request({
            method: 'wallet_watchAsset',
            params: CIGO_TOKEN_PARAMS
        });

        if (added) {
            alert('CIGO added to wallet on BNB Smart Chain.');
        }
    } catch (err) {
        console.error('CIGO auto-add failed:', err);
        alert('Could not add CIGO. Make sure MetaMask is unlocked and try again.');
    }
}

    function getSelectedRoute() {
        const from = els.fromToken?.value || '';
        const to = els.toToken?.value || '';
        const amount = Number(els.amountIn?.value || '');

        return {
            from,
            to,
            amount,
            isValidAmount: Number.isFinite(amount) && amount > 0
        };
    }


    function formatCigoUsdAmount(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return '$0.0000';

        return '$' + n.toLocaleString(undefined, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 6
        });
    }

    function updatePricingPolicyNote() {
        if (!els.pricingPolicyNote) return;

        const pricing = state.pricing;
        const updatedText = pricing.updatedAt
            ? `Pricing version ${pricing.version} · updated ${pricing.updatedAt}`
            : `Pricing version ${pricing.version}`;

        els.pricingPolicyNote.innerHTML =
            `<div class="pricing-policy-title">Current pricing policy</div>` +
            `<div class="pricing-policy-grid">` +
              `<div class="pricing-policy-section pricing-policy-cosigo">` +
                `<div class="pricing-policy-label">COSIGO&trade; silver-reference layer</div>` +
                `<div>Reference ounce basis: <strong>${formatUsdAmount(pricing.ozUsdReference)}</strong> per troy ounce.</div>` +
                `<div>Digital exit fee: <strong>${formatPercent(pricing.digitalExitFeeRate)}</strong>.</div>` +
                `<div>Physical silver redemption fee: <strong>${formatPercent(pricing.physicalRedemptionFeeRate)}</strong>.</div>` +
                `<a href="https://redeem.cosigo.io/" target="_blank" rel="noopener">open physical redemption page</a>` +
              `</div>` +
              `<div class="pricing-policy-section pricing-policy-cigo">` +
                `<div class="pricing-policy-label">CIGO manual direct-order pricing</div>` +
                `<div><strong>Manual pricing override:</strong> applies only to direct CIGO purchase and sale requests submitted through this page. It is separate from the live PancakeSwap pool spot price.</div>` +
                `<div>Manual reference basis: <strong>${formatCigoUsdAmount(pricing.cigoUsdReference)}</strong> per CIGO.</div>` +
                `<div>Direct-order sell discount: <strong>${formatPercent(pricing.cigoInboundHaircutRate)}</strong>.</div>` +
                `<div>Direct-order buy premium: <strong>${formatPercent(pricing.cigoOutboundPremiumRate)}</strong>.</div>` +
              `</div>` +
            `</div>` +
            `<div class="pricing-policy-updated">${updatedText}</div>`;
    }

    async function loadPricingState() {
        try {
            const data = await apiJson(`${CONFIG.API_BASE}/settings/public`);
            const settings = data.settings || {};
            const pricing = state.pricing;

            pricing.ozUsdReference = numberOr(settings.ozUsdReference, pricing.ozUsdReference);
            pricing.cigoUsdReference = numberOr(settings.cigoUsdReference, pricing.cigoUsdReference);
            pricing.cigoInboundHaircutRate = numberOr(settings.cigoInboundHaircutRate, pricing.cigoInboundHaircutRate);
            pricing.cigoOutboundPremiumRate = numberOr(settings.cigoOutboundPremiumRate, pricing.cigoOutboundPremiumRate);
            pricing.cigoSellBasis = numberOr(settings.cigoSellBasis, pricing.cigoSellBasis);
            pricing.cigoBuyBasis = numberOr(settings.cigoBuyBasis, pricing.cigoBuyBasis);
            pricing.cosigoUsdBasis = numberOr(settings.cosigoUsdBasis, pricing.cosigoUsdBasis);
            pricing.usdtUsdBasis = numberOr(settings.usdtUsdBasis, pricing.usdtUsdBasis);
            pricing.digitalExitFeeRate = numberOr(settings.digitalExitFeeRate, pricing.digitalExitFeeRate);
            pricing.physicalRedemptionFeeRate = numberOr(settings.physicalRedemptionFeeRate, pricing.physicalRedemptionFeeRate);
            pricing.version = numberOr(settings.version, pricing.version);
            pricing.updatedAt = settings.updatedAt || null;
        } catch (err) {
            console.error('Failed to load pricing settings', err);
        }

        updatePricingPolicyNote();
    }

    function getRouteFeePolicy(from, to) {
        const pricing = state.pricing;

        if (from === 'USDT' && to === 'COSIGO') {
            return { feeRate: 0, policyLabel: 'usdt to cosigo' };
        }
        if (from === 'COSIGO' && to === 'USDT') {
            return { feeRate: pricing.digitalExitFeeRate, policyLabel: 'cosigo to usdt' };
        }
        if (from === 'USDT' && to === 'CIGO') {
            return { feeRate: 0, policyLabel: 'usdt to cigo' };
        }
        if (from === 'CIGO' && to === 'USDT') {
            return { feeRate: 0, policyLabel: 'cigo to usdt' };
        }
        if (from === 'CIGO' && to === 'COSIGO') {
            return { feeRate: 0, policyLabel: 'cigo to cosigo' };
        }
        if (from === 'COSIGO' && to === 'CIGO') {
            return { feeRate: pricing.digitalExitFeeRate, policyLabel: 'cosigo to cigo' };
        }

        return { feeRate: 0, policyLabel: 'inactive' };
    }

    function getQuoteAdjustmentText(manualQuote) {
        if (!manualQuote) return '';

        const pricing = state.pricing;

        if (manualQuote.policyLabel === 'usdt to cosigo') {
            return 'COSIGO reference basis applied';
        }
        if (manualQuote.policyLabel === 'cosigo to usdt') {
            return `COSIGO exit fee applied (${formatPercent(pricing.digitalExitFeeRate)})`;
        }
        if (manualQuote.policyLabel === 'usdt to cigo') {
            return `CIGO buy basis premium applied (${formatPercent(pricing.cigoOutboundPremiumRate)})`;
        }
        if (manualQuote.policyLabel === 'cigo to usdt' || manualQuote.policyLabel === 'cigo to cosigo') {
            return `CIGO sell basis discount applied (${formatPercent(pricing.cigoInboundHaircutRate)})`;
        }
        if (manualQuote.policyLabel === 'cosigo to cigo') {
            return 'COSIGO exit fee and CIGO buy basis premium applied';
        }

        return `fee ${formatPercent(manualQuote.feeRate)}`;
    }


    function getQuoteBasisText(manualQuote) {
        if (!manualQuote) return '';

        const pricing = state.pricing;
        const cigoRef = formatCigoUsdAmount(pricing.cigoUsdReference);
        const cigoBuy = formatCigoUsdAmount(pricing.cigoBuyBasis);
        const cigoSell = formatCigoUsdAmount(pricing.cigoSellBasis);
        const cosigoBasis = formatUsdAmount(pricing.cosigoUsdBasis);

        if (manualQuote.policyLabel === 'usdt to cigo') {
            return `CIGO reference ${cigoRef}; buy basis ${cigoBuy}`;
        }

        if (manualQuote.policyLabel === 'cigo to usdt') {
            return `CIGO reference ${cigoRef}; sell basis ${cigoSell}`;
        }

        if (manualQuote.policyLabel === 'cigo to cosigo') {
            return `CIGO reference ${cigoRef}; COSIGO basis ${cosigoBasis}`;
        }

        if (manualQuote.policyLabel === 'cosigo to cigo') {
            return `COSIGO basis ${cosigoBasis}; CIGO reference ${cigoRef}`;
        }

        if (manualQuote.policyLabel === 'usdt to cosigo' || manualQuote.policyLabel === 'cosigo to usdt') {
            return `COSIGO basis ${cosigoBasis}`;
        }

        return '';
    }

    function routeUsesServerPreview(from, to) {
        return (from === 'CIGO' && to === 'USDT') || (from === 'USDT' && to === 'CIGO');
    }

    async function getServerQuotePreview(from, to, amount) {
        const data = await apiJson(`${CONFIG.API_BASE}/quote/preview`, {
            method: 'POST',
            body: JSON.stringify({
                fromAsset: from,
                toAsset: to,
                inputAmount: String(amount)
            })
        });

        const quote = data.quote || {};
        const output = Number(quote.outputAmount);
        const netUsdValue = Number(quote.basisValue ?? quote.outputAmount ?? 0);
        const feeUsdValue = Number(quote.feeAmount || 0);
        const feeRate = Number(quote.feeRate || 0);

        if (!Number.isFinite(output) || output <= 0 || !Number.isFinite(netUsdValue)) {
            throw new Error('Server quote preview returned an invalid amount.');
        }

        return {
            fromAsset: from,
            toAsset: to,
            output,
            grossUsdValue: netUsdValue + feeUsdValue,
            feeUsdValue,
            netUsdValue,
            feeRate,
            policyLabel: quote.pricingPolicy || 'cigo to usdt',
            serverPreview: true,
            cigoManualUsdValue: quote.cigoManualUsdValue,
            cigoPoolRouterUsdValue: quote.cigoPoolRouterUsdValue,
            cigoPoolCappedUsdValue: quote.cigoPoolCappedUsdValue,
            cigoManualOutputAmount: quote.cigoManualOutputAmount,
            cigoPoolRouterOutputAmount: quote.cigoPoolRouterOutputAmount,
            cigoPoolCappedOutputAmount: quote.cigoPoolCappedOutputAmount,
            cigoRequestPoolCapBps: quote.cigoRequestPoolCapBps
        };
    }

    function getServerPreviewAdjustmentText(quote) {
        if (!quote || !quote.serverPreview) return '';

        const capBps = Number(quote.cigoRequestPoolCapBps || 0);
        const deltaPct = capBps > 0 ? Math.abs(10000 - capBps) / 100 : null;
        const adjustmentText = deltaPct === null
            ? 'with configured desk adjustment'
            : capBps >= 10000
                ? `plus ${deltaPct.toFixed(2)}% manual desk premium`
                : `minus ${deltaPct.toFixed(2)}% safety buffer`;

        if (quote.fromAsset === 'USDT' && quote.toAsset === 'CIGO' && Number.isFinite(Number(quote.cigoPoolRouterOutputAmount))) {
            const routerText = `${formatAssetAmount(Number(quote.cigoPoolRouterOutputAmount), 'CIGO')} CIGO`;
            return `Server-anchored to live Pancake router estimate (${routerText}) ${adjustmentText}`;
        }

        if (Number.isFinite(Number(quote.cigoPoolRouterUsdValue))) {
            const routerText = formatUsdAmount(Number(quote.cigoPoolRouterUsdValue));
            return `Server-anchored to live Pancake router estimate (${routerText}) ${adjustmentText}`;
        }

        return 'Server-capped to live pool estimate';
    }

    async function getDisplayedQuote(from, to, amount) {
        const manualQuote = getManualQuote(from, to, amount);
        if (!manualQuote) return null;

        if (!routeUsesServerPreview(from, to)) {
            return manualQuote;
        }

        const serverQuote = await getServerQuotePreview(from, to, amount);
        return {
            ...manualQuote,
            ...serverQuote,
            policyLabel: manualQuote.policyLabel
        };
    }

    function getManualQuote(from, to, amount) {
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const pricing = state.pricing;
        const policy = getRouteFeePolicy(from, to);

        let grossUsdValue = 0;
        let feeUsdValue = 0;
        let netUsdValue = 0;
        let output = 0;

        if (from === 'USDT' && to === 'COSIGO') {
            grossUsdValue = amount;
            netUsdValue = grossUsdValue;
            output = netUsdValue / pricing.cosigoUsdBasis;
        } else if (from === 'COSIGO' && to === 'USDT') {
            grossUsdValue = amount * pricing.cosigoUsdBasis;
            feeUsdValue = grossUsdValue * pricing.digitalExitFeeRate;
            netUsdValue = grossUsdValue - feeUsdValue;
            output = netUsdValue;
        } else if (from === 'USDT' && to === 'CIGO') {
            grossUsdValue = amount;
            netUsdValue = grossUsdValue;
            output = netUsdValue / pricing.cigoBuyBasis;
        } else if (from === 'CIGO' && to === 'USDT') {
            grossUsdValue = amount * pricing.cigoSellBasis;
            netUsdValue = grossUsdValue;
            output = netUsdValue;
        } else if (from === 'CIGO' && to === 'COSIGO') {
            grossUsdValue = amount * pricing.cigoSellBasis;
            netUsdValue = grossUsdValue;
            output = netUsdValue / pricing.cosigoUsdBasis;
        } else if (from === 'COSIGO' && to === 'CIGO') {
            grossUsdValue = amount * pricing.cosigoUsdBasis;
            feeUsdValue = grossUsdValue * pricing.digitalExitFeeRate;
            netUsdValue = grossUsdValue - feeUsdValue;
            output = netUsdValue / pricing.cigoBuyBasis;
        } else {
            return null;
        }

        return {
            grossUsdValue,
            feeUsdValue,
            netUsdValue,
            output,
            feeRate: policy.feeRate,
            policyLabel: policy.policyLabel
        };
    }

    async function apiJson(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || `Request failed (${response.status})`);
        }

        return data;
    }

    function setSettlementState({ title, copy, steps = [], note = '', tone = '' }) {
        if (!els.settlementBox) return;

        els.settlementBox.hidden = false;
        els.settlementBox.className = 'settlement-box';

        if (tone) {
            els.settlementBox.classList.add(tone);
        }

        if (els.settlementTitle) {
            els.settlementTitle.textContent = title || 'Next step';
        }

        if (els.settlementCopy) {
            els.settlementCopy.innerHTML = copy || '';
        }

        if (els.settlementList) {
            if (steps.length) {
                els.settlementList.hidden = false;
                els.settlementList.innerHTML = steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('');
            } else {
                els.settlementList.hidden = true;
                els.settlementList.innerHTML = '';
            }
        }

        if (els.settlementNote) {
            if (note) {
                els.settlementNote.hidden = false;
                els.settlementNote.innerHTML = note;
            } else {
                els.settlementNote.hidden = true;
                els.settlementNote.innerHTML = '';
            }
        }
    }

    function renderSettlementBox(request) {
        if (!els.settlementBox) return;

        if (!request || (!request.id && !request.isLocalDraft && !request.localDraftId)) {
            els.settlementBox.hidden = true;
            if (els.settlementList) {
                els.settlementList.hidden = true;
                els.settlementList.innerHTML = '';
            }
            if (els.settlementNote) {
                els.settlementNote.hidden = true;
                els.settlementNote.innerHTML = '';
            }
            return;
        }

        const fromAsset = request.fromAsset || request.from || '-';
        const toAsset = request.toAsset || request.to || '-';
        const inputAmount = request.inputAmount || '-';
        const outputAmount = request.outputAmount || '-';
        const routeText = `${formatAssetAmount(inputAmount, fromAsset)} ${fromAsset} → ${formatAssetAmount(outputAmount, toAsset)} ${toAsset}`;
        const statusText = request.status || 'draft';

        if (statusText === 'draft') {
            setSettlementState({
                title: 'Ready to send',
                copy: `Your request has been created on this device only. Review <strong>${escapeHtml(routeText)}</strong>, then click <strong>Send request</strong> when you are ready.`,
                steps: [
                    'Confirm the route and amount.',
                    'Click Send request.',
                    'Refresh status for settlement address.'
                ],
                note: '<strong>Not yet submitted:</strong> this request is still local and has not entered the review queue.'
            });
            return;
        }

        if (statusText === 'submitted') {
            setSettlementState({
                title: 'Waiting for review',
                copy: `Your request for <strong>${escapeHtml(routeText)}</strong> has been sent and is now pending review.`,
                steps: [
                    'No payment action is required yet.',
                    'Status refreshes automatically while this page is open. You can also use Refresh status.',
                    'Wait until the status changes to Action required.'
                ],
                note: '<strong>Pending review:</strong> settlement instructions will appear here after approval.',
                tone: 'settlement-pending'
            });
            return;
        }

        if (statusText === 'reviewed') {
            const settlement = request.settlement || null;

            if (!settlement || !settlement.address) {
                setSettlementState({
                    title: 'Action required',
                    copy: `Your request for <strong>${escapeHtml(routeText)}</strong> has been reviewed, but the settlement details are not attached yet.`,
                    steps: [
                        'Do not send funds yet.',
                        'Refresh status again shortly.',
                        'Only proceed once the destination wallet and amount appear here.'
                    ],
                    note: `<strong>Important:</strong> this request is reviewed, but no settlement destination is available yet for reference <strong>${escapeHtml(request.id || request.localDraftId || '-')}</strong>.`,
                    tone: 'settlement-action'
                });
                return;
            }

            const settlementAsset = settlement.asset || fromAsset;
            const settlementAmount = settlement.amount || inputAmount;
            const settlementNetwork = settlement.network || 'BNB Smart Chain';
            const settlementAddress = settlement.address || '';
            const settlementNote = settlement.note || '';

            setSettlementState({
                title: 'Action required',
                copy: `Send <strong>${formatAssetAmount(settlementAmount, settlementAsset)} ${escapeHtml(settlementAsset)}</strong> on <strong>${escapeHtml(settlementNetwork)}</strong> to the approved settlement address below.`,
                steps: [
                    'Verify the wallet address carefully before sending.',
                    `Send the exact approved amount of ${settlementAsset}.`,
                    'Keep the transaction hash or payment proof.',
                    'Refresh status after sending so you can track completion.'
                ],
                note:
                    `<strong>Settlement address:</strong><br><code>${escapeHtml(settlementAddress)}</code>` +
                    (settlementNote ? `<br><br><strong>Note:</strong> ${escapeHtml(settlementNote)}` : '') +
                    `<br><br><strong>Reference:</strong> ${escapeHtml(request.id || request.localDraftId || '-')}`,
                tone: 'settlement-action'
            });
            return;
        }

        if (statusText === 'completed') {
            setSettlementState({
                title: 'Request completed',
                copy: `The request for <strong>${escapeHtml(routeText)}</strong> has been marked complete.`,
                steps: [
                    'Review your wallet balances.',
                    'Keep the request reference for your records.',
                    'Create a new request if you want to start another conversion.'
                ],
                note: '<strong>Completed:</strong> the managed workflow for this request has been finished.',
                tone: 'settlement-complete'
            });
            return;
        }

        setSettlementState({
            title: 'Request status',
            copy: `Current status: <strong>${escapeHtml(statusText)}</strong>.`,
            note: 'Refresh status to check for updates.'
        });
    }

    function getInvoicePopup() {
        let popup = document.getElementById('latestInvoicePopup');

        if (popup) return popup;

        popup = document.createElement('div');
        popup.id = 'latestInvoicePopup';
        popup.className = 'invoice-popup';
        popup.hidden = true;
        popup.innerHTML = `
            <div class="invoice-popup-backdrop" data-invoice-close></div>
            <div class="invoice-popup-card" role="dialog" aria-modal="true" aria-labelledby="latestInvoiceTitle">
                <div class="invoice-popup-head">
                    <div>
                        <div class="eyebrow">approved request found</div>
                        <h2 id="latestInvoiceTitle">payment instructions ready</h2>
                    </div>
                    <button type="button" class="invoice-popup-close" data-invoice-close aria-label="Close invoice popup">×</button>
                </div>
                <div class="invoice-popup-body" id="latestInvoiceBody"></div>
                <div class="invoice-popup-actions">
                    <button type="button" id="latestInvoiceCopyBtn">copy payment address</button>
                    <button type="button" id="latestInvoiceRefreshBtn">refresh status</button>
                    <button type="button" id="latestInvoiceViewBtn">view request panel</button>
                    <button type="button" data-invoice-close>close</button>
                </div>
            </div>
        `;

        popup.addEventListener('click', (ev) => {
            if (ev.target && ev.target.matches('[data-invoice-close]')) {
                popup.hidden = true;
            }
        });

        document.body.appendChild(popup);
        return popup;
    }

    async function copyTextToClipboard(value) {
        const text = String(value || '');

        if (!text) return false;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }

        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();

        let ok = false;
        try {
            ok = document.execCommand('copy');
        } finally {
            area.remove();
        }

        return ok;
    }

    function requestHasPaymentInstructions(request) {
        return (
            request &&
            String(request.status || '').toLowerCase() === 'reviewed' &&
            request.settlement &&
            request.settlement.address
        );
    }

    function showLatestInvoicePopup(request) {
        if (!requestHasPaymentInstructions(request)) return false;

        const settlement = request.settlement || {};
        const settlementAsset = settlement.asset || request.fromAsset || request.from || '-';
        const settlementAmount = settlement.amount || request.inputAmount || '-';
        const settlementNetwork = settlement.network || 'BNB Smart Chain';
        const settlementAddress = settlement.address || '';
        const settlementNote = settlement.note || '';
        const routeText = request.route || `${request.fromAsset || request.from || '-'} → ${request.toAsset || request.to || '-'}`;
        const requestId = request.id || request.localDraftId || '-';

        const popup = getInvoicePopup();
        const body = document.getElementById('latestInvoiceBody');

        if (!body) return false;

        body.innerHTML = `
            <div class="invoice-popup-grid">
                <div>
                    <span>request</span>
                    <strong>${escapeHtml(requestId)}</strong>
                </div>
                <div>
                    <span>route</span>
                    <strong>${escapeHtml(routeText)}</strong>
                </div>
                <div>
                    <span>send exact amount</span>
                    <strong>${escapeHtml(formatAssetAmount(settlementAmount, settlementAsset))} ${escapeHtml(settlementAsset)}</strong>
                </div>
                <div>
                    <span>network</span>
                    <strong>${escapeHtml(settlementNetwork)}</strong>
                </div>
            </div>

            <div class="invoice-address-box">
                <span>payment address</span>
                <code>${escapeHtml(settlementAddress)}</code>
            </div>

            <p class="invoice-popup-note">
                Verify the address and network before sending. Keep the transaction hash or payment proof.
                ${settlementNote ? `<br><strong>Note:</strong> ${escapeHtml(settlementNote)}` : ''}
            </p>
        `;

        const copyBtn = document.getElementById('latestInvoiceCopyBtn');
        const refreshBtn = document.getElementById('latestInvoiceRefreshBtn');
        const viewBtn = document.getElementById('latestInvoiceViewBtn');

        if (copyBtn) {
            copyBtn.onclick = async () => {
                const ok = await copyTextToClipboard(settlementAddress);
                setQuoteStatus(ok ? 'Payment address copied.' : 'Could not copy payment address.');
            };
        }

        if (refreshBtn) {
            refreshBtn.onclick = async () => {
                try {
                    const refreshed = await refreshCurrentRequestFromServer();
                    if (refreshed) {
                        showLatestInvoicePopup(refreshed);
                        setQuoteStatus(`Request refreshed: ${refreshed.id} (${refreshed.status})`);
                    }
                } catch (err) {
                    setQuoteStatus(`Refresh failed: ${err.message || err}`);
                }
            };
        }

        if (viewBtn) {
            viewBtn.onclick = () => {
                popup.hidden = true;
                if (els.requestPanel) {
                    els.requestPanel.hidden = false;
                    els.requestPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            };
        }

        popup.hidden = false;
        return true;
    }

    async function recoverLatestWalletInvoice(address) {
        if (!address) return null;

        const data = await apiJson(`${CONFIG.API_BASE}/requests/latest?wallet=${encodeURIComponent(address)}`);
        const request = data.request || null;

        if (!request || !request.id) return null;

        saveRequest(request);
        renderRequest(request);

        const statusText = String(request.status || '').toLowerCase();

        if (requestHasPaymentInstructions(request)) {
            if (state.invoicePopupShownFor !== request.id) {
                showLatestInvoicePopup(request);
                state.invoicePopupShownFor = request.id;
            }

            setQuoteStatus(`Approved request recovered: ${request.id}. Payment instructions are ready.`);
        } else if (statusText === 'submitted') {
            setQuoteStatus(`Request recovered: ${request.id}. Pending review.`);
        }

        return request;
    }

    function renderRequest(request) {
        if (!request || (!request.id && !request.isLocalDraft && !request.localDraftId)) {
            state.currentRequest = null;

            if (els.requestEmpty) els.requestEmpty.hidden = false;
            if (els.requestBody) els.requestBody.hidden = true;
            if (els.requestId) els.requestId.textContent = '-';
            if (els.requestRoute) els.requestRoute.textContent = '-';
            if (els.requestInput) els.requestInput.textContent = '-';
            if (els.requestOutput) els.requestOutput.textContent = '-';
            if (els.requestValue) els.requestValue.textContent = '-';
            if (els.requestStatus) els.requestStatus.textContent = getRequestStatusText('draft');

            applyRequestStatusStyle('');
            renderSettlementBox(null);

            if (els.requestPanel) els.requestPanel.hidden = true;
            return;
        }

        state.currentRequest = request;

        const fromAsset = request.fromAsset || request.from || '-';
        const toAsset = request.toAsset || request.to || '-';
        const inputAmount = request.inputAmount || '-';
        const outputAmount = request.outputAmount || '-';
        const basisValue = request.basisValue ?? request.valueUsd ?? 0;
        const statusText = request.status || 'draft';
        const displayId = request.id || request.localDraftId || '-';

        if (els.requestEmpty) els.requestEmpty.hidden = true;
        if (els.requestBody) els.requestBody.hidden = false;
        if (els.requestId) els.requestId.textContent = displayId;
        if (els.requestRoute) els.requestRoute.textContent = `${fromAsset} → ${toAsset}`;
        if (els.requestInput) els.requestInput.textContent = `${formatAssetAmount(inputAmount, fromAsset)} ${fromAsset}`;
        if (els.requestOutput) els.requestOutput.textContent = `${formatAssetAmount(outputAmount, toAsset)} ${toAsset}`;
        if (els.requestValue) els.requestValue.textContent = formatUsdAmount(basisValue);
        if (els.requestStatus) els.requestStatus.textContent = getRequestStatusText(statusText);

        applyRequestStatusStyle(statusText);
        renderSettlementBox(request);

        if (els.requestPanel) els.requestPanel.hidden = false;
    }

    function isServerTrackedOpenRequest(request) {
        return !!request?.id && (request.status === 'submitted' || request.status === 'reviewed');
    }

    async function autoRefreshCurrentRequest() {
        if (!isServerTrackedOpenRequest(state.currentRequest)) return;

        try {
            await refreshCurrentRequestFromServer();
        } catch (err) {
            console.warn('Auto refresh failed', err);
        }
    }

    function stopRequestAutoRefresh() {
        if (state.requestAutoRefreshTimer) {
            clearInterval(state.requestAutoRefreshTimer);
            state.requestAutoRefreshTimer = null;
        }
    }

    function startRequestAutoRefresh() {
        stopRequestAutoRefresh();

        if (!isServerTrackedOpenRequest(state.currentRequest)) return;

        state.requestAutoRefreshTimer = setInterval(() => {
            autoRefreshCurrentRequest();
        }, CONFIG.REQUEST_REFRESH_MS);
    }

    function syncRequestButtons() {
        const hasRequest = !!state.currentRequest;
        const canSend = hasRequest && state.currentRequest.status === 'draft';
        const canRefresh = hasRequest && !!state.currentRequest.id;
        const canCopy = hasRequest;
        const canClear = hasRequest;

        if (els.copyRequestBtn) {
            els.copyRequestBtn.hidden = !canCopy;
            els.copyRequestBtn.disabled = !canCopy;
        }
        if (els.clearRequestBtn) {
            els.clearRequestBtn.hidden = !canClear;
            els.clearRequestBtn.disabled = !canClear;
        }
        if (els.submitRequestBtn) {
            els.submitRequestBtn.hidden = !canSend;
            els.submitRequestBtn.disabled = !canSend;
        }
        if (els.refreshRequestBtn) {
            els.refreshRequestBtn.hidden = !canRefresh;
            els.refreshRequestBtn.disabled = !canRefresh;
        }
    }

    function saveRequest(request) {
        state.currentRequest = request || null;

        if (state.currentRequest?.isLocalDraft) {
            localStorage.setItem(CONFIG.STORAGE_KEY_CURRENT_REQUEST, JSON.stringify(state.currentRequest));
        } else if (state.currentRequest?.id) {
            localStorage.setItem(CONFIG.STORAGE_KEY_CURRENT_REQUEST, JSON.stringify({ id: state.currentRequest.id }));
        } else {
            localStorage.removeItem(CONFIG.STORAGE_KEY_CURRENT_REQUEST);
        }

        renderRequest(state.currentRequest);
        syncRequestButtons();
        startRequestAutoRefresh();
    }

    function clearRequest() {
        saveRequest(null);
    }

    function revealRequestPanel() {
        if (!els.requestPanel) return;

        els.requestPanel.hidden = false;
        els.requestPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

        setTimeout(() => {
            if (els.submitRequestBtn && !els.submitRequestBtn.hidden && !els.submitRequestBtn.disabled) {
                els.submitRequestBtn.focus();
            }
        }, 250);
    }

    function createLocalDraftRequest({
        wallet,
        fromAsset,
        toAsset,
        inputAmount,
        outputAmount,
        basisValue,
        feeAmount,
        feeRate,
        pricingPolicy
    }) {
        const draft = {
            isLocalDraft: true,
            localDraftId: `draft_${Date.now().toString(36)}`,
            createdAt: new Date().toISOString(),
            wallet,
            fromAsset,
            toAsset,
            route: `${fromAsset} → ${toAsset}`,
            inputAmount,
            outputAmount,
            basisValue,
            feeAmount,
            feeRate,
            pricingPolicy,
            status: 'draft'
        };

        saveRequest(draft);
        return draft;
    }

    async function submitCurrentRequest() {
        if (!state.currentRequest) return null;

        if (state.currentRequest.isLocalDraft) {
            const createData = await apiJson(`${CONFIG.API_BASE}/requests/create`, {
                method: 'POST',
                body: JSON.stringify({
                    wallet: state.currentRequest.wallet,
                    fromAsset: state.currentRequest.fromAsset,
                    toAsset: state.currentRequest.toAsset,
                    inputAmount: String(state.currentRequest.inputAmount)
                })
            });

            const createdRequest = createData.request;
            const submittedData = await apiJson(
                `${CONFIG.API_BASE}/requests/${encodeURIComponent(createdRequest.id)}/status`,
                {
                    method: 'POST',
                    body: JSON.stringify({ status: 'submitted' })
                }
            );

            saveRequest(submittedData.request);
            return submittedData.request;
        }

        if (!state.currentRequest.id) return null;

        const data = await apiJson(
            `${CONFIG.API_BASE}/requests/${encodeURIComponent(state.currentRequest.id)}/status`,
            {
                method: 'POST',
                body: JSON.stringify({ status: 'submitted' })
            }
        );

        saveRequest(data.request);
        return data.request;
    }

    async function refreshCurrentRequestFromServer() {
        if (!state.currentRequest?.id) return null;

        const data = await apiJson(
            `${CONFIG.API_BASE}/requests/${encodeURIComponent(state.currentRequest.id)}`
        );

        saveRequest(data.request);
        return data.request;
    }

    async function loadSavedRequest() {
        try {
            const raw = localStorage.getItem(CONFIG.STORAGE_KEY_CURRENT_REQUEST);

            if (!raw) {
                saveRequest(null);
                return;
            }

            const saved = JSON.parse(raw);

            if (saved?.isLocalDraft) {
                saveRequest(saved);
                return;
            }

            if (!saved?.id) {
                saveRequest(null);
                return;
            }

            const data = await apiJson(`${CONFIG.API_BASE}/requests/${encodeURIComponent(saved.id)}`);
            saveRequest(data.request);
        } catch (err) {
            console.warn('Could not reload saved request', err);
            saveRequest(null);
        }
    }

    async function refreshWalletState(address) {
        const onBSC = await isBSC();

        if (!onBSC) {
            clearWalletSummary();
            updateRouteGuidance();
            setAppStatus('Wrong network. Switch to BNB Chain.');

            if (els.connectBtn) {
                els.connectBtn.textContent = CONFIG.CONNECT_BTN_WRONG_NETWORK;
            }
            return;
        }

        const bnb = await getBNBBalance(address);
        const cigo = await getCigoBalance(address);
        const usdt = await getUsdtBalance(address);

        updateRouteGuidance();
        updateWalletSummary(address, bnb, cigo, usdt);

        if (els.connectBtn) {
            els.connectBtn.textContent = CONFIG.CONNECT_BTN_READY;
        }

        setAppStatus(
            `Connected: ${address.slice(0, 6)}...${address.slice(-4)} | BNB: ${bnb.toFixed(4)} | CIGO: ${cigo.toFixed(2)} | USDT: ${usdt.toFixed(2)}`
        );
        setQuoteStatus('Ready for quote');
        await loadWalletLimitState(address);

        try {
            await recoverLatestWalletInvoice(address);
        } catch (err) {
            console.warn('Could not recover latest wallet invoice', err);
        }
    }

    if (els.refreshRequestBtn) {
        els.refreshRequestBtn.addEventListener('click', async () => {
            try {
                const request = await refreshCurrentRequestFromServer();
                setQuoteStatus(request ? `Request refreshed: ${request.id} (${request.status})` : 'No server-backed request to refresh.');
            } catch (err) {
                console.error(err);
                setQuoteStatus(`Refresh failed: ${err.message || err}`);
            }
        });
    }

    if (CONFIG.MARKET_ROUTE_ENABLED && els.buyCigoBtn) {
        els.buyCigoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.open(
                'https://pancakeswap.finance/swap?chain=bsc&outputCurrency=0x3a38e963f524E0dDFB75dFa1752b4Cd1364F5560',
                '_blank'
            );
        });
    }

    if (els.connectBtn) {
        els.connectBtn.addEventListener('click', async () => {
            if (!window.ethereum) {
                alert('MetaMask not found');
                return;
            }

            try {
                state.walletSessionStarted = true;
                const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                await ensureBSC();
                await refreshWalletState(accounts[0]);
            } catch (err) {
                state.walletSessionStarted = false;
                clearWalletSummary();
                updateRouteGuidance();
                console.error(err);
                setAppStatus(`Connection failed: ${err.message || err}`);
            }
        });
    }

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', async (accounts) => {
            try {
                if (!state.walletSessionStarted) {
                    clearWalletSummary();
                    updateRouteGuidance();
                    setAppStatus('Click Connect wallet to begin');
                    return;
                }

                if (!accounts || !accounts.length) {
                    state.walletSessionStarted = false;
                    clearWalletSummary();
                    updateRouteGuidance();
                    setAppStatus('Wallet disconnected');
                    return;
                }

                await refreshWalletState(accounts[0]);
            } catch (err) {
                console.error(err);
                setAppStatus(`Wallet update failed: ${err.message || err}`);
            }
        });

        window.ethereum.on('chainChanged', async () => {
            try {
                if (!state.walletSessionStarted) {
                    clearWalletSummary();
                    updateRouteGuidance();
                    setAppStatus('Click Connect wallet to begin.');
                    return;
                }

                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (!accounts || !accounts.length) {
                    state.walletSessionStarted = false;
                    clearWalletSummary();
                    updateRouteGuidance();
                    setAppStatus('Wallet disconnected');
                    return;
                }

                await ensureBSC();
                await refreshWalletState(accounts[0]);
            } catch (err) {
                console.error(err);
                setAppStatus(`Chain update failed: ${err.message || err}`);
            }
        });
    }

    if (els.addCigoTopBtn) {
    els.addCigoTopBtn.addEventListener('click', async () => {
        await addCigoToWallet();
    });
}

    bindCopyButton(
        els.copyCigoContractTopBtn,
        () => els.cigoContractTop?.textContent?.trim() || '',
        'copy contract',
        'copied'
    );

    els.copyButtons.forEach((button) => {
        const idleText = button.textContent.trim() || 'copy';
        bindCopyButton(button, () => button.dataset.copy || '', idleText, 'copied');
    });

    if (els.quoteBtn) {
        els.quoteBtn.addEventListener('click', async () => {
            const { from, to, amount, isValidAmount } = getSelectedRoute();

            if (!from || !to) {
                setQuoteStatus('Select both a from asset and a to asset.');
                return;
            }
            if (!isValidAmount) {
                setQuoteStatus('Enter a valid amount greater than zero.');
                return;
            }
            if (from === to) {
                setQuoteStatus('Choose two different assets.');
                return;
            }

            try {
                if (routeUsesServerPreview(from, to)) {
                    setQuoteStatus('Reading server-capped live pool estimate...');
                }

                const manualQuote = await getDisplayedQuote(from, to, amount);
                if (!manualQuote) {
                    setQuoteStatus('This route is not active in the current shell.');
                    return;
                }

                const adjustmentText = manualQuote.serverPreview
                    ? getServerPreviewAdjustmentText(manualQuote)
                    : getQuoteAdjustmentText(manualQuote);
                const basisText = getQuoteBasisText(manualQuote);
                setQuoteStatus(
                    `Quote (${manualQuote.policyLabel}): ${formatAssetAmount(amount, from)} ${from} ≈ ${formatAssetAmount(manualQuote.output, to)} ${to} | ${basisText}${basisText ? ' | ' : ''}${adjustmentText} | net value ≈ ${formatUsdAmount(manualQuote.netUsdValue)}`
                );
            } catch (err) {
                setQuoteStatus(`Quote failed: ${err.message || err}`);
            }
        });
    }

    if (els.swapBtn) {
        els.swapBtn.addEventListener('click', async () => {
            const { from, to, amount, isValidAmount } = getSelectedRoute();

            if (!from || !to) {
                setQuoteStatus('Select both a from asset and a to asset.');
                return;
            }
            if (!isValidAmount) {
                setQuoteStatus('Enter a valid amount greater than zero.');
                return;
            }
            if (from === to) {
                setQuoteStatus('Choose two different assets.');
                return;
            }
            if (!state.connectedAddress) {
                setQuoteStatus('Connect wallet first.');
                return;
            }

            let manualQuote = getManualQuote(from, to, amount);
            if (!manualQuote) {
                setQuoteStatus('This route is not active in the current shell.');
                return;
            }

            try {
                await assertUsdtWalletCap(from, amount);

                if (routeUsesServerPreview(from, to)) {
                    setQuoteStatus('Reading server-capped live pool estimate before creating request...');
                    manualQuote = await getDisplayedQuote(from, to, amount);
                }

                const request = createLocalDraftRequest({
                    wallet: state.connectedAddress,
                    fromAsset: from,
                    toAsset: to,
                    inputAmount: String(amount),
                    outputAmount: String(manualQuote.output),
                    basisValue: String(manualQuote.netUsdValue),
                    feeAmount: String(manualQuote.feeUsdValue),
                    feeRate: manualQuote.feeRate,
                    pricingPolicy: manualQuote.policyLabel
                });

                revealRequestPanel();

                const prefix =
                    (from === 'CIGO' && to === 'COSIGO') || (from === 'COSIGO' && to === 'CIGO')
                        ? 'Direct internal conversion request created'
                        : 'Internal conversion request created';

                const basisText = getQuoteBasisText(manualQuote);
                setQuoteStatus(
                    `${prefix}: ${request.id || request.localDraftId} | ${formatAssetAmount(amount, from)} ${from} ≈ ${formatAssetAmount(manualQuote.output, to)} ${to}${basisText ? ' | ' + basisText : ''}`
                );
            } catch (err) {
                console.error(err);
                setQuoteStatus(`Conversion request failed: ${err.message || err}`);
            }
        });
    }

    if (els.submitRequestBtn) {
        els.submitRequestBtn.addEventListener('click', async () => {
            try {
                const request = await submitCurrentRequest();
                if (request) {
                    setQuoteStatus(`Request submitted: ${request.id}`);
                }
            } catch (err) {
                console.error(err);
                setQuoteStatus(`Submit failed: ${err.message || err}`);
            }
        });
    }

    if (els.copyRequestBtn) {
        els.copyRequestBtn.addEventListener('click', async () => {
            if (!state.currentRequest) {
                setQuoteStatus('No conversion request to copy.');
                return;
            }

            const text = JSON.stringify(state.currentRequest, null, 2);
            const ok = await copyText(text);
            setQuoteStatus(ok ? 'Conversion request copied.' : 'Failed to copy conversion request.');
        });
    }

    if (els.clearRequestBtn) {
        els.clearRequestBtn.addEventListener('click', () => {
            clearRequest();
            setQuoteStatus('Conversion request cleared.');
        });
    }

    window.addEventListener('focus', () => {
        autoRefreshCurrentRequest().catch(console.error);
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            autoRefreshCurrentRequest().catch(console.error);
        }
    });

    if (els.requestPanel) els.requestPanel.hidden = true;
    clearWalletSummary();
    updateRouteGuidance();
    syncRequestButtons();
    setAppStatus('Click Connect wallet to begin.');
    updateWalletLimitNote();

    loadPricingState();
    loadSavedRequest();

    apiJson(`${CONFIG.API_BASE}/pool/cigo`)
        .then((data) => {
            console.log('CIGO pool', data.pool);

            const pool = data.pool || null;
            if (!pool) return;

            const formatPoolAmount = (value) => {
                const num = Number(value);
                if (!Number.isFinite(num)) return '-';
                return num.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 1
                });
            };

            const shortenAddress = (address) => {
                const value = String(address || '').trim();
                if (!value) return '-';
                return `${value.slice(0, 6)}...${value.slice(-4)}`;
            };

            if (els.cigoAvailableNow) {
                els.cigoAvailableNow.textContent = `${formatPoolAmount(pool.availableFulfillment)} CIGO`;
            }

            if (els.cigoCommittedReserve) {
                els.cigoCommittedReserve.textContent = `${formatPoolAmount(pool.committedReserve)} CIGO`;
            }

            if (els.cigoCustodianShort) {
                els.cigoCustodianShort.textContent = shortenAddress(pool.custodianAddress);
                els.cigoCustodianShort.href = `https://bscscan.com/address/${pool.custodianAddress}`;
            }

            if (els.cigoTreasuryShort) {
                els.cigoTreasuryShort.textContent = shortenAddress(pool.treasuryAddress);
                els.cigoTreasuryShort.href = `https://bscscan.com/address/${pool.treasuryAddress}`;
            }
        })
        .catch((err) => {
            console.error('Failed to load CIGO pool', err);
        });
});