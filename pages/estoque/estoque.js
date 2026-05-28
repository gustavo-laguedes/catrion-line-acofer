import { lineStore } from "../../shared/data-store.js";
import { buildStockSnapshot } from "../../shared/stock-engine.js";
import { apiGet } from "../../shared/api-client.js";

let apiStockSnapshot = null;
let hasTriedApiLoad = false;

let stockFilters = {
  search: "",
  materialType: "Todos",
  location: "Todos",
  status: "Todos"
};

let stockSort = {
  field: "materialName",
  direction: "asc"
};

let expandedRows = [];

export const estoquePage = {
  title: "🏷️ Estoque",
  subtitle: "Saldos por material, local e status operacional",
  render: renderEstoque,
  afterRender: setupEstoqueEvents
};

function renderEstoque() {
  const balances = getMaterialStockGroups();
  const filteredBalances = applySorting(applyStockFilters(balances));

  return `
    <div class="card stock-card">
      <div class="table-header">
        <div>
          <h2>Consulta de estoque</h2>
          <p>Visualize saldos consolidados por material e separados por local ao abrir o leque.</p>
        </div>
      </div>

      ${renderStockFilters()}

      ${
        filteredBalances.length
          ? renderStockTable(filteredBalances)
          : renderEmptyStock()
      }
    </div>
  `;
}

function getMaterialStockGroups() {
  if (apiStockSnapshot) return apiStockSnapshot.groups;

  return buildStockSnapshot(lineStore).groups;
}

function findMaterial(balance) {
  if (balance.materialId) {
    const byId = lineStore.materials.find((material) => material.id === balance.materialId);
    if (byId) return byId;
  }

  if (balance.materialCode) {
    const byCode = lineStore.materials.find((material) => material.code === balance.materialCode);
    if (byCode) return byCode;
  }

  if (balance.materialName) {
    return lineStore.materials.find((material) => material.name === balance.materialName);
  }

  return null;
}

function renderStockFilters() {
  return `
    <div class="stock-filters-panel">
      <div class="stock-filters-header">
        <strong>Filtros de estoque</strong>
        <div class="stock-filters-actions">
        <button class="secondary-btn small-action-btn" id="expandAllStockRowsBtn">Abrir todos</button>
        <button class="secondary-btn small-action-btn" id="collapseAllStockRowsBtn">Fechar todos</button>
        </div>
      </div>

      <div class="stock-filters">
      <label class="stock-search">
        Buscar
        <input id="stockSearchInput" type="text" placeholder="Material, código ou local" value="${stockFilters.search}" />
      </label>

      <label>
        Tipo
        <select id="stockTypeFilter">
          ${renderOptions(["Todos", ...getUniqueValues("materialType")], stockFilters.materialType)}
        </select>
      </label>

      <label>
        Local
        <select id="stockLocationFilter">
          ${renderOptions(["Todos", ...getUniqueLocationValues()], stockFilters.location)}
        </select>
      </label>

      <label>
        Status
        <select id="stockStatusFilter">
          ${renderOptions(["Todos", "Normal", "Baixo estoque", "Sem saldo"], stockFilters.status)}
        </select>
      </label>
      </div>
    </div>
  `;
}

function renderOptions(options, selectedValue) {
  return options
    .map((option) => `<option value="${option}" ${option === selectedValue ? "selected" : ""}>${option}</option>`)
    .join("");
}

function getUniqueValues(field) {
  return [...new Set(getMaterialStockGroups().map((balance) => balance[field]).filter(Boolean))];
}

function getUniqueLocationValues() {
  return [
    ...new Set(
      getMaterialStockGroups()
        .flatMap((balance) => balance.locations || [])
        .filter(Boolean)
    )
  ];
}

function applyStockFilters(balances) {
  const search = stockFilters.search.trim().toLowerCase();

  return balances.filter((balance) => {
    const status = getBalanceStatus(balance);

    const matchesSearch =
      !search ||
      balance.materialName.toLowerCase().includes(search) ||
      balance.materialCode.toLowerCase().includes(search) ||
      balance.locationNames.toLowerCase().includes(search);

    const matchesType =
      stockFilters.materialType === "Todos" ||
      balance.materialType === stockFilters.materialType;

    const matchesLocation =
      stockFilters.location === "Todos" ||
      balance.locations.includes(stockFilters.location);

    const matchesStatus =
      stockFilters.status === "Todos" ||
      status.label === stockFilters.status;

    return matchesSearch && matchesType && matchesLocation && matchesStatus;
  });
}

