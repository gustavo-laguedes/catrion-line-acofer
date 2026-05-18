import { pages } from "../../pages/index.js";

export function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.page;
      navigateTo(page);
    });
  });

  document.addEventListener("click", (event) => {
  const routeButton = event.target.closest("[data-route]");

  if (!routeButton) return;

  const page = routeButton.dataset.route;
  navigateTo(page);
});
  
}

export function navigateTo(pageKey) {
  const page = pages[pageKey] || pages.dashboard;

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageKey);
  });

  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${page.title}</h1>
      <p>${page.subtitle}</p>
    </div>

    ${page.render()}
  `;

  if (typeof page.afterRender === "function") {
  page.afterRender();
}

}