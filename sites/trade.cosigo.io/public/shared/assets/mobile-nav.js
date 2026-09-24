(() => {
  function closeAll() {
    document.querySelectorAll('.topbar-inner.nav-open').forEach((el) => {
      el.classList.remove('nav-open');
    });

    document.querySelectorAll('.nav-toggle[aria-expanded="true"]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', (ev) => {
    const toggle = ev.target.closest('.nav-toggle');

    if (toggle) {
      const inner = toggle.closest('.topbar-inner');
      if (!inner) return;

      const open = inner.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    if (ev.target.closest('.topbar .nav a')) {
      closeAll();
      return;
    }

    if (!ev.target.closest('.topbar')) {
      closeAll();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeAll();
  });
})();