function applySorting(balances) {
  return [...balances].sort((a, b) => {
    const field = stockSort.field;

    let valueA = a[field];
    let valueB = b[field];

    if (typeof valueA === "string") valueA = valueA.toLowerCase();
    if (typeof valueB === "string") valueB = valueB.toLowerCase();

    if (valueA > valueB) return stockSort.direction === "asc" ? 1 : -1;
    if (valueA < valueB) return stockSort.direction === "asc" ? -1 : 1;

    return 0;
  });
}

function renderStockTable(balances) {
  return `
    <div class="data-table-wrap">
      <table class="data-table stock-table">
        <thead>
          <tr>
            <th data-sort="materialCode" class="sortable-column">
              Código ${renderSortIcon("materialCode")}
            </th>

            <th data-sort="materialName" class="sortable-column">
              Material ${renderSortIcon("materialName")}
            </th>

            <th data-sort="materialType" class="sortable-column">
              Tipo ${renderSortIcon("materialType")}
            </th>

            <th data-sort="locationNames" class="sortable-column">
              Locais ${renderSortIcon("locationNames")}
            </th>

            <th data-sort="quantity" class="sortable-column">
              Qtd. principal ${renderSortIcon("quantity")}
            </th>

            <th>
              Qtd. secundária
            </th>

            <th data-sort="reservedQuantity" class="sortable-column">
              Reservado ${renderSortIcon("reservedQuantity")}
            </th>

            <th data-sort="availableQuantity" class="sortable-column">
              Disponível ${renderSortIcon("availableQuantity")}
            </th>

            <th data-sort="minStock" class="sortable-column">
              Mínimo ${renderSortIcon("minStock")}
            </th>

            <th data-sort="statusLabel" class="sortable-column">
              Status ${renderSortIcon("statusLabel")}
            </th>
          </tr>
        </thead>

        <tbody>
          ${balances.map(renderStockRowGroup).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderStockRowGroup(balance) {
  const isExpanded = expandedRows.includes(balance.materialCode);

  return `
    ${renderStockRow(balance)}

    ${
      isExpanded
        ? renderLocationLotRows(balance)
        : ""
    }
  `;
}

function renderSortIcon(field) {
  if (stockSort.field !== field) return `<span class="sort-icon">↕</span>`;

  return stockSort.direction === "asc"
    ? `<span class="sort-icon active">▲</span>`
    : `<span class="sort-icon active">▼</span>`;
}

function renderStockRow(balance) {
  const status = getBalanceStatus(balance);

  return `
    <tr class="stock-main-row" data-expand="${balance.materialCode}">
      <td><strong>${balance.materialCode}</strong></td>
      <td>${balance.materialName}</td>
      <td>${balance.materialType}</td>
      <td>${balance.locationNames}</td>
      <td><strong>${formatNumber(balance.quantity)} ${balance.unit}</strong></td>
      <td>
        ${
          balance.secondaryUnit
            ? `<strong>${formatNumber(balance.secondaryQuantity || 0)} ${balance.secondaryUnit}</strong>`
            : "-"
        }
      </td>
      <td>${formatNumber(balance.reservedQuantity)} ${balance.unit}</td>
      <td><strong>${formatNumber(balance.availableQuantity)} ${balance.unit}</strong></td>
      <td>${balance.minStock > 0 ? `${formatNumber(balance.minStock)} ${balance.unit}` : "-"}</td>
      <td><span class="badge ${status.className}">${status.label}</span></td>
    </tr>
  `;
}

function renderLocationLotRows(balance) {
  if (!balance.locationBalances.length) {
    return `
      <tr class="lot-row">
        <td colspan="10">
          <div class="lot-empty">Nenhum local configurado para este material.</div>
        </td>
      </tr>
    `;
  }

  return balance.locationBalances.map((locationBalance) => {
    const lots = getLotsByMaterialAndLocation(balance.materialCode, locationBalance.locationName);

    return `
      <tr class="lot-row">
        <td colspan="10">
          <div class="stock-location-section">
            <div class="stock-location-header">
              <div>
                <strong>${locationBalance.locationName}</strong>
                <span>Saldo deste local</span>
              </div>

              <div class="stock-location-metrics">
                <div>
  <small>Qtd. principal</small>
  <strong>${formatNumber(locationBalance.quantity)} ${balance.unit}</strong>
</div>

<div>
  <small>Qtd. secundária</small>
  <strong>
    ${
      balance.secondaryUnit
        ? `${formatNumber(locationBalance.secondaryQuantity || 0)} ${balance.secondaryUnit}`
        : "-"
    }
  </strong>
</div>

<div>
  <small>Reservado</small>
  <strong>${formatNumber(locationBalance.reservedQuantity)} ${balance.unit}</strong>
</div>

<div>
  <small>Disponível</small>
  <strong>${formatNumber(locationBalance.availableQuantity)} ${balance.unit}</strong>
</div>

              </div>
            </div>

            ${
              lots.length
                ? lots.map((lot) => renderLotCard(lot, balance.unit, balance)).join("")
                : `<div class="lot-empty compact">Nenhum lote disponível neste local.</div>`
            }
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderLotCard(lot, unit, balance = null) {
  const quantity = Number(lot.quantity || 0);
  const reservedQuantity = Number(lot.reservedQuantity || 0);
  const available = quantity - reservedQuantity;

  return `
    <div class="lot-card stock-location-lot-card">
      <div class="lot-card-main">
        <strong>${lot.lotCode}</strong>
        <span>${lot.origin || "Origem não informada"}</span>
      </div>

      <div class="lot-card-info">
        <div>
          <small>Qtd. principal</small>
          <strong>${formatNumber(quantity)} ${lot.unit || unit}</strong>
        </div>

        <div>
          <small>Qtd. secundária</small>
          <strong>
            ${
              lot.secondaryUnit
                ? `${formatNumber(lot.secondaryQuantity || 0)} ${lot.secondaryUnit}`
                : "-"
            }
          </strong>
        </div>

        <div>
          <small>Reservado</small>
          <strong>${formatNumber(reservedQuantity)} ${lot.unit || unit}</strong>
        </div>

        <div>
          <small>Disponível</small>
          <strong>${formatNumber(available)} ${lot.unit || unit}</strong>
        </div>

        <div>
          <small>Produção</small>
          <strong>${formatDateTime(lot.createdAt || lot.productionDate)}</strong>
        </div>
      </div>
    </div>
  `;
}

function getLotsByMaterialAndLocation(materialCode, locationName) {
  if (apiStockSnapshot) {
    return apiStockSnapshot.lots.filter((lot) => {
      return lot.balanceMaterialCode === materialCode && lot.locationName === locationName;
    });
  }

  return buildStockSnapshot(lineStore).lots.filter((lot) => {
    return lot.balanceMaterialCode === materialCode && lot.locationName === locationName;
  });
}

function getBalanceStatus(balance) {
  const quantity = Number(balance.quantity || 0);
  const minStock = Number(balance.minStock || 0);

  if (quantity <= 0) {
    return {
      key: "empty",
      label: "Sem saldo",
      className: "badge-danger"
    };
  }

  if (minStock > 0 && quantity <= minStock) {
    return {
      key: "low",
      label: "Baixo estoque",
      className: "badge-warning"
    };
  }

  return {
    key: "normal",
    label: "Normal",
    className: "badge-success"
  };
}

function renderEmptyStock() {
  return `
    <div class="empty-state">
      <div class="empty-icon">🏷️</div>
      <h3>Nenhum saldo encontrado</h3>
      <p>Cadastre materiais e locais permitidos para visualizar o estoque por local. Depois, esses saldos serão alimentados por movimentações, produção e inventário.</p>
    </div>
  `;
}

function setupEstoqueEvents(options = {}) {
  const loadPromise = loadStockFromApi(Boolean(options.navigation));

  const searchInput = document.getElementById("stockSearchInput");
  const typeFilter = document.getElementById("stockTypeFilter");
  const locationFilter = document.getElementById("stockLocationFilter");
  const statusFilter = document.getElementById("stockStatusFilter");
  const expandAllBtn = document.getElementById("expandAllStockRowsBtn");
  const collapseAllBtn = document.getElementById("collapseAllStockRowsBtn");

  searchInput?.addEventListener("input", (event) => {
    stockFilters.search = event.target.value;
    refreshStockPage();
  });

  typeFilter?.addEventListener("change", (event) => {
    stockFilters.materialType = event.target.value;
    refreshStockPage();
  });

  locationFilter?.addEventListener("change", (event) => {
    stockFilters.location = event.target.value;
    refreshStockPage();
  });

  statusFilter?.addEventListener("change", (event) => {
    stockFilters.status = event.target.value;
    refreshStockPage();
  });

  expandAllBtn?.addEventListener("click", () => {
    const visibleBalances = applySorting(applyStockFilters(getMaterialStockGroups()));
    expandedRows = visibleBalances.map((balance) => balance.materialCode).filter(Boolean);
    refreshStockPage();
  });

  collapseAllBtn?.addEventListener("click", () => {
    expandedRows = [];
    refreshStockPage();
  });

  document.querySelectorAll(".sortable-column").forEach((column) => {
    column.addEventListener("click", (event) => {
      event.stopPropagation();

      const field = column.dataset.sort;

      if (stockSort.field === field) {
        stockSort.direction = stockSort.direction === "asc" ? "desc" : "asc";
      } else {
        stockSort.field = field;
        stockSort.direction = "asc";
      }

      refreshStockPage();
    });
  });

  document.querySelectorAll(".stock-main-row").forEach((row) => {
    row.addEventListener("click", () => {
      const code = row.dataset.expand;

      if (expandedRows.includes(code)) {
        expandedRows = expandedRows.filter((item) => item !== code);
      } else {
        expandedRows.push(code);
      }

      refreshStockPage();
    });
  });

  return loadPromise;
}

async function loadStockFromApi(force = false) {
  if (hasTriedApiLoad && !force) return;

  hasTriedApiLoad = true;

  try {
    const snapshot = await apiGet("/api/stock");
    apiStockSnapshot = normalizeStockSnapshot(snapshot);
    refreshStockPage();
  } catch (error) {
    apiStockSnapshot = null;
    console.log("API indisponivel, usando estoque local");
  }
}

function normalizeStockSnapshot(snapshot) {
  return {
    groups: Array.isArray(snapshot?.groups) ? snapshot.groups.map(normalizeStockGroup) : [],
    lots: Array.isArray(snapshot?.lots) ? snapshot.lots.map(normalizeStockLot) : []
  };
}

function normalizeStockGroup(group) {
  const quantity = parseStockNumber(group.quantity);
  const reservedQuantity = parseStockNumber(group.reservedQuantity);

  return {
    materialId: group.materialId || "",
    materialCode: group.materialCode || "",
    materialName: group.materialName || "Material nao informado",
    materialType: group.materialType || "Sem tipo",
    unit: group.unit || "-",
    secondaryUnit: group.secondaryUnit || "",
    minStock: parseStockNumber(group.minStock),
    quantity,
    secondaryQuantity: parseStockNumber(group.secondaryQuantity),
    reservedQuantity,
    availableQuantity: parseStockNumber(group.availableQuantity ?? quantity - reservedQuantity),
    locations: Array.isArray(group.locations) ? group.locations : [],
    locationNames: group.locationNames || "-",
    locationBalances: Array.isArray(group.locationBalances)
      ? group.locationBalances.map(normalizeLocationBalance)
      : [],
    status: group.status || group.statusLabel || "",
    statusLabel: group.statusLabel || group.status || ""
  };
}

function normalizeLocationBalance(locationBalance) {
  const quantity = parseStockNumber(locationBalance.quantity);
  const reservedQuantity = parseStockNumber(locationBalance.reservedQuantity);

  return {
    locationName: locationBalance.locationName || "Local nao informado",
    quantity,
    secondaryQuantity: parseStockNumber(locationBalance.secondaryQuantity),
    reservedQuantity,
    availableQuantity: parseStockNumber(locationBalance.availableQuantity ?? quantity - reservedQuantity),
    status: locationBalance.status || ""
  };
}

function normalizeStockLot(lot) {
  const quantity = parseStockNumber(lot.quantity);
  const reservedQuantity = parseStockNumber(lot.reservedQuantity);

  return {
    id: lot.id,
    balanceId: lot.balanceId,
    balanceMaterialCode: lot.balanceMaterialCode || lot.materialCode || "",
    materialId: lot.materialId || "",
    materialName: lot.materialName || "",
    locationId: lot.locationId || "",
    locationName: lot.locationName || "Local nao informado",
    lotCode: lot.lotCode || "",
    origin: lot.origin || "Origem nao informada",
    productionDate: lot.productionDate || "",
    createdAt: lot.createdAt || "",
    quantity,
    secondaryQuantity: parseStockNumber(lot.secondaryQuantity),
    reservedQuantity,
    availableQuantity: parseStockNumber(lot.availableQuantity ?? quantity - reservedQuantity),
    unit: lot.unit || "-",
    secondaryUnit: lot.secondaryUnit || "",
    status: lot.status || "",
    updatedAt: lot.updatedAt
  };
}

function refreshStockPage() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${estoquePage.title}</h1>
      <p>${estoquePage.subtitle}</p>
    </div>

    ${renderEstoque()}
  `;

  setupEstoqueEvents();
}

function parseStockNumber(value) {
  if (typeof value === "number") return value;

  if (!value) return 0;

  return Number(String(value).replace(/\./g, "").replace(",", ".")) || 0;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  const formattedDate = date.toLocaleDateString("pt-BR");
  const formattedTime = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return `${formattedDate} ${formattedTime}`;
}
