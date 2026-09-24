(function () {
  "use strict";

  if (window.__cigoLiquidityDeskPopupLoaded) return;
  window.__cigoLiquidityDeskPopupLoaded = true;

  const STYLE_ID = "cigo-liquidity-desk-popup-style";
  const MODAL_ID = "cigo-liquidity-desk-popup-modal";

  function money(value) {
    return Number(value || 0).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cigo-liquidity-desk-open {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: .4rem;
        margin: .75rem 0 0;
        border: 1px solid rgba(246,184,75,.55);
        border-radius: 999px;
        padding: .7rem 1rem;
        background: linear-gradient(135deg, rgba(246,184,75,.18), rgba(120,70,25,.28));
        color: #ffe4a3;
        font-weight: 800;
        text-decoration: none;
        cursor: pointer;
        box-shadow: 0 12px 35px rgba(0,0,0,.22);
      }

      .cigo-liquidity-desk-open:hover,
      .cigo-liquidity-desk-open:focus {
        outline: none;
        border-color: rgba(246,184,75,.9);
        text-decoration: none;
      }

      .cigo-liquidity-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(5, 3, 2, .76);
        backdrop-filter: blur(6px);
      }

      .cigo-liquidity-modal-backdrop[aria-hidden="false"] {
        display: flex;
      }

      .cigo-liquidity-modal {
        width: min(860px, 100%);
        max-height: min(88vh, 820px);
        overflow: auto;
        border: 1px solid rgba(255,205,145,.28);
        border-radius: 22px;
        background:
          radial-gradient(circle at top left, rgba(246,184,75,.13), transparent 28rem),
          #160d08;
        color: #fff7e8;
        box-shadow: 0 26px 80px rgba(0,0,0,.55);
      }

      .cigo-liquidity-modal-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        padding: 1.15rem 1.25rem;
        border-bottom: 1px solid rgba(255,205,145,.18);
      }

      .cigo-liquidity-modal-header h2 {
        margin: 0;
        color: #ffdc8a;
        font-size: clamp(1.3rem, 3vw, 2rem);
        line-height: 1.1;
      }

      .cigo-liquidity-modal-close {
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 999px;
        background: rgba(255,255,255,.06);
        color: #fff7e8;
        cursor: pointer;
        font-size: 1.35rem;
        line-height: 1;
        min-width: 2.25rem;
        min-height: 2.25rem;
      }

      .cigo-liquidity-modal-body {
        padding: 1.25rem;
      }

      .cigo-liquidity-callout {
        border: 1px solid rgba(146,230,167,.28);
        border-radius: 16px;
        padding: 1rem;
        background: rgba(30, 80, 45, .22);
        margin-bottom: 1rem;
      }

      .cigo-liquidity-warning {
        border: 1px solid rgba(255,143,124,.32);
        border-radius: 16px;
        padding: 1rem;
        background: rgba(80, 25, 19, .35);
        margin-top: 1rem;
      }

      .cigo-liquidity-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: .85rem;
        margin: 1rem 0;
      }

      .cigo-liquidity-metric {
        border: 1px solid rgba(255,205,145,.18);
        border-radius: 14px;
        padding: .85rem;
        background: rgba(255,255,255,.045);
      }

      .cigo-liquidity-metric strong {
        display: block;
        color: #ffdc8a;
        font-size: 1.2rem;
      }

      .cigo-liquidity-input-row {
        display: flex;
        flex-wrap: wrap;
        gap: .65rem;
        align-items: center;
        margin: 1rem 0;
      }

      .cigo-liquidity-input-row input {
        width: min(220px, 100%);
        border: 1px solid rgba(255,205,145,.28);
        border-radius: 12px;
        padding: .7rem .8rem;
        background: rgba(0,0,0,.22);
        color: #fff7e8;
        font: inherit;
      }

      .cigo-liquidity-table-wrap {
        overflow-x: auto;
        border: 1px solid rgba(255,205,145,.18);
        border-radius: 14px;
        margin-top: 1rem;
      }

      .cigo-liquidity-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 520px;
        font-size: .94rem;
      }

      .cigo-liquidity-table th,
      .cigo-liquidity-table td {
        padding: .7rem .75rem;
        border-bottom: 1px solid rgba(255,205,145,.13);
        text-align: left;
      }

      .cigo-liquidity-table th {
        color: #ffdc8a;
        background: rgba(255,255,255,.045);
      }

      .cigo-liquidity-small {
        color: #d9b889;
        font-size: .92rem;
      }
    `;
    document.head.appendChild(style);
  }

  function buildModal() {
    if (document.getElementById(MODAL_ID)) return document.getElementById(MODAL_ID);

    const backdrop = document.createElement("div");
    backdrop.id = MODAL_ID;
    backdrop.className = "cigo-liquidity-modal-backdrop";
    backdrop.setAttribute("aria-hidden", "true");

    backdrop.innerHTML = `
      <section class="cigo-liquidity-modal" role="dialog" aria-modal="true" aria-labelledby="cigo-liquidity-title">
        <div class="cigo-liquidity-modal-header">
          <div>
            <p class="cigo-liquidity-small">CIGO request desk / early liquidity-build phase</p>
            <h2 id="cigo-liquidity-title">Large purchase liquidity reinvestment</h2>
          </div>
          <button class="cigo-liquidity-modal-close" type="button" aria-label="Close">×</button>
        </div>
        <div class="cigo-liquidity-modal-body">
          <div class="cigo-liquidity-callout">
            <strong>Policy target:</strong>
            For approved large CIGO desk purchases, COSIGO intends to allocate at least <strong>90%</strong> of desk-settlement USDT, and up to <strong>95%</strong> for strategic settlements, back into the public CIGO / BSC-USD pool, matched with treasury CIGO at the live pool ratio.
          </div>

          <p>
            The buyer receives CIGO from treasury or matched inventory at the approved desk quote.
            The liquidity reinvestment is intended to deepen public pool reserves instead of extracting large settlement USDT from the market.
          </p>

          <div class="cigo-liquidity-input-row">
            <label for="cigo-liquidity-amount"><strong>Desk purchase example:</strong></label>
            <input id="cigo-liquidity-amount" type="number" min="250" step="250" value="1000" inputmode="decimal">
          </div>

          <div class="cigo-liquidity-grid">
            <div class="cigo-liquidity-metric">
              <span>90% liquidity reinvestment</span>
              <strong id="cigo-liquidity-90">$900.00</strong>
              <small>USDT added back to pool, matched with treasury CIGO.</small>
            </div>
            <div class="cigo-liquidity-metric">
              <span>95% strategic reinvestment</span>
              <strong id="cigo-liquidity-95">$950.00</strong>
              <small>Higher rebuild target for approved strategic settlements.</small>
            </div>
            <div class="cigo-liquidity-metric">
              <span>Remaining reserve / operations band</span>
              <strong id="cigo-liquidity-reserve">$50.00–$100.00</strong>
              <small>May cover gas, risk, staged settlement, or desk operations.</small>
            </div>
          </div>

          <div class="cigo-liquidity-table-wrap">
            <table class="cigo-liquidity-table">
              <thead>
                <tr>
                  <th>Desk purchase</th>
                  <th>90% pool reinvestment</th>
                  <th>95% strategic reinvestment</th>
                </tr>
              </thead>
              <tbody id="cigo-liquidity-tier-body"></tbody>
            </table>
          </div>

          <div class="cigo-liquidity-warning">
            <strong>Important:</strong>
            This is not a guarantee of price, resale value, exit liquidity, profit, or loss-free sellback.
            Adding liquidity improves pool depth, but AMM curve movement, PancakeSwap fees, CIGO contract tax, wallet risk, and market risk still apply.
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(backdrop);

    const close = backdrop.querySelector(".cigo-liquidity-modal-close");
    close.addEventListener("click", () => hideModal());
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) hideModal();
    });

    const input = backdrop.querySelector("#cigo-liquidity-amount");
    input.addEventListener("input", updateCalculator);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && backdrop.getAttribute("aria-hidden") === "false") {
        hideModal();
      }
    });

    updateCalculator();
    buildTierRows();
    return backdrop;
  }

  function updateCalculator() {
    const input = document.getElementById("cigo-liquidity-amount");
    const v = Math.max(0, Number(input && input.value ? input.value : 0));
    const reinvest90 = v * 0.90;
    const reinvest95 = v * 0.95;
    const reserveLow = v - reinvest95;
    const reserveHigh = v - reinvest90;

    const el90 = document.getElementById("cigo-liquidity-90");
    const el95 = document.getElementById("cigo-liquidity-95");
    const reserve = document.getElementById("cigo-liquidity-reserve");

    if (el90) el90.textContent = money(reinvest90);
    if (el95) el95.textContent = money(reinvest95);
    if (reserve) reserve.textContent = money(reserveLow) + "–" + money(reserveHigh);
  }

  function buildTierRows() {
    const body = document.getElementById("cigo-liquidity-tier-body");
    if (!body || body.children.length) return;

    for (let amount = 250; amount <= 5000; amount += 250) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${money(amount)}</td>
        <td>${money(amount * 0.90)}</td>
        <td>${money(amount * 0.95)}</td>
      `;
      body.appendChild(row);
    }
  }

  function showModal() {
    const modal = buildModal();
    modal.setAttribute("aria-hidden", "false");
    const input = modal.querySelector("#cigo-liquidity-amount");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function hideModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.setAttribute("aria-hidden", "true");
  }

  function addButton() {
    const existing = document.getElementById("cigoLiquidityDeskOpen");
    if (existing) {
      existing.classList.add("cigo-liquidity-desk-open");
      if (!existing.dataset.cigoLiquidityBound) {
        existing.dataset.cigoLiquidityBound = "1";
        existing.addEventListener("click", showModal);
      }
      return;
    }

    if (document.querySelector(".cigo-liquidity-desk-open")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cigo-liquidity-desk-open";
    button.textContent = "Large purchase liquidity plan";
    button.addEventListener("click", showModal);

    const target = document.getElementById("walletLimitNote") || document.querySelector("#swap h2") || document.querySelector("h1");
    if (target && target.parentElement) {
      target.insertAdjacentElement("afterend", button);
      return;
    }

    const main = document.querySelector("main");
    if (main) {
      main.insertAdjacentElement("afterbegin", button);
      return;
    }

    document.body.insertAdjacentElement("afterbegin", button);
  }

  function init() {
    addStyle();
    addButton();
    buildModal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
