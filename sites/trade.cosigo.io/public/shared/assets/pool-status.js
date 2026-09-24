(() => {
  const E = (id) => document.getElementById(id);

  function setText(id, value) {
    const el = E(id);
    if (el) el.textContent = value;
  }

  function fmt(n, digits = 4) {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return x.toLocaleString(undefined, { maximumFractionDigits: digits });
  }

  async function loadPool() {
    try {
      const res = await fetch('/api/pool/cigo', { cache: 'no-store' });
      const data = await res.json();

      if (!data || !data.ok || !data.pool) {
        throw new Error('pool API unavailable');
      }

      const p = data.pool;

      setText('poolCigoUsdt', `${fmt(p.cigoUsdtPoolBalance)} CIGO`);
      setText('poolCigoWbnb', `${fmt(p.cigoWbnbPoolBalance)} CIGO`);
      setText('poolCigoTotal', `${fmt(p.poolLiquidityCigo)} CIGO`);
      setText('poolReserveTotal', `${fmt(p.committedReserve)} CIGO`);
      setText('poolUpdatedAt', p.updatedAt ? new Date(p.updatedAt).toLocaleString() : 'loaded');
    } catch (err) {
      setText('poolCigoUsdt', 'unavailable');
      setText('poolCigoWbnb', 'unavailable');
      setText('poolCigoTotal', 'unavailable');
      setText('poolReserveTotal', 'unavailable');
      setText('poolUpdatedAt', 'unavailable');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadPool();
    window.setInterval(loadPool, 30000);
  });
})();
