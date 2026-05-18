import { setupSidebar } from "./shared/layout/sidebar.js";
import { setupNavigation, navigateTo } from "./shared/router/router.js";

document.addEventListener("DOMContentLoaded", () => {
  setupSidebar();
  setupNavigation();
  navigateTo("dashboard");
});