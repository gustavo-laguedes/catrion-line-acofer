export function renderSimplePage(title, items) {
  const rows = items.map((item) => `
    <div class="placeholder-row">
      <span>${item}</span>
      <span class="badge">Em breve</span>
    </div>
  `).join("");

  return `
    <div class="section-header">
      <h2>${title}</h2>
      <button class="primary-btn">Adicionar</button>
    </div>

    <div class="card">
      <div class="placeholder-list">
        ${rows}
      </div>
    </div>
  `;
}