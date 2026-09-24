(() => {
  const ready = (fn) => {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  };

  ready(() => {
    const menuButton = document.querySelector(".labels-mobile-menu-toggle");
    const menuNav = document.querySelector(".labels-mobile-nav");

    if (!menuButton || !menuNav) return;

    const closeMenu = () => {
      menuNav.classList.remove("is-open");
      menuButton.setAttribute("aria-expanded", "false");
    };

    menuButton.addEventListener("click", () => {
      const open = menuNav.classList.toggle("is-open");
      menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    });

    menuNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!menuNav.classList.contains("is-open")) return;
      if (menuButton.contains(event.target) || menuNav.contains(event.target)) return;
      closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  });
})();
