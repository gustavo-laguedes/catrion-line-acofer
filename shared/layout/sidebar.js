export function setupSidebar() {
  const sidebar = document.getElementById("sidebar");
  const pinBtn = document.getElementById("pinSidebarBtn");

  const isPinned = localStorage.getItem("line_sidebar_pinned") === "true";

  if (isPinned) {
    sidebar.classList.add("pinned");
  }

  pinBtn.addEventListener("click", () => {
    sidebar.classList.add("is-animating");

    sidebar.classList.toggle("pinned");
    localStorage.setItem("line_sidebar_pinned", sidebar.classList.contains("pinned"));

    setTimeout(() => {
      sidebar.classList.remove("is-animating");
    }, 320);
  });
}