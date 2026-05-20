import { apiGet } from "../../shared/api-client.js";

let traceabilityFilters = {
  q: "",
  materialId: "",
  typeId: "",
  locationId: "",
  status: "",
  from: "",
  to: ""
};

let traceabilityResults = [];
let selectedTraceability = null;
let traceabilityLoading = false;
let detailLoading = false;
let traceabilityError = "";
let referencesLoaded = false;
let hasSearchedTraceability = false;
let advancedFiltersOpen = true;

let referenceData = {
  materials: [],
  materialTypes: [],
  locations: []
};

export const rastreabilidadePage = {
  title: "🔎 Rastreabilidade",
  subtitle: "Linha do tempo completa dos lotes, da origem ao destino",
  render: renderRastreabilidade,
  afterRender: setupRastreabilidadeEvents
};

function renderRastreabilidade() {
  return `
    <div class="traceability-shell">
      <div class="card traceability-search-card">
        <div class="traceability-search-header">
          <div>
            <h2>Rastrear lote</h2>
            <p>Busque por lote, codigo ou material e acompanhe a historia industrial completa.</p>
          </div>

          <button id="toggleTraceabilityFilters" class="secondary-btn" type="button">
            ${advancedFiltersOpen ? "Ocultar filtros" : "Filtros avancados"}
          </button>
        </div>

        <div class="traceability-main-search">
          <input
            id="traceabilitySearchInput"
            type="text"
            value="${escapeHtml(traceabilityFilters.q)}"
            placeholder="Digite o lote, codigo ou material"
          />

          <button id="traceabilitySearchBtn" class="primary-btn" type="button">
            Rastrear
          </button>
        </div>

        ${advancedFiltersOpen ? renderAdvancedFilters() : ""}

        ${traceabilityError ? `
          <div class="traceability-alert">
            <strong>Rastreabilidade indisponivel</strong>
            <span>${escapeHtml(traceabilityError)}</span>
          </div>
        ` : ""}
      </div>

      <div class="traceability-layout">
        <div class="card traceability-results-card">
          <div class="table-header">
            <div>
              <h2>Lotes encontrados</h2>
              <p>${getResultsSubtitle()}</p>
            </div>
          </div>

          ${renderResultsPanel()}
        </div>

        <div class="traceability-detail-wrap">
          ${renderDetailPanel()}
        </div>
      </div>
    </div>
  `;
}

function renderAdvancedFilters() {
  return `
    <div class="stock-filters traceability-filters">
      <label>
        Material
        <select id="traceabilityMaterialFilter">
          ${renderSelectOptions(referenceData.materials.map((item) => ({
            value: item.id,
            label: `${item.code ? `${item.code} - ` : ""}${item.name}`
          })), traceabilityFilters.materialId, "Todos")}
        </select>
      </label>

      <label>
        Tipo
        <select id="traceabilityTypeFilter">
          ${renderSelectOptions(referenceData.materialTypes.map((item) => ({
            value: item.id,
            label: item.name
          })), traceabilityFilters.typeId, "Todos")}
        </select>
      </label>

      <label>
        Local
        <select id="traceabilityLocationFilter">
          ${renderSelectOptions(referenceData.locations.map((item) => ({
            value: item.id,
            label: item.name
          })), traceabilityFilters.locationId, "Todos")}
        </select>
      </label>

      <label>
        Status
        <select id="traceabilityStatusFilter">
          ${renderSelectOptions([
            { value: "Disponivel", label: "Disponivel" },
            { value: "Sem saldo", label: "Sem saldo" },
            { value: "Cancelado", label: "Cancelado" },
            { value: "Reprocessado", label: "Reprocessado" }
          ], traceabilityFilters.status, "Todos")}
        </select>
      </label>

      <label>
        Periodo inicial
        <input id="traceabilityFromFilter" type="date" value="${traceabilityFilters.from}" />
      </label>

      <label>
        Periodo final
        <input id="traceabilityToFilter" type="date" value="${traceabilityFilters.to}" />
      </label>
    </div>
  `;
}

