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
let traceabilityTreeResizeHandlerBound = false;

let referenceData = {
  materials: [],
  materialTypes: [],
  locations: []
};

export const rastreabilidadePage = {
  title: "Rastreabilidade",
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
            <p>Busque por lote, código ou material e acompanhe a história industrial completa.</p>
          </div>

          <div class="traceability-header-actions">
            <button id="clearTraceabilityFilters" class="secondary-btn" type="button">
              Limpar filtros
            </button>

            <button id="toggleTraceabilityFilters" class="secondary-btn" type="button">
              ${advancedFiltersOpen ? "Ocultar filtros" : "Filtros avançados"}
            </button>
          </div>
        </div>

        <div class="traceability-main-search">
          <input
            id="traceabilitySearchInput"
            type="text"
            value="${escapeHtml(traceabilityFilters.q)}"
            placeholder="Digite o lote, código ou material"
          />

          <button id="traceabilitySearchBtn" class="primary-btn" type="button">
            Rastrear
          </button>
        </div>

        ${advancedFiltersOpen ? renderAdvancedFilters() : ""}

        ${traceabilityError ? `
          <div class="traceability-alert">
            <strong>Rastreabilidade indisponível</strong>
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
          ${renderDetailPanelV2()}
        </div>
      </div>

      ${renderTreePanel()}
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
            { value: "Disponivel", label: "Disponível" },
            { value: "Sem saldo", label: "Sem saldo" },
            { value: "Cancelado", label: "Cancelado" },
            { value: "Reprocessado", label: "Reprocessado" }
          ], traceabilityFilters.status, "Todos")}
        </select>
      </label>

      <label>
        Período inicial
        <input id="traceabilityFromFilter" type="date" value="${traceabilityFilters.from}" />
      </label>

      <label>
        Período final
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
        <div class="empty-icon">R</div>
        <h3>Comece por uma busca</h3>
        <p>Informe lote, código ou material para abrir a rastreabilidade industrial.</p>
      </div>
    `;
  }

  if (!traceabilityResults.length) {
    return `
      <div class="empty-state small-empty">
        <div class="empty-icon">0</div>
        <h3>Nenhum lote encontrado</h3>
        <p>Ajuste os filtros ou tente buscar pelo código exato do lote.</p>
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
          <span class="traceability-kicker">${escapeHtml(lot.originLabel || "Origem não informada")}</span>
          <h2>${escapeHtml(lot.lotCode || "-")}</h2>
          <p>${escapeHtml(lot.materialName || "-")} · ${escapeHtml(lot.materialType || "Sem tipo")}</p>
        </div>

        <span class="badge ${getStatusBadgeClass(lot.status)}">${escapeHtml(normalizeStatus(lot.status))}</span>
      </div>

      ${renderLotMetrics(detail, balance)}

      ${lot.notes ? `
        <div class="movement-detail-note">
          <strong>Observações:</strong> ${escapeHtml(lot.notes)}
        </div>
      ` : ""}

      ${renderTimeline(detail.timeline || [])}
      ${renderRelations(detail.parents || [], detail.children || [])}
      ${renderProductions(detail.productionsAsInput || [], detail.productionsAsOutput || [])}
      ${renderMovements(detail.movements || [])}
      ${renderIndustrialTree(detail)}
    </div>
  `;
}

function renderDetailPanelV2() {
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
          <div class="empty-icon">R</div>
          <h3>Nenhum lote selecionado</h3>
          <p>Selecione um lote na lista para ver origem, consumo, eventos, produções e derivações.</p>
        </div>
      </div>
    `;
  }

  const detail = selectedTraceability;
  const lot = detail.lot || {};
  const balance = detail.currentBalance || {};

  return `
    <div class="traceability-detail-stack">
      <div class="card traceability-detail-card traceability-detail-block ${getLotCardClass(lot.status)}">
        <div class="traceability-lot-hero">
          <div>
            <span class="traceability-kicker">${escapeHtml(lot.originLabel || "Origem não informada")}</span>
            <h2>${escapeHtml(lot.lotCode || "-")}</h2>
            <p>${escapeHtml(lot.materialName || "-")} · ${escapeHtml(lot.materialType || "Sem tipo")}</p>
          </div>

          <span class="badge ${getStatusBadgeClass(lot.status)}">${escapeHtml(normalizeStatus(lot.status))}</span>
        </div>

        ${renderLotMetrics(detail, balance)}
        ${renderLaboratoryCertificates(detail.laboratoryCertificates || [])}

        ${lot.notes ? `
          <div class="movement-detail-note">
            <strong>Observações:</strong> ${escapeHtml(lot.notes)}
          </div>
        ` : ""}

        ${renderTimeline(detail.timeline || [])}
      </div>

      <div class="card traceability-detail-card traceability-detail-block">
        ${renderProductions(detail.productionsAsInput || [], detail.productionsAsOutput || [])}
        ${renderMovements(detail.movements || [])}
      </div>
    </div>
  `;
}

function renderTreePanel() {
  if (detailLoading || !selectedTraceability) return "";
  return renderIndustrialTree(selectedTraceability);
}

function renderLotMetrics(detail, balance) {
  const lot = detail.lot || {};
  const location = detail.location || {};
  const consumed = getTotalConsumed(detail.productionsAsInput || []);
  const primaryUnit = consumed.unit || balance.unit || lot.unit || "";
  const secondaryUnit = consumed.secondaryUnit || balance.secondaryUnit || lot.secondaryUnit || "";

  return `
    <div class="movement-detail-grid traceability-metrics">
      <div>
        <small>Total consumido principal</small>
        <strong>${formatNumber(consumed.quantity)} ${escapeHtml(primaryUnit)}</strong>
      </div>

      <div>
        <small>Total consumido secundario</small>
        <strong>${secondaryUnit ? `${formatNumber(consumed.secondaryQuantity)} ${escapeHtml(secondaryUnit)}` : "-"}</strong>
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

function renderLaboratoryCertificates(certificates) {
  return `
    <div class="movement-detail-section">
      <h3>Certificados laboratoriais</h3>
      ${
        certificates.length
          ? `
            <div class="traceability-certificates-list">
              ${certificates.map((certificate) => `
                <div class="traceability-certificate-item">
                  <div>
                    <strong>${escapeHtml(certificate.certificateCode || "-")}</strong>
                    <span>${escapeHtml(certificate.certificateFileName || "Certificado sem arquivo")}</span>
                  </div>
                  <span>${formatDate(certificate.testDate)}</span>
                  <span class="badge ${getStatusBadgeClass(certificate.status)}">${escapeHtml(normalizeStatus(certificate.status))}</span>
                </div>
              `).join("")}
            </div>
          `
          : `<div class="production-preview-empty compact-production-empty">Nenhum certificado laboratorial direto registrado para este lote.</div>`
      }
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
              ${timeline.map((item, index) => renderTimelineItem({ ...item, icon: `#${index + 1}` }, index)).join("")}
            </div>
          `
          : `
            <div class="production-preview-empty compact-production-empty">
              Nenhum evento registrado para este lote. O cadastro base ainda permanece visível para auditoria.
            </div>
          `
      }
    </div>
  `;
}

function renderTimelineItem(item, index) {
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
          ${item.quantity ? `<span>${formatSignedQuantity(item.quantity, item.unit)}</span>` : ""}
          ${item.secondaryQuantity ? `<span>Sec.: ${formatSignedQuantity(item.secondaryQuantity, item.secondaryUnit)}</span>` : ""}
          ${item.status ? `<span>${escapeHtml(normalizeStatus(item.status))}</span>` : ""}
        </div>

        ${renderTimelineChildLots(item.childLots || [])}
      </div>
    </div>
  `;
}

function renderTimelineChildLots(childLots) {
  if (!childLots.length) return "";

  return `
    <div class="traceability-timeline-lots">
      ${childLots.map((lot) => `
        <button class="traceability-timeline-lot" data-traceability-lot-id="${lot.lotId}" type="button">
          <strong>${escapeHtml(lot.lotCode || "-")}</strong>
          <span>${formatQuantityWithSecondary(lot.quantity, lot.unit, lot.secondaryQuantity, lot.secondaryUnit)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderRelations(parents, children) {
  return `
    <div class="movement-detail-section">
      <h3>Relações entre lotes</h3>

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
          : `<div class="production-preview-empty compact-production-empty">Nenhum vínculo registrado.</div>`
      }
    </div>
  `;
}

function renderIndustrialTree(detail) {
  const lot = detail.lot || {};
  const tree = detail.industrialTree || {};
  const levels = Array.isArray(tree.levels) && tree.levels.length
    ? tree.levels
    : buildFallbackTreeLevels(detail, lot);
  const flowColumns = levels.map((level) => ({
    type: level.type === "ancestor" ? "origin" : level.type === "descendant" ? "derived" : "current",
    title: level.title,
    count: level.count,
    countLabel: level.countLabel,
    lots: Array.isArray(level.lots) ? level.lots : [],
    depth: level.depth || 0
  }));
  const totalLots = flowColumns.reduce((total, column) => total + column.lots.length, 0);
  const edges = normalizeIndustrialTreeEdges(tree.edges || []);
  const treeSizeClass = flowColumns.length <= 2 && totalLots <= 3
    ? " roomy"
    : flowColumns.length <= 3 && totalLots <= 6
      ? " spacious"
      : flowColumns.length >= 4
      ? " dense"
      : "";

  return `
    <div class="card traceability-tree-card">
      <h3>Árvore industrial do lote</h3>

      <div class="traceability-tree-scroll">
        <div class="traceability-tree-stage">
          <svg class="traceability-tree-edges" aria-hidden="true"></svg>
          <div
            class="traceability-tree${treeSizeClass}"
            data-tree-edges="${escapeHtml(JSON.stringify(edges))}"
            style="--tree-columns: ${flowColumns.length}; --tree-lots: ${totalLots}"
          >
            ${flowColumns.map((column) => renderIndustrialTreeColumn(column)).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderIndustrialTreeColumn(column) {
  const countLabel = column.countLabel || `${column.count || 0} lote(s)`;
  const depth = column.depth || 0;
  const absoluteDepth = Math.abs(depth);
  const depthClass = absoluteDepth >= 3 ? " deep" : absoluteDepth >= 2 ? " medium" : "";
  const typeClass = `traceability-tree-${column.type}`;

  return `
    <div class="traceability-tree-level ${typeClass}${depthClass}" style="--tree-depth: ${Math.min(absoluteDepth, 4)}">
      <div class="traceability-section-title">
        <strong>${escapeHtml(column.title)}</strong>
        <span>${escapeHtml(countLabel)}</span>
      </div>

      ${column.lots.length
        ? `<div class="traceability-tree-lots">${column.lots.map((item) => renderTreeLotCard(item, column.type === "current")).join("")}</div>`
        : ""}
    </div>
  `;
}

function buildFallbackTreeLevels(detail, lot) {
  const parents = detail.parents || [];
  const children = detail.children || [];
  const derivedLevels = buildDerivedTreeLevels(lot, children);

  return [
    ...(parents.length ? [{
      type: "ancestor",
      title: "Pais/origem",
      count: parents.length,
      depth: 1,
      lots: parents
    }] : []),
    {
      type: "current",
      title: "Lote selecionado",
      countLabel: "Selecionado",
      depth: 0,
      lots: [lot]
    },
    ...derivedLevels.map((level, index) => ({
      type: "descendant",
      title: index === 0 ? "Filhos/derivados" : `Derivados nivel ${index + 1}`,
      count: level.length,
      lots: level,
      depth: index + 1
    }))
  ];
}

function buildDerivedTreeLevels(currentLot, children) {
  if (!children.length) return [];

  const levels = [];
  const visited = new Set([String(currentLot.id || currentLot.lotId || "")].filter(Boolean));
  const hasParentReference = children.some((child) => getTreeParentId(child));

  if (hasParentReference) {
    const byParentId = children.reduce((map, child) => {
      const parentId = getTreeParentId(child);
      if (!parentId) return map;
      const siblings = map.get(parentId) || [];
      siblings.push(child);
      map.set(parentId, siblings);
      return map;
    }, new Map());

    let currentIds = [String(currentLot.id || currentLot.lotId || "")].filter(Boolean);

    while (currentIds.length) {
      const linkedLevel = currentIds.flatMap((id) => byParentId.get(id) || []);
      const levelSource = !levels.length && !linkedLevel.length
        ? children.filter((child) => !getTreeParentId(child))
        : linkedLevel;
      const level = levelSource
        .filter((child) => {
          const childId = getTreeLotId(child);
          if (!childId || visited.has(childId)) return false;
          visited.add(childId);
          return true;
        });

      if (!level.length) break;
      levels.push(level);
      currentIds = level.map(getTreeLotId).filter(Boolean);
    }

    return levels;
  }

  let currentLevel = children;

  while (currentLevel.length) {
    const level = currentLevel.filter((child) => {
      const childId = getTreeLotId(child);
      if (!childId) return true;
      if (visited.has(childId)) return false;
      visited.add(childId);
      return true;
    });

    if (!level.length) break;
    levels.push(level);
    currentLevel = level.flatMap(getNestedTreeChildren);
  }

  return levels;
}

function getNestedTreeChildren(lot) {
  return ["children", "childLots", "derivedLots", "descendants"].flatMap((key) => (
    Array.isArray(lot?.[key]) ? lot[key] : []
  ));
}

function getTreeLotId(lot) {
  const id = lot?.lotId || lot?.id || lot?.childLotId;
  return id ? String(id) : "";
}

function getTreeParentId(lot) {
  const id = lot?.parentLotId || lot?.parentId || lot?.parent_lot_id;
  return id ? String(id) : "";
}

function renderTreeLotCard(lot, isCurrent = false) {
  const lotId = lot.lotId || lot.id;
  return `
    <button class="traceability-tree-lot${isCurrent ? " current" : ""}" data-traceability-lot-id="${escapeHtml(lotId || "")}" data-tree-node-id="${escapeHtml(lotId || "")}" type="button">
      <div>
        <strong>${escapeHtml(lot.lotCode || "-")}</strong>
        <span>${escapeHtml(lot.materialName || "-")}</span>
        ${renderTreeLotQuantities(lot)}
      </div>
      <span class="badge ${getStatusBadgeClass(lot.status)}">${escapeHtml(normalizeStatus(lot.status))}</span>
    </button>
  `;
}

function renderTreeLotQuantities(lot) {
  const hasPrimaryQuantity = lot.quantity !== null && lot.quantity !== undefined && lot.quantity !== "";
  const hasSecondaryQuantity = lot.secondaryQuantity !== null && lot.secondaryQuantity !== undefined && lot.secondaryQuantity !== "";
  if (!hasPrimaryQuantity && !hasSecondaryQuantity) return "";

  return `
    <div class="traceability-tree-qty">
      ${hasPrimaryQuantity ? `
        <span><small>Qtd</small><strong>${formatNumber(lot.quantity)} ${escapeHtml(lot.unit || "")}</strong></span>
      ` : ""}
      ${hasSecondaryQuantity ? `
        <span><small>Peso</small><strong>${formatNumber(lot.secondaryQuantity)} ${escapeHtml(lot.secondaryUnit || "")}</strong></span>
      ` : ""}
    </div>
  `;
}

function renderCurrentTreeLotCard(lot) {
  return renderTreeLotCard(lot, true);
}

function renderProductions(asInput, asOutput) {
  const productions = [
    ...asOutput.map((item) => ({ ...item, label: "Gerou este lote" })),
    ...asInput.map((item) => ({ ...item, label: "Consumiu este lote" }))
  ];

  return `
    <div class="movement-detail-section">
      <h3>Produção relacionada</h3>

      ${
        productions.length
          ? `
            <div class="traceability-production-list">
              ${productions.map(renderProductionCard).join("")}
            </div>
          `
          : `<div class="production-preview-empty compact-production-empty">Nenhuma produção relacionada.</div>`
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
        <span>Máquina: <strong>${escapeHtml(production.machineName || "-")}</strong></span>
        <span>Operadores: <strong>${escapeHtml(production.operatorNames || "-")}</strong></span>
        <span>Local: <strong>${escapeHtml(production.locationName || "-")}</strong></span>
        <span>Qtd.: <strong>${formatNumber(production.quantity)} ${escapeHtml(production.unit || "")}</strong></span>
        ${production.secondaryQuantity ? `<span>Sec.: <strong>${formatNumber(production.secondaryQuantity)} ${escapeHtml(production.secondaryUnit || "")}</strong></span>` : ""}
      </div>
    </div>
  `;
}

function renderMovements(movements) {
  return `
    <div class="movement-detail-section">
      <h3>Movimentações relacionadas</h3>

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
                      <td>
                        ${formatNumber(movement.quantity)} ${escapeHtml(movement.unit || "")}
                        ${movement.secondaryQuantity ? `<small class="traceability-secondary-quantity">Sec.: ${formatNumber(movement.secondaryQuantity)} ${escapeHtml(movement.secondaryUnit || "")}</small>` : ""}
                      </td>
                      <td><span class="badge ${getStatusBadgeClass(movement.status)}">${escapeHtml(normalizeStatus(movement.status))}</span></td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `<div class="production-preview-empty compact-production-empty">Nenhuma movimentação relacionada.</div>`
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

  document.getElementById("clearTraceabilityFilters")?.addEventListener("click", clearTraceabilityFilters);

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

  bindTraceabilityTreeResizeHandler();
  drawTraceabilityTreeEdges();

  return loadPromise;
}

function bindFilter(id, field) {
  document.getElementById(id)?.addEventListener("change", (event) => {
    traceabilityFilters[field] = event.target.value;
    runTraceabilitySearch();
  });
}

function clearTraceabilityFilters() {
  traceabilityFilters = {
    q: "",
    materialId: "",
    typeId: "",
    locationId: "",
    status: "",
    from: "",
    to: ""
  };

  runTraceabilitySearch();
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
    traceabilityError = "Não foi possível carregar materiais, tipos e locais para os filtros.";
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
    traceabilityError = error?.data?.error || error?.message || "Não foi possível carregar o lote.";
  } finally {
    detailLoading = false;
    refreshTraceabilityPage();
    centerSelectedTraceabilityTreeLot();
  }
}

function centerSelectedTraceabilityTreeLot() {
  window.requestAnimationFrame(() => {
    const currentLot = document.querySelector(".traceability-tree-lot.current");
    const treeScroll = document.querySelector(".traceability-tree-scroll");
    if (!currentLot || !treeScroll) return;

    const lotBox = currentLot.getBoundingClientRect();
    const scrollBox = treeScroll.getBoundingClientRect();
    const offset = lotBox.left - scrollBox.left - (scrollBox.width / 2) + (lotBox.width / 2);
    treeScroll.scrollLeft += offset;
  });
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

function normalizeIndustrialTreeEdges(edges) {
  const seen = new Set();

  return edges
    .map((edge) => ({
      id: edge.id || `${edge.fromLotId || edge.parentLotId}-${edge.toLotId || edge.childLotId}-${edge.productionId || ""}`,
      fromLotId: String(edge.fromLotId || edge.parentLotId || ""),
      toLotId: String(edge.toLotId || edge.childLotId || ""),
      productionId: edge.productionId || ""
    }))
    .filter((edge) => {
      if (!edge.fromLotId || !edge.toLotId) return false;
      const key = `${edge.fromLotId}:${edge.toLotId}:${edge.productionId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function bindTraceabilityTreeResizeHandler() {
  if (traceabilityTreeResizeHandlerBound) return;
  traceabilityTreeResizeHandlerBound = true;
  window.addEventListener("resize", () => drawTraceabilityTreeEdges());
}

function drawTraceabilityTreeEdges() {
  window.requestAnimationFrame(() => {
    const stage = document.querySelector(".traceability-tree-stage");
    const tree = document.querySelector(".traceability-tree");
    const svg = document.querySelector(".traceability-tree-edges");
    if (!stage || !tree || !svg) return;

    let edges = [];
    try {
      edges = JSON.parse(tree.dataset.treeEdges || "[]");
    } catch {
      edges = [];
    }

    const stageRect = stage.getBoundingClientRect();
    const width = Math.max(stage.scrollWidth, stageRect.width);
    const height = Math.max(stage.scrollHeight, stageRect.height);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.innerHTML = `
      <defs>
        <marker id="traceabilityTreeArrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z"></path>
        </marker>
      </defs>
    `;

    edges.forEach((edge) => {
      const from = stage.querySelector(`[data-tree-node-id="${cssEscape(edge.fromLotId)}"]`);
      const to = stage.querySelector(`[data-tree-node-id="${cssEscape(edge.toLotId)}"]`);
      if (!from || !to) return;

      const fromRect = from.getBoundingClientRect();
      const toRect = to.getBoundingClientRect();
      const startX = fromRect.right - stageRect.left + stage.scrollLeft;
      const startY = fromRect.top - stageRect.top + stage.scrollTop + (fromRect.height / 2);
      const endX = toRect.left - stageRect.left + stage.scrollLeft;
      const endY = toRect.top - stageRect.top + stage.scrollTop + (toRect.height / 2);
      const distance = Math.max(42, Math.abs(endX - startX));
      const curve = Math.min(120, distance * 0.48);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

      path.setAttribute("d", `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`);
      path.setAttribute("class", "traceability-tree-edge");
      path.setAttribute("marker-end", "url(#traceabilityTreeArrow)");
      svg.appendChild(path);
    });
  });
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/"/g, "\\\"");
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
  if (traceabilityLoading) return "Consultando histórico industrial...";
  if (!traceabilityResults.length) return "Nenhum lote carregado.";
  return `${traceabilityResults.length} lote(s) com histórico rastreável.`;
}

function hasAnyFilter() {
  return Object.values(traceabilityFilters).some((value) => String(value || "").trim());
}

function getTotalConsumed(productions) {
  return productions.reduce((total, production) => ({
    quantity: total.quantity + Number(production.quantity || 0),
    secondaryQuantity: total.secondaryQuantity + Number(production.secondaryQuantity || 0),
    unit: total.unit || production.unit || "",
    secondaryUnit: total.secondaryUnit || production.secondaryUnit || ""
  }), {
    quantity: 0,
    secondaryQuantity: 0,
    unit: "",
    secondaryUnit: ""
  });
}

function normalizeStatus(status) {
  const labels = {
    Disponivel: "Disponível",
    Reprocessavel: "Reprocessável"
  };

  return labels[status] || status || "Sem status";
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
  if (type.includes("LOSS")) return "badge-danger";
  if (type.includes("REPROCESS")) return "badge-info";
  if (type.includes("CONSUMED")) return "badge-warning";
  if (type.includes("OUTPUT") || type.includes("PURCHASE")) return "badge-success";
  return "badge-info";
}

function getTimelineClass(type = "") {
  if (type.includes("CANCEL")) return "danger";
  if (type.includes("LOSS")) return "danger";
  if (type.includes("REPROCESS")) return "info";
  if (type.includes("CONSUMED")) return "warning";
  return "success";
}

function getTimelineTypeLabel(type = "") {
  const labels = {
    LOT_CREATED: "Criação",
    PURCHASE_IN: "Compra",
    PRODUCTION_CONSUMED: "Consumo",
    PRODUCTION_OUTPUT: "Produção",
    INDUSTRIAL_LOSS: "Perda industrial",
    PRODUCTION_LOSS: "Perda industrial",
    PRODUCTION_CANCEL: "Cancelamento",
    PRODUCTION_REPROCESS: "Reprocessamento",
    STOCK_MOVEMENT: "Movimentação",
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

function formatSignedQuantity(value, unit) {
  return `${formatSignedNumber(value)}${unit ? ` ${escapeHtml(unit)}` : ""}`;
}

function formatQuantityWithSecondary(quantity, unit, secondaryQuantity, secondaryUnit) {
  const primary = `${formatNumber(quantity)}${unit ? ` ${escapeHtml(unit)}` : ""}`;
  if (!secondaryQuantity || !secondaryUnit) return primary;
  return `${primary} · Sec.: ${formatNumber(secondaryQuantity)} ${escapeHtml(secondaryUnit)}`;
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
