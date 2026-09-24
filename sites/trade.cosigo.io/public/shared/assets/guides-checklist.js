(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function loadDone(key) {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    } catch (_) {
      return new Set();
    }
  }

  function saveDone(key, done) {
    localStorage.setItem(key, JSON.stringify(Array.from(done)));
  }

  function firstOpen(rows, done) {
    const row = rows.find((item) => !done.has(item.getAttribute('data-guide-step')));
    return row ? row.getAttribute('data-guide-step') : '';
  }

  function refresh(card) {
    const key = 'cosigoGuideDone:' + (card.getAttribute('data-guide-key') || 'main');
    const done = loadDone(key);
    const rows = Array.from(card.querySelectorAll('[data-guide-step]'));
    const next = firstOpen(rows, done);

    rows.forEach((row) => {
      const step = row.getAttribute('data-guide-step');
      const isDone = done.has(step);

      row.classList.toggle('is-done', isDone);
      row.classList.toggle('is-next', !isDone && step === next);

      const btn = row.querySelector('.guide-done');
      if (btn) {
        btn.textContent = isDone ? 'done' : 'mark done';
        btn.setAttribute('aria-pressed', isDone ? 'true' : 'false');
      }
    });
  }

  ready(() => {
    document.querySelectorAll('.guide-checklist').forEach((card) => {
      const key = 'cosigoGuideDone:' + (card.getAttribute('data-guide-key') || 'main');

      card.addEventListener('click', (ev) => {
        const doneBtn = ev.target.closest('.guide-done');
        const resetBtn = ev.target.closest('.guide-reset');
        const done = loadDone(key);

        if (doneBtn) {
          const row = doneBtn.closest('[data-guide-step]');
          if (!row) return;

          const step = row.getAttribute('data-guide-step');
          if (done.has(step)) done.delete(step);
          else done.add(step);

          saveDone(key, done);
          refresh(card);
        }

        if (resetBtn) {
          done.clear();
          saveDone(key, done);
          refresh(card);
        }
      });

      refresh(card);
    });
  });
})();
