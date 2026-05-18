import { getToday, formatNumber, renderLotSecondaryField } from "../movimentacoes-utils.js";

export function createInventoryFormState() {
  return {
    date: getToday(),
    locationName: "",
    observation: ""
  };
}

export function renderInventoryForm({
  tab,
  inventoryEntryMode,
  inventoryFormState,
  inventoryCountItems,
  importPreviewItems,
  getTabDescription,
  renderInventoryHeaderFields,
  renderInventoryManualTable,
  renderInventoryImportPreview,
  renderMovementSystemNotice,
  renderDraftItemsBox
}) {
  return `
    <div class="movement-form-header">
      <div>
        <h2>${tab.icon} ${tab.label}</h2>
        <p>${getTabDescription("INVENTORY")}</p>
      </div>

      <button id="generateInventoryPdfBtn" class="secondary-btn" type="button">
        Gerar PDF de conferência
      </button>
    </div>

    <div class="movement-entry-tabs inventory-entry-tabs">
      <button
        class="movement-entry-tab ${inventoryEntryMode === "MANUAL" ? "active" : ""}"
        data-inventory-entry-mode="MANUAL"
        type="button"
      >
        Inventário manual
      </button>

      <button
        class="movement-entry-tab ${inventoryEntryMode === "IMPORT" ? "active" : ""}"
        data-inventory-entry-mode="IMPORT"
        type="button"
      >
        Inventário por importação
      </button>
    </div>

    ${
      inventoryEntryMode === "MANUAL"
        ? `
          <div class="movement-method-card">
            <h3>Inventário manual</h3>
            <p>Informe o local, adicione os materiais e preencha a contagem dos lotes.</p>

            ${renderInventoryHeaderFields()}
            ${renderMovementSystemNotice()}
            ${renderDraftItemsBox("INVENTORY")}

            <div class="movement-actions">
              <button id="registerMovementBtn" class="primary-btn" type="button">
                Fechar inventário
              </button>
            </div>
          </div>
        `
        : `
          <div class="movement-method-card inventory-import-card">
            <div class="inventory-import-title-row">
              <div>
                <h3>Inventário por importação</h3>
                <p>Baixe o modelo do local selecionado, preencha a contagem e importe para conferência.</p>
              </div>

              <button id="downloadInventoryTemplateBtn" class="secondary-btn" type="button">
                Baixar modelo
              </button>
            </div>

            ${renderInventoryHeaderFields()}
            ${renderMovementSystemNotice()}
            ${renderInventoryImportArea(importPreviewItems, renderInventoryImportPreview)}

            <div class="movement-actions">
              <button id="registerMovementBtn" class="primary-btn" type="button">
                Fechar inventário
              </button>
            </div>
          </div>
        `
    }
  `;
}

export function renderInventoryHeaderFields({
  formState,
  getToday,
  renderLocationOptionsWithSelected
}) {
  return `
    <div class="form-grid">
      <label>
        Data do inventário
        <input id="movementDate" type="date" value="${formState.date || getToday()}" />
      </label>

      <label>
        Local
        <select id="movementLocation">
          ${renderLocationOptionsWithSelected("stock", formState.locationName)}
        </select>
      </label>

      <label class="full-field">
        Observação
        <input
          id="movementObservation"
          type="text"
          placeholder="Observações da contagem oficial"
          value="${formState.observation || ""}"
        />
      </label>
    </div>
  `;
}