function renderResultsPanel() {
  if (traceabilityLoading) {
    return `
      <div class="traceability-loading">
        <div class="traceability-spinner"></div>
        <strong>Buscando lotes rastreaveis...</strong>
      </div>
    `;
  }

  if (!traceabilityResults.length && !hasAnyFilter()) {
    return `
      <div class="empty-state small-empty">
        <div class="empty-icon">🔎</div>
        <h3>Comece por uma busca</h3>
        <p>Informe lote, codigo ou material para abrir a rastreabilidade industrial.</p>
      </div>
    `;
  }

  if (!traceabilityResults.length) {
    return `
      <div class="empty-state small-empty">
        <div class="empty-icon">0</div>
        <h3>Nenhum lote encontrado</h3>
        <p>Ajuste os filtros ou tente buscar pelo codigo exato do lote.</p>
      </div>
    `;
  }

  return `
    <div class="traceability-result-list">
      ${traceabilityResults.map(renderLotResultCard).join("")}
    </div>
  `;
}

function renderLotResultCard(lot) {
  const active = selectedTraceability?.lot?.id === lot.id;

  return `
    <button class="traceability-result-card ${active ? "active" : ""} ${getLotCardClass(lot.status)}" data-traceability-lot-id="${lot.id}" type="button">
      <div class="traceability-result-main">
        <div>
          <strong>${escapeHtml(lot.lotCode || "-")}</strong>
          <span>${escapeHtml(lot.materialName || "-")}</span>
        </div>

        <span class="badge ${getStatusBadgeClass(lot.status)}">${escapeHtml(normalizeStatus(lot.status))}</span>
      </div>

      <div class="traceability-result-meta">
        <span>${escapeHtml(lot.materialType || "Sem tipo")}</span>
        <span>${escapeHtml(lot.currentLocationName || "Sem local atual")}</span>
        <span>${formatNumber(lot.quantity)} ${escapeHtml(lot.unit || "")}</span>
      </div>
    </button>
  `;
}

function renderDetailPanel() {
  if (detailLoading) {
    return `
      <div class="card traceability-detail-card">
        <div class="traceability-loading detail">
          <div class="traceability-spinner"></div>
          <strong>Montando linha do tempo...</strong>
        </div>
      </div>
    `;
  }

  if (!selectedTraceability) {
    return `
      <div class="card traceability-detail-card">
        <div class="empty-state">
          <div class="empty-icon">↔</div>
          <h3>Nenhum lote selecionado</h3>
          <p>Selecione um lote na lista para ver origem, saldo, eventos, producoes e derivacoes.</p>
        </div>
      </div>
    `;
  }

  const detail = selectedTraceability;
  const lot = detail.lot || {};
  const balance = detail.currentBalance || {};

  return `
    <div class="card traceability-detail-card ${getLotCardClass(lot.status)}">
      <div class="traceability-lot-hero">
        <div>
          <span class="traceability-kicker">${escapeHtml(lot.originLabel || "Origem nao informada")}</span>
          <h2>${escapeHtml(lot.lotCode || "-")}</h2>
          <p>${escapeHtml(lot.materialName || "-")} · ${escapeHtml(lot.materialType || "Sem tipo")}</p>
        </div>

        <span class="badge ${getStatusBadgeClass(lot.status)}">${escapeHtml(normalizeStatus(lot.status))}</span>
      </div>

      ${renderLotMetrics(detail, balance)}

      ${lot.notes ? `
        <div class="movement-detail-note">
          <strong>Observacoes:</strong> ${escapeHtml(lot.notes)}
        </div>
      ` : ""}

      ${renderTimeline(detail.timeline || [])}
      ${renderRelations(detail.parents || [], detail.children || [])}
      ${renderProductions(detail.productionsAsInput || [], detail.productionsAsOutput || [])}
      ${renderMovements(detail.movements || [])}
    </div>
  `;
}

function renderLotMetrics(detail, balance) {
  const lot = detail.lot || {};
  const location = detail.location || {};

  return `
    <div class="movement-detail-grid traceability-metrics">
      <div>
        <small>Saldo principal</small>
        <strong>${formatNumber(balance.quantity)} ${escapeHtml(balance.unit || lot.unit || "")}</strong>
      </div>

      <div>
        <small>Saldo secundario</small>
        <strong>${balance.secondaryUnit || lot.secondaryUnit ? `${formatNumber(balance.secondaryQuantity)} ${escapeHtml(balance.secondaryUnit || lot.secondaryUnit || "")}` : "-"}</strong>
      </div>

      <div>
        <small>Local atual</small>
        <strong>${escapeHtml(location.name || lot.currentLocationName || "Sem local")}</strong>
      </div>

      <div>
        <small>Origem</small>
        <strong>${escapeHtml(lot.originLabel || "-")}</strong>
      </div>

      <div>
        <small>Data do lote</small>
        <strong>${formatDate(lot.productionDate || lot.createdAt)}</strong>
      </div>

      <div>
        <small>Atualizado em</small>
        <strong>${formatDateTime(lot.updatedAt || lot.createdAt)}</strong>
      </div>
    </div>
  `;
}

