(() => {
  const targets = document.querySelectorAll('[data-cigo-pool-price]');
  if (!targets.length) return;

  const setAll = (value) => {
    targets.forEach((target) => {
      target.textContent = value;
    });
  };

  const apiUrl =
    window.location.hostname === 'market.cosigo.io' ||
    window.location.hostname === 'quote.cosigo.io'
      ? 'https://trade.cosigo.io/api/pool/cigo'
      : '/api/pool/cigo';

  async function loadCigoPoolPrice() {
    try {
      const response = await fetch(apiUrl, { cache: 'no-store' });
      const data = await response.json();
      const price = Number(data?.pool?.cigoPoolSpotUsd);

      if (!response.ok || !data?.ok || !Number.isFinite(price) || price <= 0) {
        throw new Error('CIGO pool price unavailable');
      }

      const formatted = price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 8
      });

      setAll(`$${formatted} per CIGO`);
    } catch (err) {
      setAll('unavailable');
      console.warn('Could not load CIGO pool price:', err);
    }
  }

  loadCigoPoolPrice();
})();
