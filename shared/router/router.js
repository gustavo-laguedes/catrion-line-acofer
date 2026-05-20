import { pages } from "../../pages/index.js?v=purchase-neon";

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

export async function navigateTo(pageKey) {
  const page = pages[pageKey] || pages.dashboard;

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageKey);
  });

  const content = document.getElementById("appContent");

  content.innerHTML = renderLinePageLoader(page);

  await new Promise((resolve) => setTimeout(resolve, 120));

  content.innerHTML = `
    <div class="page-header">
      <h1>${page.title}</h1>
      <p>${page.subtitle}</p>
    </div>

    ${page.render()}
  `;

  if (typeof page.afterRender === "function") {
    await page.afterRender({ navigation: true });
  }

}

function renderLinePageLoader(page) {
  return `
    <div class="line-page-loader">
      <div class="line-loader-mark">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <strong>Line</strong>
      <small>${page.title || "Carregando"}</small>
    </div>
  `;
}