function renderTimeline(timeline) {
  return `
    <div class="movement-detail-section">
      <h3>Linha do tempo</h3>

      ${
        timeline.length
          ? `
            <div class="traceability-timeline">
              ${timeline.map(renderTimelineItem).join("")}
            </div>
          `
          : `
            <div class="production-preview-empty compact-production-empty">
              Nenhum evento registrado para este lote. O cadastro base ainda permanece visivel para auditoria.
            </div>
          `
      }
    </div>
  `;
}

function renderTimelineItem(item) {
  return `
    <div class="traceability-timeline-item ${getTimelineClass(item.type)}">
      <div class="traceability-timeline-marker">
        <span>${escapeHtml(item.icon || "•")}</span>
      </div>

      <div class="traceability-timeline-card">
        <div class="traceability-timeline-head">
          <div>
            <strong>${escapeHtml(item.title || item.type || "Evento")}</strong>
            <span>${formatDateTime(item.date)}</span>
          </div>

          <span class="badge ${getTimelineBadgeClass(item.type)}">${escapeHtml(getTimelineTypeLabel(item.type))}</span>
        </div>

        <p>${escapeHtml(item.description || "")}</p>

        <div class="traceability-timeline-meta">
          ${item.locationName ? `<span>${escapeHtml(item.locationName)}</span>` : ""}
          ${item.quantity ? `<span>${formatSignedNumber(item.quantity)}</span>` : ""}
          ${item.secondaryQuantity ? `<span>Sec.: ${formatSignedNumber(item.secondaryQuantity)}</span>` : ""}
          ${item.status ? `<span>${escapeHtml(normalizeStatus(item.status))}</span>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderRelations(parents, children) {
  return `
    <div class="movement-detail-section">
      <h3>Relacoes entre lotes</h3>

      <div class="traceability-relations-grid">
        ${renderRelationGroup("Lotes pais/origem", parents)}
        ${renderRelationGroup("Lotes filhos/derivados", children)}
      </div>
    </div>
  `;
}

function renderRelationGroup(title, lots) {
  return `
    <div class="traceability-relation-group">
      <div class="traceability-section-title">
        <strong>${title}</strong>
        <span>${lots.length} lote(s)</span>
      </div>

      ${
        lots.length
          ? lots.map((lot) => `
              <button class="traceability-relation-lot" data-traceability-lot-id="${lot.lotId}" type="button">
                <div>
                  <strong>${escapeHtml(lot.lotCode || "-")}</strong>
                  <span>${escapeHtml(lot.materialName || "-")}</span>
                </div>
                <span class="badge ${getStatusBadgeClass(lot.status)}">${escapeHtml(normalizeStatus(lot.status))}</span>
              </button>
            `).join("")
          : `<div class="production-preview-empty compact-production-empty">Nenhum vinculo registrado.</div>`
      }
    </div>
  `;
}

function renderProductions(asInput, asOutput) {
  const productions = [
    ...asOutput.map((item) => ({ ...item, label: "Gerou este lote" })),
    ...asInput.map((item) => ({ ...item, label: "Consumiu este lote" }))
  ];

  return `
    <div class="movement-detail-section">
      <h3>Producao relacionada</h3>

      ${
        productions.length
          ? `
            <div class="traceability-production-list">
              ${productions.map(renderProductionCard).join("")}
            </div>
          `
          : `<div class="production-preview-empty compact-production-empty">Nenhuma producao relacionada.</div>`
      }
    </div>
  `;
}

function renderProductionCard(production) {
  return `
    <div class="traceability-production-card">
      <div class="traceability-production-head">
        <div>
          <strong>${escapeHtml(production.label)}</strong>
          <span>${formatDate(production.productionDate)} · ${escapeHtml(production.outputMaterialName || "-")}</span>
        </div>

        <span class="badge ${getStatusBadgeClass(production.status)}">${escapeHtml(normalizeStatus(production.status))}</span>
      </div>

      <div class="traceability-production-meta">
        <span>Maquina: <strong>${escapeHtml(production.machineName || "-")}</strong></span>
        <span>Operadores: <strong>${escapeHtml(production.operatorNames || "-")}</strong></span>
        <span>Local: <strong>${escapeHtml(production.locationName || "-")}</strong></span>
        <span>Qtd.: <strong>${formatNumber(production.quantity)} ${escapeHtml(production.unit || "")}</strong></span>
      </div>
    </div>
  `;
}

function renderMovements(movements) {
  return `
    <div class="movement-detail-section">
      <h3>Movimentacoes relacionadas</h3>

      ${
        movements.length
          ? `
            <div class="data-table-wrap">
              <table class="data-table traceability-movements-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Documento</th>
                    <th>Local</th>
                    <th>Quantidade</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${movements.map((movement) => `
                    <tr>
                      <td>${formatDateTime(movement.movementDate)}</td>
                      <td><strong>${escapeHtml(movement.typeLabel || movement.movementType || "-")}</strong></td>
                      <td>${escapeHtml(movement.documentNumber || "-")}</td>
                      <td>${escapeHtml(movement.locationName || "-")}</td>
                      <td>${formatNumber(movement.quantity)} ${escapeHtml(movement.unit || "")}</td>
                      <td><span class="badge ${getStatusBadgeClass(movement.status)}">${escapeHtml(normalizeStatus(movement.status))}</span></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `<div class="production-preview-empty compact-production-empty">Nenhuma movimentacao relacionada.</div>`
      }
    </div>
  `;
}

function setupRastreabilidadeEvents(options = {}) {
  const loadPromise = loadTraceabilityReferences(Boolean(options.navigation));

  document.getElementById("traceabilitySearchInput")?.addEventListener("input", (event) => {
    traceabilityFilters.q = event.target.value;
  });

  document.getElementById("traceabilitySearchInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runTraceabilitySearch();
  });

  document.getElementById("traceabilitySearchBtn")?.addEventListener("click", runTraceabilitySearch);

  document.getElementById("toggleTraceabilityFilters")?.addEventListener("click", () => {
    advancedFiltersOpen = !advancedFiltersOpen;
    refreshTraceabilityPage();
  });

  bindFilter("traceabilityMaterialFilter", "materialId");
  bindFilter("traceabilityTypeFilter", "typeId");
  bindFilter("traceabilityLocationFilter", "locationId");
  bindFilter("traceabilityStatusFilter", "status");
  bindFilter("traceabilityFromFilter", "from");
  bindFilter("traceabilityToFilter", "to");

  document.querySelectorAll("[data-traceability-lot-id]").forEach((button) => {
    button.addEventListener("click", () => loadTraceabilityDetail(button.dataset.traceabilityLotId));
  });

  if (!hasSearchedTraceability && !traceabilityResults.length && !traceabilityLoading && !traceabilityError) {
    runTraceabilitySearch();
  }

  return loadPromise;
}

function bindFilter(id, field) {
  document.getElementById(id)?.addEventListener("change", (event) => {
    traceabilityFilters[field] = event.target.value;
    runTraceabilitySearch();
  });
}

async function loadTraceabilityReferences(force = false) {
  if (referencesLoaded && !force) return;

  referencesLoaded = true;

  try {
    const [materials, materialTypes, locations] = await Promise.all([
      apiGet("/api/materials"),
      apiGet("/api/material-types"),
      apiGet("/api/locations")
    ]);

    referenceData = {
      materials: Array.isArray(materials) ? materials.filter((item) => item.status !== "Inativo") : [],
      materialTypes: Array.isArray(materialTypes) ? materialTypes.filter((item) => item.status !== "Inativo") : [],
      locations: Array.isArray(locations) ? locations.filter((item) => item.status !== "Inativo") : []
    };

    refreshTraceabilityPage();
  } catch (error) {
    traceabilityError = "Nao foi possivel carregar materiais, tipos e locais para os filtros.";
    refreshTraceabilityPage();
  }
}

async function runTraceabilitySearch() {
  hasSearchedTraceability = true;
  traceabilityLoading = true;
  traceabilityError = "";
  refreshTraceabilityPage();

  try {
    const params = new URLSearchParams();

    Object.entries(traceabilityFilters).forEach(([key, value]) => {
      if (String(value || "").trim()) params.set(key, value);
    });

    traceabilityResults = await apiGet(`/api/traceability/search?${params.toString()}`);

    if (
      traceabilityResults.length === 1 &&
      (!selectedTraceability || selectedTraceability.lot?.id !== traceabilityResults[0].id)
    ) {
      await loadTraceabilityDetail(traceabilityResults[0].id, false);
      return;
    }

    if (
      selectedTraceability &&
      !traceabilityResults.some((lot) => lot.id === selectedTraceability.lot?.id)
    ) {
      selectedTraceability = null;
    }
  } catch (error) {
    traceabilityResults = [];
    selectedTraceability = null;
    traceabilityError = error?.data?.error || error?.message || "Erro ao buscar lotes.";
  } finally {
    traceabilityLoading = false;
    refreshTraceabilityPage();
  }
}

async function loadTraceabilityDetail(lotId, shouldRefreshLoading = true) {
  detailLoading = true;
  traceabilityError = "";
  if (shouldRefreshLoading) refreshTraceabilityPage();

  try {
    selectedTraceability = await apiGet(`/api/traceability/lots/${lotId}`);
  } catch (error) {
    selectedTraceability = null;
    traceabilityError = error?.data?.error || error?.message || "Nao foi possivel carregar o lote.";
  } finally {
    detailLoading = false;
    refreshTraceabilityPage();
  }
}

function refreshTraceabilityPage() {
  const content = document.getElementById("appContent");
  if (!content) return;

  content.innerHTML = `
    <div class="page-header">
      <h1>${rastreabilidadePage.title}</h1>
      <p>${rastreabilidadePage.subtitle}</p>
    </div>

    ${renderRastreabilidade()}
  `;

  setupRastreabilidadeEvents();
}

function renderSelectOptions(options, selectedValue, emptyLabel) {
  return `
    <option value="">${emptyLabel}</option>
    ${options.map((option) => `
      <option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>
        ${escapeHtml(option.label)}
      </option>
    `).join("")}
  `;
}

function getResultsSubtitle() {
  if (traceabilityLoading) return "Consultando historico industrial...";
  if (!traceabilityResults.length) return "Nenhum lote carregado.";
  return `${traceabilityResults.length} lote(s) com historico rastreavel.`;
}

function hasAnyFilter() {
  return Object.values(traceabilityFilters).some((value) => String(value || "").trim());
}

function normalizeStatus(status) {
  return status || "Sem status";
}

function getStatusBadgeClass(status = "") {
  const normalized = status.toLowerCase();
  if (normalized.includes("cancel")) return "badge-danger";
  if (normalized.includes("sem saldo")) return "badge-warning";
  if (normalized.includes("reprocess")) return "badge-info";
  if (normalized.includes("dispon") || normalized.includes("process")) return "badge-success";
  return "badge-info";
}

function getLotCardClass(status = "") {
  const normalized = status.toLowerCase();
  if (normalized.includes("cancel")) return "is-canceled";
  if (normalized.includes("reprocess")) return "is-reprocessed";
  return "";
}

function getTimelineBadgeClass(type = "") {
  if (type.includes("CANCEL")) return "badge-danger";
  if (type.includes("REPROCESS")) return "badge-info";
  if (type.includes("CONSUMED")) return "badge-warning";
  if (type.includes("OUTPUT") || type.includes("PURCHASE")) return "badge-success";
  return "badge-info";
}

function getTimelineClass(type = "") {
  if (type.includes("CANCEL")) return "danger";
  if (type.includes("REPROCESS")) return "info";
  if (type.includes("CONSUMED")) return "warning";
  return "success";
}

function getTimelineTypeLabel(type = "") {
  const labels = {
    LOT_CREATED: "Criacao",
    PURCHASE_IN: "Compra",
    PRODUCTION_CONSUMED: "Consumo",
    PRODUCTION_OUTPUT: "Producao",
    PRODUCTION_CANCEL: "Cancelamento",
    PRODUCTION_REPROCESS: "Reprocessamento",
    STOCK_MOVEMENT: "Movimentacao",
    LINK_PARENT: "Pai",
    LINK_CHILD: "Filho"
  };

  return labels[type] || type || "Evento";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function formatSignedNumber(value) {
  const number = Number(value || 0);
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${formatNumber(number)}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  })}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