export function renderInventoryManualTable(items) {
  if (!items.length) {
    return `
      <div class="movement-empty-items">
        Selecione um local para carregar os materiais e lotes do inventário.
      </div>
    `;
  }

  return `
    <div class="inventory-table-wrap">
      <table class="data-table inventory-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Código</th>
            <th>Lote</th>
            <th>Sistema</th>
            <th>Contado</th>
            <th>Diferença</th>
          </tr>
        </thead>

        <tbody>
          ${items.map((item, index) => renderInventoryCountRow(item, index)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInventoryCountRow(item, index) {
  const systemQuantity = Number(item.systemQuantity || 0);
  const countedQuantity = Number(item.countedQuantity || 0);
  const difference = countedQuantity - systemQuantity;
  const systemSecondaryText = item.secondaryUnit
    ? `<small>${formatNumber(item.systemSecondaryQuantity)} ${item.secondaryUnit}</small>`
    : "";

  return `
    <tr>
      <td>${item.materialName}</td>
      <td><strong>${item.materialCode}</strong></td>
      <td>${item.lotCode || "-"}</td>
      <td>${formatNumber(systemQuantity)} ${item.unit}${systemSecondaryText}</td>
      <td>
        <input
          class="inventory-counted-quantity"
          data-index="${index}"
          type="number"
          min="0"
          step="0.001"
          value="${item.countedQuantity ?? ""}"
          placeholder="0"
        />
      </td>
      <td>
        <span class="inventory-difference-pill ${getInventoryDifferenceClass(difference)}">
          ${difference > 0 ? "+" : ""}${formatNumber(difference)}
        </span>
      </td>
    </tr>
  `;
}

function renderInventoryImportArea(importPreviewItems, renderInventoryImportPreview) {
  return `
    <div class="form-grid">
      <label class="full-field">
        Arquivo Excel/CSV
        <input id="inventoryImportFileInput" type="file" accept=".csv,.xlsx,.xls" />
      </label>
    </div>

    <div class="movement-import-actions">
      <button id="previewInventoryImportBtn" class="primary-btn" type="button">
        Ler arquivo
      </button>
    </div>

    ${renderInventoryImportPreview(importPreviewItems)}
  `;
}

export function renderInventoryImportPreview(items) {
  if (!items.length) {
    return `
      <div class="movement-import-preview empty">
        Nenhum arquivo lido ainda.
      </div>
    `;
  }

  const hasErrors = items.some((item) => item.errors?.length);

  return `
    <div class="movement-import-preview">
      <div class="movement-items-header">
        <div>
          <h3>Prévia da importação</h3>
          <p>
            ${
              hasErrors
                ? "Corrija os erros antes de fechar o inventário."
                : "Confira as contagens antes de fechar o inventário."
            }
          </p>
        </div>
      </div>

      <div class="data-table-wrap">
        <table class="data-table inventory-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Código</th>
              <th>Lote</th>
              <th>Sistema</th>
              <th>Contado</th>
              <th>Diferença</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${items.map((item) => {
              const difference = Number(item.countedQuantity || 0) - Number(item.systemQuantity || 0);

              return `
                <tr class="${item.errors?.length ? "import-row-error" : ""}">
                  <td>${item.materialName}</td>
                  <td><strong>${item.materialCode}</strong></td>
                  <td>${item.lotCode || "-"}</td>
                  <td>${formatNumber(item.systemQuantity)} ${item.unit}${item.secondaryUnit ? `<small>${formatNumber(item.systemSecondaryQuantity)} ${item.secondaryUnit}</small>` : ""}</td>
                  <td>${formatNumber(item.countedQuantity)} ${item.unit}${item.secondaryUnit && item.secondaryQuantity !== undefined && item.secondaryQuantity !== "" ? `<small>${formatNumber(item.secondaryQuantity)} ${item.secondaryUnit}</small>` : ""}</td>
                  <td>
                    <span class="inventory-difference-pill ${getInventoryDifferenceClass(difference)}">
                      ${difference > 0 ? "+" : ""}${formatNumber(difference)}
                    </span>
                  </td>
                  <td>
                    ${
                      item.errors?.length
                        ? `<span class="movement-status-pill movement-status-canceled">Erro</span>`
                        : `<span class="movement-status-pill movement-status-processed">Ok</span>`
                    }
                  </td>
                </tr>

                ${
                  item.errors?.length
                    ? `
                      <tr>
                        <td colspan="7">
                          <div class="movement-system-notice danger">
                            <strong>${item.lotCode || item.materialCode}</strong>
                            <span>${item.errors.join(" ")}</span>
                          </div>
                        </td>
                      </tr>
                    `
                    : ""
                }
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getInventoryDifferenceClass(value) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export function renderInventoryDraftLots(item, index) {
  if (!item.lots?.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="purchase-lots-box sale-lots-box">
            <strong>Nenhum lote disponível para este material neste local.</strong>
          </div>
        </td>
      </tr>
    `;
  }

  return `
    <tr>
      <td colspan="6">
        <div class="purchase-lots-box sale-lots-box">
          <div class="sale-lots-title">
            <div>
              <strong>Lotes para contagem</strong>
              <span>Informe a quantidade contada em cada lote.</span>
            </div>

            <span class="sale-lots-total">
              Sistema: <strong>${formatNumber(item.quantity)} ${item.unit}</strong>
            </span>
          </div>

          <div class="sale-lot-list selected-only">
            ${item.lots.map((lot, lotIndex) => {
              const systemQuantity = Number(lot.systemQuantity || 0);
              const countedQuantity = Number(lot.countedQuantity || 0);
              const difference = countedQuantity - systemQuantity;
              const systemSecondaryText = item.secondaryUnit
                ? `<span>Sistema sec.: ${formatNumber(lot.systemSecondaryQuantity)} ${item.secondaryUnit}</span>`
                : "";

              return `
                <div class="sale-lot-card inventory-lot-card">
                  <div class="sale-lot-info">
                    <strong>${lot.lotCode}</strong>
                    <span>Sistema: ${formatNumber(systemQuantity)} ${item.unit}</span>
                    ${systemSecondaryText}
                  </div>

                  <label class="sale-lot-qty">
                    Contado
                    <input
                      class="inventory-draft-lot-quantity"
                      data-index="${index}"
                      data-lot-index="${lotIndex}"
                      type="number"
                      min="0"
                      step="0.001"
                      value="${lot.countedQuantity ?? ""}"
                      placeholder="0"
                    />
                  </label>

                  ${renderLotSecondaryField({
                    item,
                    lot,
                    itemIndex: index,
                    lotIndex,
                    primaryQuantity: lot.countedQuantity || 0,
                    inputClass: "inventory-draft-lot-secondary-quantity",
                    label: "Contado sec."
                  })}

                  <div class="inventory-result-box">
                    <small>Diferença</small>
                    <strong class="inventory-difference-pill ${getInventoryDifferenceClass(difference)}">
                      ${difference > 0 ? "+" : ""}${formatNumber(difference)}
                    </strong>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      </td>
    </tr>
  `;
}
