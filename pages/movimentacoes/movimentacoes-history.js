import { getMovementBadgeClass } from "./movimentacoes-config.js";

export function renderMovementHistory({
  activeMovementTab,
  getActiveTab,
  movementHistoryFilters,
  getMovementsByType,
  applyMovementHistoryFilters,
  renderMovementHistoryFilters,
  renderMovementHistoryList,
  renderEmptyHistory
}) {
  const movements = applyMovementHistoryFilters(
    getMovementsByType(activeMovementTab)
  );

  return `
    <div class="movement-form-header">
      <div>
        <h2>Registros</h2>
        <p>Histórico de ${getActiveTab().label.toLowerCase()}.</p>
      </div>
    </div>

    ${renderMovementHistoryFilters(movementHistoryFilters, activeMovementTab)}

    ${
      movements.length
        ? renderMovementHistoryList(movements)
        : renderEmptyHistory()
    }
  `;
}

export function renderMovementHistoryFilters(filters, activeMovementTab) {
  const searchPlaceholder =
    activeMovementTab === "SALE"
      ? "Digite sua busca..."
      : "Digite sua busca...";

  return `
    <div class="movement-history-filters">
      <label>
        Buscar
        <input id="movementHistorySearch" type="text" placeholder="${searchPlaceholder}" value="${filters.search}" />
      </label>

      <label>
        Data
        <input id="movementHistoryDate" type="date" value="${filters.date}" />
      </label>

      <label>
        Status
        <select id="movementHistoryStatus">
          ${["Todos", "Processado", "Cancelado", "Reprocessado"]
            .map((status) => `
              <option value="${status}" ${filters.status === status ? "selected" : ""}>
                ${status}
              </option>
            `)
            .join("")}
        </select>
      </label>
    </div>
  `;
}

export function applyMovementHistoryFilters(movements, filters) {
  const search = filters.search.trim().toLowerCase();

  return movements.filter((movement) => {
    const movementText = [
      movement.typeLabel,
      movement.fiscalNumber,
      movement.supplierName,
      movement.locationName,
      movement.originLocation,
      movement.destinationLocation,
      movement.reason,
      movement.observation,
      movement.status
    ].join(" ").toLowerCase();

    return (
      (!search || movementText.includes(search)) &&
      (!filters.date || movement.movementDate === filters.date) &&
      (filters.status === "Todos" || movement.status === filters.status)
    );
  });
}

export function renderMovementHistoryList({
  movements,
  getMovementItems,
  renderMovementInfo,
  formatMovementHistoryDate,
  getMovementCardStatusClass,
  getMovementStatusClass
}) {
  return `
    <div class="movement-history-list">
      ${movements.map((movement) => {
        const items = getMovementItems(movement.id);

        return `
          <button class="movement-history-item ${getMovementCardStatusClass(movement)}" data-open-movement="${movement.id}" type="button">
            <div class="movement-history-main">
              <span class="badge ${getMovementBadgeClass(movement.type)}">
                ${movement.typeLabel}
              </span>

              <strong>${formatMovementHistoryDate(movement)}</strong>

              ${
                movement.type !== "PURCHASE"
                  ? `<small>${movement.sourceLabel}</small>`
                  : ""
              }
            </div>

            <div class="movement-history-info">
              ${renderMovementInfo(movement)}
              <span>${items.length} item(ns)</span>

              <div class="movement-history-actions">
  ${
    movement.attachmentName
      ? `<span class="movement-attachment-pill" data-open-attachment="${movement.id}" title="${movement.attachmentName}">PDF</span>`
      : ""
  }

  <span class="movement-status-pill ${getMovementStatusClass(movement.status)}">
    ${movement.status}
  </span>
</div>
            </div>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

export function renderMovementInfo(movement) {
  if (movement.type === "TRANSFER") {
    return `<span>${movement.originLocation || "-"} → ${movement.destinationLocation || "-"}</span>`;
  }

  if (movement.type === "PURCHASE") {
    return `
      <span>NF: ${movement.fiscalNumber || "-"}</span>
      <span>Fornecedor: ${movement.supplierName || "-"}</span>
    `;
  }

  if (movement.type === "SALE") {
  return `
    <span>Baixa: ${movement.stockExitModeLabel || "-"}</span>
  `;
}

if (movement.type === "RETURN") {
  return `
    <span>Forma: ${movement.stockExitModeLabel || "-"}</span>
  `;
}

  if (movement.type === "ADJUSTMENT") {
    return `<span>Motivo: ${movement.reason || "-"}</span>`;
  }

  if (movement.locationName) {
    return `<span>${movement.locationName}</span>`;
  }

  return `<span>-</span>`;
}

export function renderEmptyHistory() {
  return `
    <div class="empty-state small-empty">
      <div class="empty-icon">🔁</div>
      <h3>Nenhum registro encontrado</h3>
      <p>Os registros desta aba aparecerão aqui depois do lançamento.</p>
    </div>
  `;
}