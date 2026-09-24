(() => {
  const TOTAL_SUPPLY_CIGO = 21000000;

  const E = (id) => document.getElementById(id);

  function fmt(n, digits = 4) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return x.toLocaleString(undefined, {
      maximumFractionDigits: digits
    });
  }

  function fmtUsd(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';

    return `$${x.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: x >= 1 ? 4 : 8
    })}`;
  }

  function setText(id, value) {
    const el = E(id);
    if (el) el.textContent = value;
  }

  async function loadCigoPublicStatus() {
    try {
      const res = await fetch('/api/pool/cigo', { cache: 'no-store' });
      const data = await res.json();

      if (!data || !data.ok || !data.pool) {
        throw new Error('Pool status unavailable');
      }

      const p = data.pool;

      const custodian = Number(p.custodianBalance || 0);
      const treasury = Number(p.treasuryBalance || 0);
      const usdtPool = Number(p.cigoUsdtPoolBalance || 0);
      const wbnbPool = Number(p.cigoWbnbPoolBalance || 0);
      const poolLiquidity = Number(p.poolLiquidityCigo || (usdtPool + wbnbPool));
      const poolSpotUsd = p.cigoPoolSpotUsd == null
        ? Number.NaN
        : Number(p.cigoPoolSpotUsd);
      const knownHeld = custodian + treasury;
      const estimatedPublicFloat = TOTAL_SUPPLY_CIGO - knownHeld - poolLiquidity;

      setText('statusTotalSupply', `${fmt(TOTAL_SUPPLY_CIGO, 0)} CIGO`);
      setText('statusCustodianHeld', `${fmt(custodian)} CIGO`);
      setText('statusTreasuryHeld', `${fmt(treasury)} CIGO`);
      setText('statusKnownHeld', `${fmt(knownHeld)} CIGO`);
      setText('statusPoolLiquidity', `${fmt(poolLiquidity)} CIGO`);
      setText('statusEstimatedFloat', `${fmt(estimatedPublicFloat)} CIGO`);
      setText(
        'statusPoolSpotPrice',
        Number.isFinite(poolSpotUsd) ? `${fmtUsd(poolSpotUsd)} per CIGO` : 'Unavailable'
      );
      setText('statusPoolBreakdown', `BSC-USD pool: ${fmt(usdtPool)} / WBNB pool: ${fmt(wbnbPool)}`);
      setText('statusUpdatedAt', p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '—');
    } catch (err) {
      setText('statusEstimatedFloat', 'Status unavailable');
      setText('statusPoolSpotPrice', 'Unavailable');
      setText('statusUpdatedAt', 'Could not load /api/pool/cigo');
    }
  }

  document.addEventListener('DOMContentLoaded', loadCigoPublicStatus);
})();
