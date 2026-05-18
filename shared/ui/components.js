export function metricCard({ title, value, hint }) {
  return `
    <div class="card metric-card">
      <h3>${title}</h3>
      <div class="metric">${value}</div>
      <div class="hint">${hint}</div>
    </div>
  `;
}

export function badge(text, variant = "default") {
  return `<span class="badge badge-${variant}">${text}</span>`;
}

export function emptyState({ title, description, actionLabel = "" }) {
  return `
    <div class="empty-state">
      <div class="empty-icon">⌁</div>
      <h3>${title}</h3>
      <p>${description}</p>
      ${actionLabel ? `<button class="primary-btn">${actionLabel}</button>` : ""}
    </div>
  `;
}

export function placeholderRow({ text, status = "Em breve" }) {
  return `
    <div class="placeholder-row">
      <span>${text}</span>
      ${badge(status)}
    </div>
  `;
}

export function sectionHeader({ title, actionLabel = "" }) {
  return `
    <div class="section-header">
      <h2>${title}</h2>
      ${actionLabel ? `<button class="primary-btn">${actionLabel}</button>` : ""}
    </div>
  `;
}