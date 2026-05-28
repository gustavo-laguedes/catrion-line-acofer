import { setupSidebar } from "./shared/layout/sidebar.js?v=purchase-neon";
import { setupNavigation, navigateTo } from "./shared/router/router.js?v=expedition-api";

document.addEventListener("DOMContentLoaded", () => {
  setupSidebar();
  setupNavigation();
  navigateTo("dashboard");
});
