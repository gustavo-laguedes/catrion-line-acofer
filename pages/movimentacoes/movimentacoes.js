import { lineStore, getActiveItems } from "../../shared/data-store.js";
import {
  movementTabs,
  getTabDescription,
  getMovementBadgeClass
} from "./movimentacoes-config.js";

import {
  getNowInputValue,
  getToday,
  getDateOnly,
  formatNumber,
  formatDateTime,
  formatDateOnly,
  toDateTimeInputValue,
  getMaterialSecondaryData,
  calculateFixedSecondaryQuantity,
  applyLotSecondaryQuantity,
  renderLotSecondaryField
} from "./movimentacoes-utils.js";

import {
  createPurchaseFormState,
  ensureSupplierStore,
  renderSupplierOptions,
  renderPurchaseHeaderFields,
  validatePurchaseLots,
  getPurchaseDraftItemLotStatusClass,
  renderPurchaseDraftLots
} from "./tabs/compra.js";

import {
  createSaleFormState,
  renderSaleForm,
  renderSaleHeaderFields,
  getSaleExitModeLabel,
  getSaleDraftItemLotStatusClass,
  renderSaleDraftLots
} from "./tabs/venda.js";

import {
  createReturnFormState,
  renderReturnForm,
  renderReturnHeaderFields,
  getReturnModeLabel,
  renderReturnDraftLots
} from "./tabs/devolucao.js";

import {
  createTransferFormState,
  renderTransferForm,
  renderTransferHeaderFields,
  getTransferModeLabel,
  getTransferDraftItemLotStatusClass,
  renderTransferDraftLots
} from "./tabs/transferencia.js";

import {
  createAdjustmentFormState,
  renderAdjustmentForm,
  renderAdjustmentHeaderFields,
  getAdjustmentModeLabel,
  getAdjustmentDraftItemLotStatusClass,
  renderAdjustmentDraftLots
} from "./tabs/ajuste.js";

import {
  createInventoryFormState,
  renderInventoryForm,
  renderInventoryHeaderFields,
  renderInventoryManualTable,
  renderInventoryImportPreview,
renderInventoryDraftLots
} from "./tabs/inventario.js";

import {
  renderMovementHistory as renderMovementHistoryTemplate,
  renderMovementHistoryFilters as renderMovementHistoryFiltersTemplate,
  applyMovementHistoryFilters as applyMovementHistoryFiltersTemplate,
  renderMovementHistoryList as renderMovementHistoryListTemplate,
  renderMovementInfo,
  renderEmptyHistory
} from "./movimentacoes-history.js";


let activeMovementTab = "PURCHASE";
let movementDraftItems = [];
let importPreviewItems = [];
let movementFormState = createPurchaseFormState(getToday);
let saleFormState = createSaleFormState(getToday);
let saleEntryMode = "IMPORT";
let returnFormState = createReturnFormState(getToday);
let transferFormState = createTransferFormState(getToday);
let adjustmentFormState = createAdjustmentFormState();
let adjustmentEntryMode = "INCREASE";
let inventoryFormState = createInventoryFormState();
let inventoryEntryMode = "MANUAL";
let inventoryCountItems = [];
let returnEntryMode = "IMPORT";
let purchaseAttachmentFile = null;
let purchaseAttachmentUrl = "";
let movementSystemNotice = null;
let selectedMovementId = null;
let isEditingMovement = false;
let movementDeleteTargetId = null;
let movementReprocessTargetId = null;

let movementHistoryFilters = {
  search: "",
  date: "",
  status: "Todos"
};

export const movimentacoesPage = {
  title: "🔁 Movimentações",
  subtitle: "Compras, vendas, devoluções, transferências, ajustes e inventários",
  render: renderMovimentacoes,
  afterRender: setupMovimentacoesEvents
};

function renderMovimentacoes() {
  ensureSupplierStore(lineStore);
  return `
  <div class="movement-tabs">
    ${movementTabs.map(renderMovementTab).join("")}
  </div>

  <div class="movement-layout">
    <div class="card movement-form-card">
      ${renderActiveMovementForm()}
    </div>

    <div class="card movement-history-card">
      ${renderMovementHistory()}
    </div>
  </div>

  ${renderMovementDetailModal()}
  ${renderDeleteMovementModal()}
${renderReprocessMovementModal()}
`;
}

function renderMovementSystemNotice() {
  if (!movementSystemNotice) return "";

  return `
    <div class="movement-system-notice ${movementSystemNotice.type}">
      <strong>${movementSystemNotice.title}</strong>
      <span>${movementSystemNotice.message}</span>
    </div>
  `;
}

function renderMovementTab(tab) {
  return `
    <button
      class="movement-tab ${activeMovementTab === tab.key ? "active" : ""}"
      data-movement-tab="${tab.key}"
      type="button"
    >
      <span>${tab.icon}</span>
      ${tab.label}
    </button>
  `;
}

function renderActiveMovementForm() {
  const tab = getActiveTab();

  if (activeMovementTab === "SALE") {
  return renderSaleForm({
  tab,
  saleEntryMode,
  saleFormState,
  getTabDescription,
  renderSaleHeaderFields: () => renderSaleHeaderFields({
    formState: saleFormState,
    getToday,
    renderLocationOptionsWithSelected
  }),
  renderDraftItemsBox,
  renderImportPreview,
  renderMovementSystemNotice
});
}

  if (activeMovementTab === "RETURN") {
  return renderReturnForm({
    tab,
    returnEntryMode,
    returnFormState,
    getTabDescription,
    renderReturnHeaderFields: () => renderReturnHeaderFields({
      formState: returnFormState,
      getToday,
      renderLocationOptionsWithSelected
    }),
    renderDraftItemsBox,
    renderImportPreview,
    renderMovementSystemNotice
  });
}

if (activeMovementTab === "TRANSFER") {
  return renderTransferForm({
    tab,
    transferFormState,
    getTabDescription,
    renderTransferHeaderFields: () => renderTransferHeaderFields({
      formState: transferFormState,
      getToday,
      renderLocationOptionsWithSelected
    }),
    renderDraftItemsBox,
    renderMovementSystemNotice
  });
}

if (activeMovementTab === "ADJUSTMENT") {
  return renderAdjustmentForm({
    tab,
    adjustmentEntryMode,
    adjustmentFormState,
    getTabDescription,
    renderAdjustmentHeaderFields: () => renderAdjustmentHeaderFields({
      formState: adjustmentFormState,
      renderLocationOptionsWithSelected
    }),
    renderDraftItemsBox,
    renderMovementSystemNotice
  });
}

if (activeMovementTab === "INVENTORY") {
  return renderInventoryForm({
    tab,
    inventoryEntryMode,
    inventoryFormState,
    inventoryCountItems,
    importPreviewItems,
    getTabDescription,
    renderInventoryHeaderFields: () => renderInventoryHeaderFields({
      formState: inventoryFormState,
      getToday,
      renderLocationOptionsWithSelected
    }),
    renderInventoryManualTable,
    renderInventoryImportPreview,
renderMovementSystemNotice,
renderDraftItemsBox
  });
}

  return `
    <div class="movement-form-header">
      <div>
        <h2>${tab.icon} ${tab.label}</h2>
        <p>${getTabDescription(activeMovementTab)}</p>
      </div>
    </div>

    ${renderHeaderFields(activeMovementTab)}
    ${renderMovementSystemNotice()}

    ${renderDraftItemsBox(activeMovementTab)}

    <div class="movement-actions">
      <button id="registerMovementBtn" class="primary-btn" type="button">
        Registrar ${tab.label}
      </button>
    </div>
  `;
}

function renderHeaderFields(type) {
  if (type === "PURCHASE") {
    return renderPurchaseHeaderFields({
      formState: movementFormState,
      attachmentFile: purchaseAttachmentFile,
      getToday,
      lineStore,
      getActiveItems,
      renderLocationOptionsWithSelected
    });
  }

  if (type === "SALE") {
    return renderSaleHeaderFields({
      formState: saleFormState,
      getToday,
      renderLocationOptionsWithSelected
    });
  }

  if (type === "RETURN") {
  return renderReturnHeaderFields({
    formState: returnFormState,
    getToday,
    renderLocationOptionsWithSelected
  });
}

  if (type === "ADJUSTMENT") {
    return `
      <div class="form-grid">
        <label>
          Data
          <input id="movementDate" type="datetime-local" value="${getNowInputValue()}" />
        </label>

        <label>
          Local
          <select id="movementLocation">
            ${renderLocationOptions("stock")}
          </select>
        </label>

        <label class="full-field">
          Motivo
          <input id="movementReason" type="text" placeholder="Ex: divergência operacional, perda, sobra..." />
        </label>
      </div>
    `;
  }

  if (type === "INVENTORY") {
    return `
      <div class="form-grid">
        <label>
          Data
          <input id="movementDate" type="datetime-local" value="${getNowInputValue()}" />
        </label>

        <label>
          Local
          <select id="movementLocation">
            ${renderLocationOptions("stock")}
          </select>
        </label>

        <label class="full-field">
          Observação
          <input id="movementObservation" type="text" placeholder="Observações da contagem oficial" />
        </label>
      </div>
    `;
  }

  return `
    <div class="form-grid">
      <label>
        Data
        <input id="movementDate" type="datetime-local" value="${getNowInputValue()}" />
      </label>

      <label>
        Local da ${type === "SALE" ? "venda" : "devolução"}
        <select id="movementLocation">
          ${renderLocationOptions("sale")}
        </select>
      </label>
    </div>
  `;
}

function renderDraftItemsBox(type) {
  return `
    <div class="movement-items-box">
      <div class="movement-items-header">
        <div>
          <h3>Itens</h3>
          <p>Adicione um ou mais materiais nesta movimentação.</p>
        </div>
      </div>

      <div class="movement-item-form">
  <label>
    Material
    <select id="movementMaterial">
      ${renderMaterialOptions()}
    </select>
  </label>

  <label>
    Unidade
    <input id="movementUnitPreview" type="text" value="${getSelectedMaterialUnit()}" disabled />
  </label>

  <label>
    Unidade secundária
    <input id="movementSecondaryUnitPreview" type="text" value="${getSelectedMaterialSecondaryLabel()}" disabled />
  </label>

  <label>
    Quantidade
    <input id="movementQuantity" type="number" min="0" step="0.001" placeholder="0" />
  </label>

  <button id="addMovementItemBtn" class="secondary-btn" type="button">
    Adicionar item
  </button>
</div>

      ${renderDraftItemsTable(type)}
    </div>
  `;
}

function getSelectedMaterialUnit() {
  const materialName = document.getElementById("movementMaterial")?.value;
  const material = findMaterialByName(materialName);

  return material?.unit || "un";
}

function getSelectedMaterialSecondaryLabel() {
  const materialName = document.getElementById("movementMaterial")?.value;
  const material = findMaterialByName(materialName);

  return material?.secondaryUnit ? `${material.secondaryUnitMode === "fixed" ? "Fixa" : "Manual"} (${material.secondaryUnit})` : "-";
}


function renderDraftItemsTable(type) {
  if (!movementDraftItems.length) {
    return `
      <div class="movement-empty-items">
        Nenhum item adicionado.
      </div>
    `;
  }

  return `
    <div class="data-table-wrap">
      <table class="data-table movement-items-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Código</th>
            <th>Quantidade</th>
            <th>Un.</th>
            <th>Un. sec.</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          ${movementDraftItems.map((item, index) => `
            <tr>
              <td>${item.materialName}</td>
              <td><strong>${item.materialCode}</strong></td>
              <td class="${
  type === "PURCHASE"
  ? getPurchaseDraftItemLotStatusClass(item)
  : type === "SALE" || type === "RETURN"
    ? getSaleDraftItemLotStatusClass(item)
    : type === "TRANSFER"
      ? getTransferDraftItemLotStatusClass(item)
      : type === "ADJUSTMENT"
        ? getAdjustmentDraftItemLotStatusClass(item)
        : ""
}">
  ${formatNumber(item.quantity)}
</td>
              <td>${item.unit}</td>
              <td>${item.secondaryUnit ? `${item.secondaryUnitMode === "fixed" ? "Fixa" : "Manual"} (${item.secondaryUnit})` : "-"}</td>
              <td>
                <button class="mini-danger-btn remove-movement-item-btn" data-index="${index}" type="button">
                  Remover
                </button>
              </td>
            </tr>

           ${type === "PURCHASE" ? renderPurchaseDraftLots(item, index) : ""}
      ${type === "SALE" ? renderSaleDraftLots(item, index, saleFormState.stockExitMode) : ""}
${type === "RETURN" ? renderReturnDraftLots(item, index, returnFormState.stockExitMode) : ""}
   ${type === "TRANSFER" ? renderTransferDraftLots(item, index, transferFormState.stockExitMode) : ""}
${type === "ADJUSTMENT" ? renderAdjustmentDraftLots(item, index, adjustmentEntryMode) : ""}
        ${type === "INVENTORY" ? renderInventoryDraftLots(item, index) : ""}
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function captureDraftLots() {
  document.querySelectorAll(".draft-lot-code").forEach((input) => {
    const itemIndex = Number(input.dataset.index);
    const lotIndex = Number(input.dataset.lotIndex);

    if (movementDraftItems[itemIndex]?.lots?.[lotIndex]) {
      movementDraftItems[itemIndex].lots[lotIndex].lotCode = input.value;
    }
  });

  document.querySelectorAll(".draft-lot-quantity").forEach((input) => {
    const itemIndex = Number(input.dataset.index);
    const lotIndex = Number(input.dataset.lotIndex);

    if (movementDraftItems[itemIndex]?.lots?.[lotIndex]) {
      movementDraftItems[itemIndex].lots[lotIndex].quantity = Number(input.value || 0);
      applyLotSecondaryQuantity(
        movementDraftItems[itemIndex],
        movementDraftItems[itemIndex].lots[lotIndex],
        movementDraftItems[itemIndex].lots[lotIndex].quantity
      );
    }
  });

  document.querySelectorAll(".draft-lot-secondary-quantity").forEach((input) => {
    const itemIndex = Number(input.dataset.index);
    const lotIndex = Number(input.dataset.lotIndex);

    if (movementDraftItems[itemIndex]?.lots?.[lotIndex]) {
      movementDraftItems[itemIndex].lots[lotIndex].secondaryQuantity = Number(input.value || 0);
      movementDraftItems[itemIndex].lots[lotIndex].secondaryUnit = movementDraftItems[itemIndex].secondaryUnit || "";
    }
  });
}

function renderImportPreview(type) {
  if (!importPreviewItems.length) {
    return `
      <div class="movement-import-preview empty">
        Nenhum arquivo lido ainda.
      </div>
    `;
  }

  const hasErrors = importPreviewItems.some((item) => item.errors?.length);

  return `
    <div class="movement-import-preview">
      <div class="movement-items-header">
        <div>
          <h3>Prévia da importação</h3>
          <p>
            ${
              hasErrors
                ? "Corrija os erros antes de confirmar a importação."
                : "Confira os materiais, quantidades e lotes antes de registrar."
            }
          </p>
        </div>
      </div>

      <div class="data-table-wrap">
        <table class="data-table movement-items-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Material</th>
              <th>Código</th>
              <th>Quantidade</th>
              <th>Un.</th>
              <th>Lotes</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${importPreviewItems.map((item) => `
              <tr class="${item.errors?.length ? "import-row-error" : ""}">
                <td>${item.saleDateFormatted || "-"}</td>
                <td>${item.materialName}</td>
                <td><strong>${item.materialCode}</strong></td>
                <td>${formatNumber(item.quantity)}</td>
                <td>${item.unit}</td>
                <td>${renderImportPreviewLots(item)}</td>
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
                          <strong>Linha ${item.importRowNumber}</strong>
                          <span>${item.errors.join(" ")}</span>
                        </div>
                      </td>
                    </tr>
                  `
                  : ""
              }
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="movement-actions">
        <button
          id="confirmImportBtn"
          class="primary-btn"
          data-import-type="${type}"
          type="button"
          ${hasErrors ? "disabled" : ""}
        >
          Confirmar importação
        </button>
      </div>
    </div>
  `;
}

function renderImportPreviewLots(item) {
  if (!item.lots?.length) {
    return `<span>-</span>`;
  }

  return `
    <div class="import-preview-lots">
      ${item.lots
        .filter((lot) => lot.selected || Number(lot.quantity || 0) > 0)
        .map((lot) => `
          <span>
            ${lot.lotCode || "-"}: ${formatNumber(lot.quantity || lot.exitQuantity || 0)} ${item.unit}
            ${item.secondaryUnit && lot.secondaryQuantity !== undefined && lot.secondaryQuantity !== "" ? ` / ${formatNumber(lot.secondaryQuantity)} ${item.secondaryUnit}` : ""}
          </span>
        `)
        .join("")}
    </div>
  `;
}

function renderMovementHistory() {
  return renderMovementHistoryTemplate({
    activeMovementTab,
    getActiveTab,
    movementHistoryFilters,
    getMovementsByType,
    applyMovementHistoryFilters,
    renderMovementHistoryFilters,
    renderMovementHistoryList,
    renderEmptyHistory
  });
}

function renderMovementHistoryFilters() {
  return renderMovementHistoryFiltersTemplate(movementHistoryFilters);
}

function applyMovementHistoryFilters(movements) {
  return applyMovementHistoryFiltersTemplate(movements, movementHistoryFilters);
}

function renderMovementHistoryList(movements) {
  return renderMovementHistoryListTemplate({
    movements,
    getMovementItems,
    renderMovementInfo,
    formatMovementHistoryDate,
    getMovementCardStatusClass,
    getMovementStatusClass
  });
}

function renderMovementDetailModal() {
  if (!selectedMovementId) return "";

  const movement = lineStore.stockMovements.find((item) => item.id === selectedMovementId);

  if (!movement) return "";

  const items = getMovementItems(movement.id);

  return `
    <div class="modal-backdrop open movement-detail-backdrop">
      <div class="modal large-modal movement-detail-modal ${getMovementModalStatusClass(movement)}">
        <div class="modal-header">
          <div>
            <h2>${movement.typeLabel} ${isEditingMovement ? "— edição" : ""}</h2>
            <p>Consulte, edite ou exclua este registro.</p>
          </div>

          <button id="closeMovementDetailBtn" class="modal-close" type="button">×</button>
        </div>

        ${
          isEditingMovement
            ? renderMovementEditForm(movement, items)
            : renderMovementReadOnly(movement, items)
        }
      </div>
    </div>
  `;
}

function renderMovementReadOnly(movement, items) {
  const isSale = movement.type === "SALE" || movement.type === "RETURN";
  const isTransfer = movement.type === "TRANSFER";

  return `
    <div class="movement-detail-grid">
      <div>
        <small>Data</small>
        <strong>${formatMovementHistoryDate(movement)}</strong>
      </div>

      <div>
        <small>Status</small>
        <strong>${movement.status}</strong>
      </div>

      ${isTransfer ? `
        <div>
          <small>Origem</small>
          <strong>${movement.originLocation || "-"}</strong>
        </div>

        <div>
          <small>Destino</small>
          <strong>${movement.destinationLocation || "-"}</strong>
        </div>
      ` : `
        <div>
          <small>Local</small>
          <strong>${movement.locationName || "-"}</strong>
        </div>
      `}

      ${!isSale ? `
        <div>
          <small>NF</small>
          <strong>${movement.fiscalNumber || "-"}</strong>
        </div>
      ` : ""}

      ${!isSale && !isTransfer ? `
        <div>
          <small>Fornecedor</small>
          <strong>${movement.supplierName || "-"}</strong>
        </div>
      ` : ""}

      ${!isSale ? `
        <div>
          <small>Anexo</small>
          ${
            movement.attachmentName
              ? `<button class="attachment-link-btn" data-open-attachment="${movement.id}" type="button">
                  <span class="attachment-file-icon">PDF</span> ${movement.attachmentName}
                </button>`
              : `<strong>-</strong>`
          }
        </div>
      ` : ""}

<div>
  <small>Responsável</small>
  <strong>${movement.responsibleName || "-"}</strong>
</div>

    </div>

    ${
      movement.observation
        ? `<div class="movement-detail-note"><strong>Observação:</strong> ${movement.observation}</div>`
        : ""
    }

    ${renderMovementItemsReadOnly(items)}

    <div class="modal-footer">
  <button id="editMovementBtn" class="secondary-btn" type="button">
    Editar
  </button>

  <button id="closeMovementDetailFooterBtn" class="primary-btn" type="button">
    Fechar
  </button>
</div>
    </div>
  `;
}

function renderMovementEditForm(movement, items) {
   const isSale = movement.type === "SALE" || movement.type === "RETURN";
  const isTransfer = movement.type === "TRANSFER";
  return `
    <div class="form-grid">
      <label>
        Data
                <input
  id="editMovementDate"
  type="${movement.type === "PURCHASE" || movement.type === "SALE" || movement.type === "RETURN" || movement.type === "TRANSFER" || movement.type === "ADJUSTMENT" ? "date" : "datetime-local"}"
value="${movement.type === "PURCHASE" || movement.type === "SALE" || movement.type === "RETURN" || movement.type === "TRANSFER" || movement.type === "ADJUSTMENT" ? movement.movementDate : toDateTimeInputValue(movement.dateTime)}"
/>
      </label>

      ${isTransfer ? `
  <label>
    Local de origem
    <select id="editMovementOriginLocation">
      ${renderLocationOptionsWithSelected("stock", movement.originLocation)}
    </select>
  </label>

  <label>
    Local de destino
    <select id="editMovementDestinationLocation">
      ${renderLocationOptionsWithSelected("stock", movement.destinationLocation)}
    </select>
  </label>
` : `
  <label>
    Local
    <select id="editMovementLocation">
      ${renderLocationOptionsWithSelected("stock", movement.locationName)}
    </select>
  </label>
`}

     ${!isSale && !isTransfer ? `
  <label>
    Fornecedor
    <select id="editMovementSupplier">
      ${renderSupplierOptions(lineStore, getActiveItems, movement.supplierName)}
    </select>
  </label>

  <label>
    Número da NF
    <input id="editMovementFiscalNumber" type="text" value="${movement.fiscalNumber || ""}" />
  </label>

  <label>
    Anexo
    <input id="editMovementAttachment" type="file" accept=".pdf,.xml,.jpg,.png" />
  </label>
` : ""}

      <label class="full-field">
        Observação
        <input id="editMovementObservation" type="text" value="${movement.observation || ""}" />
      </label>
    </div>

    ${renderMovementItemsEditable(items)}

    <div class="modal-footer between">
  ${
    movement.status === "Cancelado"
      ? `<button id="reprocessMovementBtn" class="success-btn" type="button">
          Reprocessar ${movement.typeLabel.toLowerCase()}
        </button>`
      : `<button id="deleteMovementBtn" class="danger-btn" type="button">
          Cancelar ${movement.typeLabel.toLowerCase()}
        </button>`
  }

  <div class="modal-footer-actions">
    <button id="cancelEditMovementBtn" class="secondary-btn" type="button">
      Voltar
    </button>

    <button id="saveMovementEditBtn" class="primary-btn" type="button">
      Salvar alterações
    </button>
  </div>
</div>
  `;
}

function renderMovementItemsReadOnly(items) {
  return `
    <div class="movement-detail-section">
      <h3>Itens lançados</h3>

      <div class="data-table-wrap">
        <table class="data-table movement-items-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Código</th>
              <th>Quantidade</th>
              <th>Un.</th>
              <th>Un. sec.</th>
            </tr>
          </thead>

          <tbody>
  ${items.map((item) => `
    <tr>
      <td>${item.materialName}</td>
      <td><strong>${item.materialCode}</strong></td>
      <td>${formatNumber(item.quantity)}</td>
      <td>${item.unit}</td>
      <td>${item.secondaryUnit || "-"}</td>
    </tr>

    ${
      item.lots?.length
        ? `
          <tr>
            <td colspan="5">
              <div class="purchase-lots-box">
                <div class="purchase-lots-header">
                  <strong>Lotes registrados</strong>
                </div>

                ${item.lots
  .filter((lot) => Number(lot.quantity || lot.exitQuantity || 0) > 0)
  .map((lot) => `
                  <div class="purchase-lot-row readonly-mode">
                    <label>
                      Lote
                      <input type="text" value="${lot.lotCode || "-"}" disabled />
                    </label>

                    <label>
                      Quantidade
                      <input type="text" value="${formatNumber(lot.quantity)}" disabled />
                    </label>

                    ${renderLotSecondaryField({
                      item,
                      lot,
                      itemIndex: 0,
                      lotIndex: 0,
                      primaryQuantity: lot.quantity || lot.movementQuantity || 0,
                      disabled: true
                    })}
                  </div>
                `).join("")}
              </div>
            </td>
          </tr>
        `
        : ""
    }
  `).join("")}
</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMovementItemsEditable(items) {
  return `
    <div class="movement-detail-section">
      <h3>Itens lançados</h3>

      <div class="data-table-wrap">
        <table class="data-table movement-items-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Código</th>
              <th>Quantidade</th>
              <th>Un.</th>
              <th>Un. sec.</th>
            </tr>
          </thead>

          <tbody>
  ${items.map((item) => `
    <tr>
      <td>${item.materialName}</td>
      <td><strong>${item.materialCode}</strong></td>

      <td>
        <input
          class="movement-edit-qty"
          data-item-id="${item.id}"
          type="number"
          min="0"
          step="0.001"
          value="${item.quantity}"
        />
      </td>

      <td>${item.unit}</td>
      <td>${item.secondaryUnit || "-"}</td>
    </tr>

    ${
      item.lots?.length
        ? `
          <tr>
            <td colspan="5">
              <div class="purchase-lots-box">

                <div class="purchase-lots-header">
                  <strong>Lotes registrados</strong>

                  ${activeMovementTab !== "SALE" ? `
  <button
    class="secondary-btn add-edit-lot-btn"
    data-item-id="${item.id}"
    type="button"
  >
    + Adicionar lote
  </button>
` : ""}
                </div>

                ${item.lots
  .filter((lot) => Number(lot.quantity || lot.exitQuantity || 0) > 0)
  .map((lot, lotIndex) => `
                  <div class="purchase-lot-row">

                    <label>
                      Lote

                      <input
                        class="edit-lot-code"
                        data-item-id="${item.id}"
                        data-lot-index="${lotIndex}"
                        type="text"
                        value="${lot.lotCode || ""}"
                      />
                    </label>

                    <label>
                      Quantidade

                      <input
                        class="edit-lot-quantity"
                        data-item-id="${item.id}"
                        data-lot-index="${lotIndex}"
                        type="number"
                        min="0"
                        step="0.001"
                        value="${lot.quantity || 0}"
                      />
                    </label>

                    ${renderLotSecondaryField({
                      item,
                      lot,
                      itemIndex: 0,
                      itemId: item.id,
                      lotIndex,
                      primaryQuantity: lot.quantity || lot.movementQuantity || 0,
                      inputClass: "edit-lot-secondary-quantity"
                    })}

                    <button
                      class="mini-danger-btn remove-edit-lot-btn"
                      data-item-id="${item.id}"
                      data-lot-index="${lotIndex}"
                      type="button"
                    >
                      Remover lote
                    </button>

                  </div>
                `).join("")}

              </div>
            </td>
          </tr>
        `
        : ""
    }
  `).join("")}
</tbody>
        </table>
      </div>
    </div>
  `;
}

function renderDeleteMovementModal() {
  if (!movementDeleteTargetId) return "";

  const movement = lineStore.stockMovements.find((item) => item.id === movementDeleteTargetId);

  if (!movement) return "";

  return `
    <div class="modal-backdrop open danger-backdrop">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <h2>Cancelar ${movement.typeLabel.toLowerCase()}</h2>
<p>Essa ação manterá o registro no histórico, mas mudará o status para cancelado.</p>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção</strong>
          <span>Essa exclusão deve ser usada somente para corrigir lançamentos feitos por engano.</span>
          <span>Quando o estoque estiver integrado, essa ação também precisará recalcular saldos.</span>
        </div>

        <label class="aware-check">
          <input id="deleteMovementAwareCheck" type="checkbox" />
          Estou ciente e quero cancelar este registro.
        </label>

        <div class="modal-footer between">
          <button id="cancelDeleteMovementBtn" class="secondary-btn" type="button">
            Cancelar
          </button>

          <button id="confirmDeleteMovementBtn" class="danger-btn" type="button" disabled>
            Confirmar cancelamento
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderReprocessMovementModal() {
  if (!movementReprocessTargetId) return "";

  const movement = lineStore.stockMovements.find((item) => item.id === movementReprocessTargetId);

  if (!movement) return "";

  return `
    <div class="modal-backdrop open reprocess-backdrop">
      <div class="modal reprocess-modal">
        <div class="reprocess-alert-icon">↻</div>

        <div class="modal-header vertical">
          <h2>Reprocessar ${movement.typeLabel.toLowerCase()}</h2>
          <p>Essa ação mudará o status deste registro para reprocessado e permitirá que ele volte a valer operacionalmente.</p>
        </div>

        <div class="reprocess-warning-box">
          <strong>Atenção</strong>
          <span>Quando o estoque estiver integrado, essa ação deverá recalcular novamente os saldos desta movimentação.</span>
        </div>

        <label class="aware-check">
          <input id="reprocessMovementAwareCheck" type="checkbox" />
          Estou ciente e quero reprocessar este registro.
        </label>

        <div class="modal-footer between">
          <button id="cancelReprocessMovementBtn" class="secondary-btn" type="button">
            Cancelar
          </button>

          <button id="confirmReprocessMovementBtn" class="success-btn" type="button" disabled>
            Confirmar reprocessamento
          </button>
        </div>
      </div>
    </div>
  `;
}

function setupMovimentacoesEvents() {
  document.querySelectorAll("[data-movement-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeMovementTab = button.dataset.movementTab;
      movementDraftItems = [];
      importPreviewItems = [];
      refreshMovimentacoesPage();
    });
  });

  document.querySelectorAll("[data-sale-entry-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    saleEntryMode = button.dataset.saleEntryMode;
    movementDraftItems = [];
    importPreviewItems = [];
    refreshMovimentacoesPage();
  });
});

  document.querySelectorAll("[data-return-entry-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    returnEntryMode = button.dataset.returnEntryMode;
    movementDraftItems = [];
    importPreviewItems = [];
    refreshMovimentacoesPage();
  });
});

  document.querySelectorAll("[data-adjustment-entry-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    adjustmentEntryMode = button.dataset.adjustmentEntryMode;
    movementDraftItems = [];
    importPreviewItems = [];
    refreshMovimentacoesPage();
  });
});

  document.querySelectorAll("[data-inventory-entry-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    inventoryEntryMode = button.dataset.inventoryEntryMode;
    importPreviewItems = [];
    refreshMovimentacoesPage();
  });
});

document.getElementById("importStockExitMode")?.addEventListener("change", (event) => {
  if (activeMovementTab === "RETURN") {
    returnFormState.stockExitMode = event.target.value;
    return;
  }

  saleFormState.stockExitMode = event.target.value;
});

document.getElementById("movementStockExitMode")?.addEventListener("change", (event) => {
  if (activeMovementTab === "RETURN") {
  returnFormState.stockExitMode = event.target.value;
} else if (activeMovementTab === "TRANSFER") {
  transferFormState.stockExitMode = event.target.value;
} else {
  saleFormState.stockExitMode = event.target.value;
}

  movementDraftItems = [];
  refreshMovimentacoesPage();
});

document.getElementById("movementLocation")?.addEventListener("change", () => {
  if (activeMovementTab !== "INVENTORY") return;

  captureMovementFormState();
  inventoryCountItems = buildInventoryCountItemsByLocation(inventoryFormState.locationName);
  refreshMovimentacoesPage();
});

  document.getElementById("movementMaterial")?.addEventListener("change", () => {
  const materialName = document.getElementById("movementMaterial")?.value;
  const material = findMaterialByName(materialName);
  const unitInput = document.getElementById("movementUnitPreview");
  const secondaryUnitInput = document.getElementById("movementSecondaryUnitPreview");

  if (unitInput) {
    unitInput.value = material?.unit || "un";
  }

  if (secondaryUnitInput) {
    secondaryUnitInput.value = material?.secondaryUnit ? `${material.secondaryUnitMode === "fixed" ? "Fixa" : "Manual"} (${material.secondaryUnit})` : "-";
  }
});

  document.getElementById("addMovementItemBtn")?.addEventListener("click", addDraftItem);

  document.querySelectorAll(".remove-movement-item-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      captureMovementFormState();
movementDraftItems.splice(index, 1);
refreshMovimentacoesPage();
    });
  });

  document.getElementById("registerMovementBtn")?.addEventListener("click", () => {
    const sourceType = activeMovementTab === "INVENTORY" && inventoryEntryMode === "IMPORT"
      ? "IMPORT"
      : "MANUAL";

    registerMovement(activeMovementTab, sourceType);
  });

  document.getElementById("downloadTemplateBtn")?.addEventListener("click", downloadImportTemplate);

  document.getElementById("previewImportBtn")?.addEventListener("click", previewImportFile);

  document.getElementById("confirmImportBtn")?.addEventListener("click", () => {
    registerMovement(activeMovementTab, "IMPORT");
  });

  document.getElementById("movementHistorySearch")?.addEventListener("input", (event) => {
  movementHistoryFilters.search = event.target.value;
  refreshMovimentacoesPage("movementHistorySearch");
});

document.getElementById("movementHistoryDate")?.addEventListener("change", (event) => {
  movementHistoryFilters.date = event.target.value;
  refreshMovimentacoesPage();
});

document.getElementById("movementHistoryStatus")?.addEventListener("change", (event) => {
  movementHistoryFilters.status = event.target.value;
  refreshMovimentacoesPage();
});

document.querySelectorAll("[data-open-movement]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedMovementId = button.dataset.openMovement;
    isEditingMovement = false;
    refreshMovimentacoesPage();
  });
});

document.getElementById("closeMovementDetailBtn")?.addEventListener("click", closeMovementDetail);
document.getElementById("closeMovementDetailFooterBtn")?.addEventListener("click", closeMovementDetail);

document.getElementById("editMovementBtn")?.addEventListener("click", () => {
  isEditingMovement = true;
  refreshMovimentacoesPage();
});

document.getElementById("cancelEditMovementBtn")?.addEventListener("click", () => {
  isEditingMovement = false;
  refreshMovimentacoesPage();
});

document.getElementById("saveMovementEditBtn")?.addEventListener("click", saveMovementEdit);

document.getElementById("deleteMovementBtn")?.addEventListener("click", () => {
  movementDeleteTargetId = selectedMovementId;
  refreshMovimentacoesPage();
});

document.getElementById("cancelDeleteMovementBtn")?.addEventListener("click", () => {
  movementDeleteTargetId = null;
  refreshMovimentacoesPage();
});

document.getElementById("deleteMovementAwareCheck")?.addEventListener("change", (event) => {
  const button = document.getElementById("confirmDeleteMovementBtn");

  if (button) {
    button.disabled = !event.target.checked;
  }
});

document.getElementById("confirmDeleteMovementBtn")?.addEventListener("click", deleteMovement);

document.getElementById("reprocessMovementBtn")?.addEventListener("click", () => {
  movementReprocessTargetId = selectedMovementId;
  refreshMovimentacoesPage();
});

document.getElementById("cancelReprocessMovementBtn")?.addEventListener("click", () => {
  movementReprocessTargetId = null;
  refreshMovimentacoesPage();
});

document.getElementById("reprocessMovementAwareCheck")?.addEventListener("change", (event) => {
  const button = document.getElementById("confirmReprocessMovementBtn");

  if (button) {
    button.disabled = !event.target.checked;
  }
});

document.getElementById("confirmReprocessMovementBtn")?.addEventListener("click", reprocessMovement);

document.querySelectorAll(".add-draft-lot-btn").forEach((button) => {
  button.addEventListener("click", () => {
    captureMovementFormState();
    captureDraftLots();

    const index = Number(button.dataset.index);

    movementDraftItems[index].lots.push({
      id: crypto.randomUUID(),
      lotCode: "",
      quantity: 0,
      secondaryQuantity: "",
      secondaryUnit: movementDraftItems[index].secondaryUnit || ""
    });

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".remove-draft-lot-btn").forEach((button) => {
  button.addEventListener("click", () => {
    captureMovementFormState();
    captureDraftLots();

    const index = Number(button.dataset.index);
    const lotIndex = Number(button.dataset.lotIndex);

    movementDraftItems[index].lots.splice(lotIndex, 1);

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".draft-lot-code, .draft-lot-quantity, .draft-lot-secondary-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    captureMovementFormState();
    captureDraftLots();

    if (input.classList.contains("draft-lot-quantity")) {
      const item = movementDraftItems[Number(input.dataset.index)];
      const lot = item?.lots?.[Number(input.dataset.lotIndex)];
      syncRenderedSecondaryQuantity(input, item, lot, lot?.quantity, ".draft-lot-secondary-quantity");
    }

    const row = input.closest(".purchase-lots-box");
    const tableRow = row?.closest("tr")?.previousElementSibling;
    const quantityCell = tableRow?.querySelector(".lot-total-valid, .lot-total-invalid");

    if (quantityCell) {
      quantityCell.classList.remove("lot-total-valid", "lot-total-invalid");
    }
  });
});

document.querySelectorAll(".add-edit-lot-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const item = lineStore.stockMovementItems.find((movementItem) => {
      return movementItem.id === button.dataset.itemId;
    });

    if (!item) return;

    if (!item.lots) {
      item.lots = [];
    }

    item.lots.push({
      id: crypto.randomUUID(),
      lotCode: "",
      quantity: 0,
      secondaryQuantity: "",
      secondaryUnit: item.secondaryUnit || ""
    });

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".remove-edit-lot-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const item = lineStore.stockMovementItems.find((movementItem) => {
      return movementItem.id === button.dataset.itemId;
    });

    if (!item) return;

    const lotIndex = Number(button.dataset.lotIndex);

    item.lots.splice(lotIndex, 1);

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll("[data-open-attachment]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.stopPropagation();

    const movement = lineStore.stockMovements.find((item) => {
      return item.id === button.dataset.openAttachment;
    });

    if (!movement?.attachmentUrl) {
      alert("O anexo foi registrado, mas o arquivo ainda não está disponível para visualização nesta sessão.");
      return;
    }

    window.open(movement.attachmentUrl, "_blank");
  });
});

document.getElementById("movementAttachment")?.addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  purchaseAttachmentFile = file;

  if (purchaseAttachmentUrl) {
    URL.revokeObjectURL(purchaseAttachmentUrl);
  }

  purchaseAttachmentUrl = URL.createObjectURL(file);
});

document.querySelectorAll(".sale-lot-selected").forEach((input) => {
  input.addEventListener("change", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot) return;

    lot.selected = input.checked;

    if (lot.selected && lot.exitMode === "TOTAL") {
      lot.exitQuantity = lot.availableQuantity;
      lot.secondaryQuantity = lot.availableSecondaryQuantity ?? lot.secondaryQuantity ?? "";
    }

    applyLotSecondaryQuantity(item, lot, lot.exitQuantity);

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".sale-lot-mode").forEach((input) => {
  input.addEventListener("change", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot) return;

    lot.selected = true;
    lot.exitMode = input.value;
    lot.exitQuantity = input.value === "TOTAL" ? lot.availableQuantity : 0;
    lot.secondaryQuantity =
      input.value === "TOTAL" && item.secondaryUnitMode === "manual"
        ? lot.availableSecondaryQuantity ?? lot.secondaryQuantity ?? ""
        : lot.secondaryQuantity;
    applyLotSecondaryQuantity(item, lot, lot.exitQuantity);

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".sale-lot-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    const itemIndex = Number(input.dataset.index);
    const lotIndex = Number(input.dataset.lotIndex);

    const item = movementDraftItems[itemIndex];
    const lot = item?.lots?.[lotIndex];

    if (!lot) return;

    lot.selected = true;
    lot.exitMode = "PARTIAL";
    lot.exitQuantity = Number(input.value || 0);
    applyLotSecondaryQuantity(item, lot, lot.exitQuantity);
    syncRenderedSecondaryQuantity(input, item, lot, lot.exitQuantity, ".sale-lot-secondary-quantity");

    const lotsBox = input.closest(".purchase-lots-box");
    const itemRow = lotsBox?.closest("tr")?.previousElementSibling;
    const quantityCell = itemRow?.querySelector("td:nth-child(3)");

    if (quantityCell) {
      quantityCell.classList.remove("lot-total-valid", "lot-total-invalid");
      quantityCell.classList.add(getSaleDraftItemLotStatusClass(item));
    }
  });
});

document.querySelectorAll(".sale-lot-secondary-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot || item?.secondaryUnitMode === "fixed") return;

    lot.selected = true;
    lot.secondaryQuantity = Number(input.value || 0);
    lot.secondaryUnit = item.secondaryUnit || "";
  });
});

document.querySelectorAll(".sale-lot-filter").forEach((input) => {
  input.addEventListener("input", () => {
    const search = input.value.trim().toLowerCase();
    const box = input.closest(".purchase-lots-box");

    box?.querySelectorAll(".sale-lot-card").forEach((card) => {
      const text = card.dataset.lotText || "";
      card.style.display = !search || text.includes(search) ? "" : "none";
    });
  });
});

document.querySelectorAll(".sale-lot-picker-check").forEach((input) => {
  input.addEventListener("change", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot) return;

    lot.selected = input.checked;

    if (!lot.selected) {
      lot.exitQuantity = 0;
      lot.exitMode = "PARTIAL";
      lot.secondaryQuantity = "";
    }

    applyLotSecondaryQuantity(item, lot, lot.exitQuantity);
  });
});

document.querySelectorAll(".apply-sale-lot-selection-btn").forEach((button) => {
  button.addEventListener("click", () => {
    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".return-lot-filter, .return-lot-date-filter").forEach((input) => {
  input.addEventListener("input", applyReturnLotFilters);
  input.addEventListener("change", applyReturnLotFilters);
});

document.querySelectorAll(".adjustment-lot-picker-check").forEach((input) => {
  input.addEventListener("change", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot) return;

    lot.selected = input.checked;

    if (!lot.selected) {
      lot.adjustmentQuantity = 0;
      lot.finalQuantity = lot.availableQuantity;
      lot.secondaryQuantity = "";
    }
  });
});

document.querySelectorAll(".apply-adjustment-lot-selection-btn").forEach((button) => {
  button.addEventListener("click", () => {
    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".adjustment-lot-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot) return;

    const adjustmentQuantity = Number(input.value || 0);

    lot.selected = true;
    lot.adjustmentQuantity = adjustmentQuantity;
    lot.finalQuantity =
      adjustmentEntryMode === "INCREASE"
        ? Number(lot.availableQuantity || 0) + adjustmentQuantity
        : Number(lot.availableQuantity || 0) - adjustmentQuantity;

    applyLotSecondaryQuantity(item, lot, adjustmentQuantity);
    syncRenderedSecondaryQuantity(input, item, lot, adjustmentQuantity, ".adjustment-lot-secondary-quantity");
  });
});

document.querySelectorAll(".adjustment-lot-secondary-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot || item?.secondaryUnitMode === "fixed") return;

    lot.selected = true;
    lot.secondaryQuantity = Number(input.value || 0);
    lot.secondaryUnit = item.secondaryUnit || "";
  });
});

document.querySelectorAll(".inventory-counted-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    const index = Number(input.dataset.index);

    if (!inventoryCountItems[index]) return;

    inventoryCountItems[index].countedQuantity = Number(input.value || 0);
    applyLotSecondaryQuantity(inventoryCountItems[index], inventoryCountItems[index], inventoryCountItems[index].countedQuantity);

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".inventory-draft-lot-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot) return;

    lot.countedQuantity = Number(input.value || 0);
    applyLotSecondaryQuantity(item, lot, lot.countedQuantity);
    syncRenderedSecondaryQuantity(input, item, lot, lot.countedQuantity, ".inventory-draft-lot-secondary-quantity");

    refreshMovimentacoesPage();
  });
});

document.querySelectorAll(".inventory-draft-lot-secondary-quantity").forEach((input) => {
  input.addEventListener("input", () => {
    const item = movementDraftItems[Number(input.dataset.index)];
    const lot = item?.lots?.[Number(input.dataset.lotIndex)];

    if (!lot || item?.secondaryUnitMode === "fixed") return;

    lot.secondaryQuantity = Number(input.value || 0);
    lot.secondaryUnit = item.secondaryUnit || "";
  });
});

document.getElementById("generateInventoryPdfBtn")?.addEventListener("click", generateInventoryConferencePdf);

document.getElementById("downloadInventoryTemplateBtn")?.addEventListener("click", downloadInventoryTemplate);

document.getElementById("previewInventoryImportBtn")?.addEventListener("click", previewInventoryImportFile);

}



function applyReturnLotFilters(event) {
  const box = event.target.closest(".sale-lot-picker");
  const list = box?.querySelector(".sale-lot-picker-list");
const placeholder = box?.querySelector(".sale-lot-picker-placeholder");
  if (!box) return;

  const search = box.querySelector(".return-lot-filter")?.value.trim().toLowerCase() || "";
  const selectedDate = box.querySelector(".return-lot-date-filter")?.value || "";

  box.querySelectorAll(".return-lot-option").forEach((option) => {
    const text = option.dataset.lotText || "";
    const date = option.dataset.lotDate || "";

    const matchesSearch = !search || text.includes(search);
    const matchesDate = !selectedDate || date === selectedDate;

    const hasFilter = search || selectedDate;

if (list) {
  list.style.display = hasFilter ? "flex" : "none";
}

if (placeholder) {
  placeholder.style.display = hasFilter ? "none" : "block";
}

    option.style.display = matchesSearch && matchesDate ? "" : "none";
  });
}

function syncRenderedSecondaryQuantity(input, item, lot, primaryQuantity, selector) {
  if (!item?.secondaryUnit || item.secondaryUnitMode !== "fixed" || !lot) return;

  const secondaryInput = input.closest(".purchase-lot-row, .sale-lot-card")?.querySelector(selector);

  if (secondaryInput) {
    secondaryInput.value = calculateFixedSecondaryQuantity(item, primaryQuantity);
  }
}



function captureMovementFormState() {
  if (activeMovementTab === "SALE") {
    saleFormState = {
      date: document.getElementById("movementDate")?.value || saleFormState.date || getToday(),
      locationName: document.getElementById("movementLocation")?.value || saleFormState.locationName || "",
      stockExitMode: document.getElementById("movementStockExitMode")?.value || saleFormState.stockExitMode || "FIFO",
      fiscalNumber: document.getElementById("movementFiscalNumber")?.value || saleFormState.fiscalNumber || "",
      observation: document.getElementById("movementObservation")?.value || saleFormState.observation || ""
    };

    return;
  }

  if (activeMovementTab === "RETURN") {
  returnFormState = {
    date: document.getElementById("movementDate")?.value || returnFormState.date || getToday(),
    locationName: document.getElementById("movementLocation")?.value || returnFormState.locationName || "",
    stockExitMode: document.getElementById("movementStockExitMode")?.value || returnFormState.stockExitMode || "FIFO",
    observation: document.getElementById("movementObservation")?.value || returnFormState.observation || ""
  };

  return;
}

if (activeMovementTab === "TRANSFER") {
  transferFormState = {
    date: document.getElementById("movementDate")?.value || transferFormState.date || getToday(),
    originLocation: document.getElementById("movementOriginLocation")?.value || transferFormState.originLocation || "",
    destinationLocation: document.getElementById("movementDestinationLocation")?.value || transferFormState.destinationLocation || "",
    stockExitMode: document.getElementById("movementStockExitMode")?.value || transferFormState.stockExitMode || "FIFO",
    fiscalNumber: document.getElementById("movementFiscalNumber")?.value || transferFormState.fiscalNumber || "",
    observation: document.getElementById("movementObservation")?.value || transferFormState.observation || ""
  };

  return;
}

if (activeMovementTab === "ADJUSTMENT") {
  adjustmentFormState = {
    date: document.getElementById("movementDate")?.value || adjustmentFormState.date || getToday(),
    locationName: document.getElementById("movementLocation")?.value || adjustmentFormState.locationName || "",
    reason: document.getElementById("movementReason")?.value || adjustmentFormState.reason || ""
  };

  return;
}

if (activeMovementTab === "INVENTORY") {
  inventoryFormState = {
    date: document.getElementById("movementDate")?.value || inventoryFormState.date || getToday(),
    locationName: document.getElementById("movementLocation")?.value || inventoryFormState.locationName || "",
    observation: document.getElementById("movementObservation")?.value || inventoryFormState.observation || ""
  };

  return;
}

  movementFormState = {
    date: document.getElementById("movementDate")?.value || movementFormState.date || getToday(),
    supplierName: document.getElementById("movementSupplier")?.value || movementFormState.supplierName || "",
    locationName: document.getElementById("movementLocation")?.value || movementFormState.locationName || "",
    fiscalNumber: document.getElementById("movementFiscalNumber")?.value || movementFormState.fiscalNumber || "",
    observation: document.getElementById("movementObservation")?.value || movementFormState.observation || ""
  };
}

function addDraftItem() {
captureMovementFormState();

  const materialName = document.getElementById("movementMaterial")?.value;
  const quantity = Number(document.getElementById("movementQuantity")?.value || 0);

  if (!materialName || !quantity || quantity <= 0) {
    alert("Informe material e quantidade.");
    return;
  }

  const material = findMaterialByName(materialName);
  const secondaryData = getMaterialSecondaryData(material);

  const draftItem = {
    id: crypto.randomUUID(),
    materialName,
    materialCode: material?.code || material?.materialCode || "-",
    quantity,
    unit: material?.unit || "un",
    ...secondaryData,
    lots: []
  };

  draftItem.lots =
    activeMovementTab === "SALE"
      ? getAvailableLotsForSale(materialName, quantity)
      : activeMovementTab === "RETURN"
        ? getAvailableLotsForReturn(materialName, quantity)
        : activeMovementTab === "TRANSFER"
          ? getAvailableLotsForTransfer(materialName, quantity)
          : activeMovementTab === "ADJUSTMENT"
            ? getAvailableLotsForAdjustment(materialName)
            : activeMovementTab === "INVENTORY"
              ? getAvailableLotsForInventory(materialName)
              : activeMovementTab === "PURCHASE"
                ? [
                    {
                      id: crypto.randomUUID(),
                      lotCode: "",
                      quantity,
                      secondaryQuantity: "",
                      secondaryUnit: secondaryData.secondaryUnit
                    }
                  ]
                : [];

  draftItem.lots.forEach((lot) => {
    const primaryQuantity =
      activeMovementTab === "SALE" || activeMovementTab === "RETURN" || activeMovementTab === "TRANSFER"
        ? lot.exitQuantity
        : activeMovementTab === "ADJUSTMENT"
          ? lot.adjustmentQuantity
          : activeMovementTab === "INVENTORY"
            ? lot.countedQuantity
            : lot.quantity;

    applyLotSecondaryQuantity(draftItem, lot, primaryQuantity);
  });

  movementDraftItems.push(draftItem);

  refreshMovimentacoesPage();
}

function validateSaleLots(items) {
  for (const item of items) {
    if (!item.lots?.length) {
      return {
        valid: false,
        title: "Lotes não encontrados",
        message: `Nenhum lote disponível para o material ${item.materialName}.`
      };
    }

    for (const lot of item.lots) {
  if (!lot.selected) continue;

  if (Number(lot.exitQuantity || 0) > Number(lot.availableQuantity || 0)) {
    return {
      valid: false,
      title: "Quantidade maior que disponível",
      message: `O lote ${lot.lotCode} do material ${item.materialName} não possui saldo suficiente para esta baixa.`
    };
  }
}

    const total = item.lots.reduce((sum, lot) => {
      if (!lot.selected) return sum;
      return sum + Number(lot.exitQuantity || 0);
    }, 0);

    if (Math.abs(total - Number(item.quantity || 0)) > 0.0001) {
      return {
        valid: false,
        title: "Quantidade dos lotes divergente",
        message: `A soma dos lotes do material ${item.materialName} precisa bater exatamente com a quantidade vendida.`
      };
    }
  }

  return { valid: true };
}

function validateManualSecondaryLots(items, type) {
  for (const item of items) {
    if (!item.secondaryUnit || item.secondaryUnitMode === "fixed") continue;

    const lots = item.lots || [];

    for (const lot of lots) {
      const primaryQuantity =
        type === "SALE" || type === "RETURN" || type === "TRANSFER"
          ? Number(lot.exitQuantity || 0)
          : type === "ADJUSTMENT"
            ? Number(lot.adjustmentQuantity || 0)
            : type === "INVENTORY"
              ? Number(lot.countedQuantity || 0)
              : Number(lot.quantity || 0);

      if (primaryQuantity <= 0) continue;

      if (lot.secondaryQuantity === undefined || lot.secondaryQuantity === null || lot.secondaryQuantity === "") {
        return {
          valid: false,
          title: "Quantidade secundária obrigatória",
          message: `Informe a quantidade secundária do lote ${lot.lotCode || "-"} no material ${item.materialName}.`
        };
      }
    }
  }

  return { valid: true };
}

function registerMovement(type, sourceType) {
  const items = sourceType === "IMPORT" ? importPreviewItems : movementDraftItems;

  if (!items.length) {
    alert("Adicione pelo menos um item.");
    return;
  }

  if ((type === "SALE" || type === "RETURN") && sourceType === "IMPORT") {
  const hasImportErrors = items.some((item) => item.errors?.length);

  if (hasImportErrors) {
    movementSystemNotice = {
      type: "danger",
      title: "Importação bloqueada",
      message: "Corrija os erros da prévia antes de confirmar a importação."
    };

    refreshMovimentacoesPage();
    return;
  }
}

  if (sourceType === "IMPORT" && hasImportDuplicity(type)) {
    const confirmDuplicate = confirm(
      "Já existe uma importação registrada para esta data e local. Deseja continuar mesmo assim?"
    );

    if (!confirmDuplicate) return;
  }

  captureDraftLots();

if (type === "PURCHASE") {
  const lotValidation = validatePurchaseLots(items);

  if (!lotValidation.valid) {
    movementSystemNotice = {
      type: "danger",
      title: lotValidation.title,
      message: lotValidation.message
    };

    refreshMovimentacoesPage();
    return;
  }
}

if (type === "SALE" || type === "RETURN" || type === "TRANSFER") {
  const saleValidation = validateSaleLots(items);

  if (!saleValidation.valid) {
    movementSystemNotice = {
      type: "danger",
      title: saleValidation.title,
      message: saleValidation.message
    };

    refreshMovimentacoesPage();
    return;
  }
}

const secondaryValidation = validateManualSecondaryLots(items, type);

if (!secondaryValidation.valid) {
  movementSystemNotice = {
    type: "danger",
    title: secondaryValidation.title,
    message: secondaryValidation.message
  };

  refreshMovimentacoesPage();
  return;
}

if (type === "TRANSFER") {
  const origin = document.getElementById("movementOriginLocation")?.value || "";
  const destination = document.getElementById("movementDestinationLocation")?.value || "";

  if (!origin || !destination) {
    movementSystemNotice = {
      type: "danger",
      title: "Origem e destino obrigatórios",
      message: "Informe o local de origem e o local de destino da transferência."
    };

    refreshMovimentacoesPage();
    return;
  }

  if (origin === destination) {
    movementSystemNotice = {
      type: "danger",
      title: "Locais iguais",
      message: "O local de origem não pode ser igual ao local de destino."
    };

    refreshMovimentacoesPage();
    return;
  }
}

  const movement = buildMovementHeader(type, sourceType);

  lineStore.stockMovements.unshift(movement);

  items.forEach((item) => {
  lineStore.stockMovementItems.unshift({
    id: crypto.randomUUID(),
    movementId: movement.id,
    materialName: item.materialName,
    materialCode: item.materialCode,
    quantity: Number(item.quantity || 0),
    unit: item.unit,
    secondaryUnit: item.secondaryUnit || "",
    secondaryUnitMode: item.secondaryUnitMode || "manual",
    fixedPrimaryQuantity: item.fixedPrimaryQuantity || "",
    fixedSecondaryQuantity: item.fixedSecondaryQuantity || "",
    lots: (item.lots || []).map((lot) => {
  const movementQuantity =
    (type === "SALE" || type === "RETURN" || type === "TRANSFER")
      ? Number(lot.exitQuantity || 0)
      : type === "ADJUSTMENT"
        ? Number(lot.adjustmentQuantity || 0)
        : type === "INVENTORY"
          ? Number(lot.countedQuantity || 0)
          : Number(lot.quantity || 0);

  const lotPayload = {
    ...lot,

    movementQuantity,

    quantity: movementQuantity,
    secondaryUnit: item.secondaryUnit || lot.secondaryUnit || "",

    movementType: type,

    locationName:
      type === "TRANSFER"
        ? transferFormState.originLocation
        : type === "SALE"
          ? saleFormState.locationName
          : type === "RETURN"
            ? returnFormState.locationName
            : type === "ADJUSTMENT"
              ? adjustmentFormState.locationName
              : type === "INVENTORY"
                ? inventoryFormState.locationName
                : movementFormState.locationName
  };

  applyLotSecondaryQuantity(item, lotPayload, movementQuantity);

  return lotPayload;
})
  });
});

  if (sourceType === "IMPORT") {
    registerImportControl(type, movement);
  }

  movementSystemNotice = null;

  movementDraftItems = [];
  importPreviewItems = [];

  movementFormState = createPurchaseFormState(getToday);
  saleFormState = createSaleFormState(getToday);

  returnFormState = createReturnFormState(getToday);
  transferFormState = createTransferFormState(getToday);

purchaseAttachmentFile = null;
purchaseAttachmentUrl = "";

  refreshMovimentacoesPage();
}

function buildMovementHeader(type, sourceType) {
  const tab = movementTabs.find((item) => item.key === type);
  const attachment = purchaseAttachmentFile || document.getElementById("movementAttachment")?.files?.[0];
  const importFile = document.getElementById("importFileInput")?.files?.[0];

  return {
    id: crypto.randomUUID(),
    type,
    typeLabel: tab.label,
    sourceType,
    sourceLabel: sourceType === "IMPORT" ? "Importação" : "Manual",
    dateTime:
  sourceType === "IMPORT" && type !== "INVENTORY"
    ? `${getToday()}T12:00:00`
    : document.getElementById("movementDate")?.value || new Date().toISOString(),

movementDate:
  sourceType === "IMPORT" && type !== "INVENTORY"
    ? getToday()
    : getDateOnly(document.getElementById("movementDate")?.value),
    locationName:
  document.getElementById("movementLocation")?.value ||
  document.getElementById("importLocation")?.value ||
  "",

supplierName:
  document.getElementById("movementSupplier")?.value || "",
  stockExitMode:
  document.getElementById("movementStockExitMode")?.value ||
  document.getElementById("importStockExitMode")?.value ||
  "",

stockExitModeLabel:
  type === "TRANSFER"
    ? getTransferModeLabel(
        document.getElementById("movementStockExitMode")?.value ||
        document.getElementById("importStockExitMode")?.value ||
        ""
      )
    : type === "RETURN"
      ? getReturnModeLabel(
          document.getElementById("movementStockExitMode")?.value ||
          document.getElementById("importStockExitMode")?.value ||
          ""
        )
      : getSaleExitModeLabel(
          document.getElementById("movementStockExitMode")?.value ||
          document.getElementById("importStockExitMode")?.value ||
          ""
        ),
    originLocation: document.getElementById("movementOriginLocation")?.value || "",
    destinationLocation: document.getElementById("movementDestinationLocation")?.value || "",
    fiscalNumber: document.getElementById("movementFiscalNumber")?.value || "",
    attachmentName: attachment?.name || importFile?.name || "",
attachmentUrl: purchaseAttachmentUrl || (attachment ? URL.createObjectURL(attachment) : ""),
    reason: document.getElementById("movementReason")?.value || "",
    observation: document.getElementById("movementObservation")?.value || "",
    status: "Processado",
    responsibleName: "Usuário atual",
    createdAt: new Date().toISOString()
  };
}

async function previewImportFile() {
  const file = document.getElementById("importFileInput")?.files?.[0];

  if (!file) {
    alert("Selecione um arquivo para leitura.");
    return;
  }

  const selectedExitMode =
    document.getElementById("importStockExitMode")?.value ||
    saleFormState.stockExitMode ||
    "FIFO";

  if (activeMovementTab === "RETURN") {
  returnFormState.stockExitMode = selectedExitMode;
} else if (activeMovementTab === "TRANSFER") {
  transferFormState.stockExitMode = selectedExitMode;
} else {
  saleFormState.stockExitMode = selectedExitMode;
}

  const text = await file.text();
  const rows = parseSalesImportCsv(text);

  if (!rows.length) {
    movementSystemNotice = {
      type: "danger",
      title: "Arquivo vazio ou inválido",
      message: "Não encontramos linhas válidas para importar."
    };

    importPreviewItems = [];
    refreshMovimentacoesPage();
    return;
  }

  importPreviewItems = rows.map((row, index) => {
    return buildSaleImportPreviewItem(row, index + 2, selectedExitMode);
  });

  const hasErrors = importPreviewItems.some((item) => item.errors?.length);

  movementSystemNotice = hasErrors
    ? {
        type: "danger",
        title: "Importação com erros",
        message: "Existem linhas com inconsistência. Corrija o arquivo e leia novamente antes de confirmar."
      }
    : null;

  refreshMovimentacoesPage();
}

function parseSalesImportCsv(text) {
  const cleanText = String(text || "").replace(/\r/g, "").trim();

  if (!cleanText) return [];

  const lines = cleanText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return [];

  const delimiter = lines[0].includes(";") ? ";" : ",";
  const headers = splitCsvLine(lines[0], delimiter).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);

    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return row;
  }).filter((row) => {
    return Object.values(row).some((value) => String(value || "").trim());
  });
}

function splitCsvLine(line, delimiter) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (const char of line) {
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());

  return result;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeCode(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function parseImportQuantity(value) {
  const text = String(value || "").trim();

  if (!text) return 0;

  if (text.includes(",")) {
    return Number(text.replace(/\./g, "").replace(",", "."));
  }

  return Number(text);
}

function parseImportDate(value) {
  const text = String(value || "").trim();

  if (!text) return {
    value: "",
    formatted: "-",
    valid: false
  };

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return {
      value: text,
      formatted: formatDateOnly(text),
      valid: true
    };
  }

  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    const value = `${year}-${month}-${day}`;

    return {
      value,
      formatted: `${day}/${month}/${year}`,
      valid: true
    };
  }

  return {
    value: text,
    formatted: text,
    valid: false
  };
}

function findMaterialByImportData(materialCode, materialName) {
  const code = normalizeCode(materialCode);
  const name = normalizeText(materialName);

  const materials = getMaterialSource();

  if (code) {
    const byCode = materials.find((material) => {
      return normalizeCode(material.code || material.materialCode) === code;
    });

    if (byCode) return byCode;
  }

  if (name) {
    return materials.find((material) => {
      return normalizeText(material.name || material.materialName) === name;
    });
  }

  return null;
}

function buildSaleImportPreviewItem(row, importRowNumber, stockExitMode) {
  const errors = [];

  const saleDate = parseImportDate(row.data);
  const quantity = parseImportQuantity(row.quantidade);

  const material = findMaterialByImportData(
    row.material_codigo,
    row.material_nome
  );

  if (!saleDate.valid) {
    errors.push("Data inválida ou não informada.");
  }

  if (!material) {
    errors.push("Material não encontrado pelo código ou nome informado.");
  }

  if (!quantity || quantity <= 0 || Number.isNaN(quantity)) {
    errors.push("Quantidade inválida.");
  }

  const materialName = material?.name || material?.materialName || row.material_nome || "-";
  const materialCode = material?.code || material?.materialCode || row.material_codigo || "-";
  const unit = material?.unit || row.unidade || "un";
  const secondaryData = getMaterialSecondaryData(material);
  const importedSecondaryQuantity = parseImportQuantity(row.quantidade_secundaria);

  if (material && row.material_nome) {
    const registeredName = normalizeText(material.name || material.materialName);
    const importedName = normalizeText(row.material_nome);

    if (registeredName !== importedName) {
      errors.push("Nome do material diferente do cadastro.");
    }
  }

  if (material && row.unidade) {
    const registeredUnit = normalizeText(material.unit || "un");
    const importedUnit = normalizeText(row.unidade);

    if (registeredUnit !== importedUnit) {
      errors.push("Unidade diferente do cadastro.");
    }
  }

  const lots =
  stockExitMode === "LOT"
    ? buildManualImportLots({
        materialName,
        quantity,
        secondaryData,
        secondaryQuantity: importedSecondaryQuantity,
        lotCode: row.lote_codigo,
        errors
      })
    : buildFifoImportLots({
        materialName,
        quantity,
        secondaryData,
        secondaryQuantity: importedSecondaryQuantity,
        errors
      });

  return {
    id: crypto.randomUUID(),
    importRowNumber,
    saleDate: saleDate.value,
    saleDateFormatted: saleDate.formatted,
    materialName,
    materialCode,
    quantity,
    unit,
    ...secondaryData,
    lots,
    errors
  };
}

function buildManualImportLots({ materialName, quantity, secondaryData, secondaryQuantity, lotCode, errors }) {
  const cleanLotCode = String(lotCode || "").trim();

  if (!cleanLotCode) {
    errors.push("Lote não informado para baixa manual por lote.");
    return [];
  }

  const availableLots = getAvailableLotsForSale(materialName, 0);
  const lot = availableLots.find((item) => {
    return normalizeCode(item.lotCode) === normalizeCode(cleanLotCode);
  });

  if (!lot) {
    errors.push(`Lote ${cleanLotCode} não encontrado para este material.`);
    return [];
  }

  if (quantity > Number(lot.availableQuantity || 0)) {
    errors.push(`Lote ${cleanLotCode} não possui saldo suficiente.`);
  }

  const payload = {
    ...lot,
    selected: true,
    exitMode: "PARTIAL",
    exitQuantity: quantity,
    quantity,
    secondaryUnit: secondaryData.secondaryUnit || ""
  };

  if (secondaryData.secondaryUnitMode === "manual" && secondaryQuantity > 0) {
    payload.secondaryQuantity = secondaryQuantity;
  }

  applyLotSecondaryQuantity(secondaryData, payload, quantity);

  return [payload];
}

function buildFifoImportLots({ materialName, quantity, secondaryData, secondaryQuantity, errors }) {
  const lots = getAvailableLotsForSale(materialName, quantity);
  const selectedTotal = lots.reduce((sum, lot) => {
    if (!lot.selected) return sum;
    return sum + Number(lot.exitQuantity || 0);
  }, 0);

  if (Math.abs(selectedTotal - Number(quantity || 0)) > 0.0001) {
    errors.push("Saldo insuficiente para baixa automática FIFO.");
  }

  const selectedLots = lots.filter((lot) => lot.selected && Number(lot.exitQuantity || 0) > 0);

  return lots.map((lot) => {
    const quantity = Number(lot.exitQuantity || 0);
    const payload = {
      ...lot,
      quantity,
      secondaryUnit: secondaryData.secondaryUnit || ""
    };

    if (
      secondaryData.secondaryUnitMode === "manual" &&
      selectedLots.length === 1 &&
      lot.selected &&
      secondaryQuantity > 0
    ) {
      payload.secondaryQuantity = secondaryQuantity;
    }

    applyLotSecondaryQuantity(secondaryData, payload, quantity);

    return payload;
  });
}

function hasImportDuplicity(type) {
  return false;
}

function registerImportControl(type, movement) {
  lineStore.stockImportControls.push({
    id: crypto.randomUUID(),
    type,
    date: movement.movementDate,
    locationName: movement.locationName,
    movementId: movement.id,
    createdAt: new Date().toISOString()
  });
}

function downloadImportTemplate() {
  const header = "data;material_codigo;material_nome;quantidade;unidade;lote_codigo;quantidade_secundaria\n";
  const blob = new Blob([header], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "modelo-importacao-vendas-line.csv";
  link.click();

  URL.revokeObjectURL(url);
}

function downloadInventoryTemplate() {
  captureMovementFormState();

  const locationName = inventoryFormState.locationName;

  if (!locationName) {
    alert("Selecione um local para baixar o modelo do inventário.");
    return;
  }

  const items = inventoryCountItems.length
    ? inventoryCountItems
    : buildInventoryCountItemsByLocation(locationName);

  const header = "local;material_codigo;material_nome;lote_codigo;quantidade_sistema;quantidade_contada;unidade;quantidade_secundaria_sistema;quantidade_secundaria_contada;unidade_secundaria\n";

  const rows = items.map((item) => {
    return [
      locationName,
      item.materialCode,
      item.materialName,
      item.lotCode,
      String(item.systemQuantity || 0).replace(".", ","),
      "",
      item.unit,
      item.secondaryUnit ? String(item.systemSecondaryQuantity || 0).replace(".", ",") : "",
      "",
      item.secondaryUnit || ""
    ].join(";");
  });

  const csv = header + rows.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `modelo-inventario-${normalizeCode(locationName)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

async function previewInventoryImportFile() {
  captureMovementFormState();

  const locationName = inventoryFormState.locationName;
  const file = document.getElementById("inventoryImportFileInput")?.files?.[0];

  if (!locationName) {
    alert("Selecione o local do inventário antes de ler o arquivo.");
    return;
  }

  if (!file) {
    alert("Selecione um arquivo para leitura.");
    return;
  }

  const text = await file.text();
  const rows = parseSalesImportCsv(text);
  const baseItems = buildInventoryCountItemsByLocation(locationName);

  importPreviewItems = rows.map((row) => {
    const materialCode = row.material_codigo || "";
    const materialName = row.material_nome || "";
    const lotCode = row.lote_codigo || "";
    const countedQuantity = parseImportQuantity(row.quantidade_contada);
    const countedSecondaryQuantity = parseImportQuantity(row.quantidade_secundaria_contada);
    const errors = [];

    const systemItem = baseItems.find((item) => {
      return normalizeCode(item.materialCode) === normalizeCode(materialCode) &&
        normalizeCode(item.lotCode) === normalizeCode(lotCode);
    });

    if (!systemItem) {
      errors.push("Material/lote não encontrado para este local.");
    }

    if (countedQuantity < 0 || Number.isNaN(countedQuantity)) {
      errors.push("Quantidade contada inválida.");
    }

    const previewItem = {
      id: crypto.randomUUID(),
      materialName: systemItem?.materialName || materialName || "-",
      materialCode: systemItem?.materialCode || materialCode || "-",
      lotCode: systemItem?.lotCode || lotCode || "-",
      unit: systemItem?.unit || row.unidade || "un",
      sourceLotId: systemItem?.sourceLotId || "",
      systemQuantity: Number(systemItem?.systemQuantity || 0),
      systemSecondaryQuantity: Number(systemItem?.systemSecondaryQuantity || 0),
      countedQuantity,
      secondaryUnit: systemItem?.secondaryUnit || row.unidade_secundaria || "",
      secondaryUnitMode: systemItem?.secondaryUnitMode || "manual",
      fixedPrimaryQuantity: systemItem?.fixedPrimaryQuantity || "",
      fixedSecondaryQuantity: systemItem?.fixedSecondaryQuantity || "",
      secondaryQuantity: countedSecondaryQuantity || "",
      quantity: countedQuantity,
      lots: [
        {
          id: crypto.randomUUID(),
          lotCode: systemItem?.lotCode || lotCode || "-",
          sourceLotId: systemItem?.sourceLotId || "",
          systemQuantity: Number(systemItem?.systemQuantity || 0),
          countedQuantity,
          quantity: countedQuantity,
          secondaryQuantity: countedSecondaryQuantity || "",
          secondaryUnit: systemItem?.secondaryUnit || row.unidade_secundaria || ""
        }
      ],
      difference: countedQuantity - Number(systemItem?.systemQuantity || 0),
      errors
    };

    applyLotSecondaryQuantity(previewItem, previewItem.lots[0], countedQuantity);

    return previewItem;
  });

  movementSystemNotice = importPreviewItems.some((item) => item.errors?.length)
    ? {
        type: "danger",
        title: "Importação com erros",
        message: "Existem linhas com inconsistência. Corrija o arquivo antes de fechar o inventário."
      }
    : null;

  refreshMovimentacoesPage();
}

function generateInventoryConferencePdf() {
  captureMovementFormState();

  const locations = getLocationsByMode("stock");
  const printedAt = new Date().toLocaleString("pt-BR");

  const html = `
    <html>
      <head>
        <title>Inventário Line</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
          h1 { margin: 0 0 6px; }
          .meta { color: #6b7280; margin-bottom: 24px; }
          .location { page-break-before: always; margin-top: 28px; }
          .location:first-of-type { page-break-before: auto; }
          h2 { background: #facc15; padding: 10px 12px; border-radius: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
          th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; }
          th { background: #f3f4f6; text-align: left; }
          .count-box { height: 24px; border: 1px solid #111827; border-radius: 4px; }
          .material-row { background: #f9fafb; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Inventário de Estoque — Catrion Line</h1>
        <div class="meta">Impresso em: ${printedAt}</div>

        ${locations.map((location) => {
          const locationItems = buildInventoryCountItemsByLocation(location.name);

          return `
            <div class="location">
              <h2>${location.name}</h2>

              <table>
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Código</th>
                    <th>Lote</th>
                    <th>Qtd. sistema</th>
                    <th>Contagem</th>
                  </tr>
                </thead>

                <tbody>
                  ${
                    locationItems.length
                      ? locationItems.map((item) => `
                          <tr>
                            <td>${item.materialName}</td>
                            <td>${item.materialCode}</td>
                            <td>${item.lotCode || "-"}</td>
                            <td>${formatNumber(item.systemQuantity)} ${item.unit}</td>
                            <td><div class="count-box"></div></td>
                          </tr>
                        `).join("")
                      : `
                        <tr>
                          <td colspan="5">Nenhum lote encontrado neste local.</td>
                        </tr>
                      `
                  }
                </tbody>
              </table>
            </div>
          `;
        }).join("")}
      </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function renderLocationOptions(mode) {
  const locations = getLocationsByMode(mode);

  if (!locations.length) {
    return `<option value="">Nenhum local disponível</option>`;
  }

  return `
    <option value="">Selecione um local</option>
    ${locations
      .map((location) => `<option value="${location.name}">${location.name}</option>`)
      .join("")}
  `;
}

function getLocationsByMode(mode) {
  const locations = getActiveItems(lineStore.locations || []);

  const filtered = locations.filter((location) => {
    if (mode === "sale") {
      return hasTruthyFlag(location, [
        "isSaleLocation",
        "saleLocation",
        "localVenda",
        "isSalesLocation"
      ]);
    }

    return hasTruthyFlag(location, [
      "isStockLocation",
      "stockLocation",
      "localEstoque",
      "isInventoryLocation"
    ]);
  });

  return filtered.length ? filtered : locations;
}

function hasTruthyFlag(item, keys) {
  return keys.some((key) => item[key] === true || item[key] === "Sim");
}

function renderMaterialOptions() {
  const materials = getMaterialSource();

  if (!materials.length) {
    return `<option value="">Nenhum material disponível</option>`;
  }

  return `
    <option value="">Selecione um material</option>
    ${materials
      .map((material) => {
        const name = material.name || material.materialName;

        return `<option value="${name}">${name}</option>`;
      })
      .join("")}
  `;
}

function getMaterialSource() {
  const registeredMaterials = getActiveItems(lineStore.materials || []);

  if (registeredMaterials.length) return registeredMaterials;

  return lineStore.stockBalances || [];
}

function findMaterialByName(name) {
  return getMaterialSource().find((material) => {
    return material.name === name || material.materialName === name;
  });
}

function getAvailableLotsForSale(materialName, requestedQuantity = 0) {
  let lots = [];

  lineStore.stockMovementItems.forEach((item) => {
    if (item.materialName !== materialName) return;

    const movement = lineStore.stockMovements.find((movementItem) => {
      return movementItem.id === item.movementId;
    });

    if (!movement || movement.type !== "PURCHASE" || movement.status === "Cancelado") return;

    (item.lots || []).forEach((lot) => {
      lots.push({
        id: crypto.randomUUID(),
        sourceLotId: lot.id,
        lotCode: lot.lotCode,
        availableQuantity: Number(lot.quantity || 0),
        availableSecondaryQuantity: Number(lot.secondaryQuantity || 0),
        secondaryUnit: item.secondaryUnit || "",
        selected: false,
        exitMode: "PARTIAL",
        exitQuantity: 0
      });
    });
  });

  if (saleFormState.stockExitMode === "FIFO") {
    let remaining = Number(requestedQuantity || 0);

    return lots.map((lot) => {
      const quantityToExit = Math.min(lot.availableQuantity, remaining);

      remaining -= quantityToExit;

      return {
        ...lot,
        selected: quantityToExit > 0,
        exitMode: "FIFO",
        exitQuantity: quantityToExit
      };
    });
  }

  return lots;
}

function getAvailableLotsForTransfer(materialName, requestedQuantity = 0) {
  const originLocation = document.getElementById("movementOriginLocation")?.value || transferFormState.originLocation || "";

  if (!originLocation) return [];

  let lots = [];

  lineStore.stockMovementItems.forEach((item) => {
    if (item.materialName !== materialName) return;

    const movement = lineStore.stockMovements.find((movementItem) => {
      return movementItem.id === item.movementId;
    });

    if (!movement || movement.status === "Cancelado") return;

    const isPurchaseInOrigin =
      movement.type === "PURCHASE" &&
      movement.locationName === originLocation;

    const isTransferInOrigin =
      movement.type === "TRANSFER" &&
      movement.destinationLocation === originLocation;

    if (!isPurchaseInOrigin && !isTransferInOrigin) return;

    (item.lots || []).forEach((lot) => {
      const availableQuantity = Number(lot.quantity || lot.exitQuantity || 0);

      if (availableQuantity <= 0) return;

      lots.push({
        id: crypto.randomUUID(),
        sourceLotId: lot.sourceLotId || lot.id,
        lotCode: lot.lotCode,
        availableQuantity,
        availableSecondaryQuantity: Number(lot.secondaryQuantity || 0),
        secondaryUnit: item.secondaryUnit || "",
        selected: false,
        exitMode: "PARTIAL",
        exitQuantity: 0
      });
    });
  });

  if (transferFormState.stockExitMode === "FIFO") {
    let remaining = Number(requestedQuantity || 0);

    return lots.map((lot) => {
      const quantityToExit = Math.min(lot.availableQuantity, remaining);

      remaining -= quantityToExit;

      return {
        ...lot,
        selected: quantityToExit > 0,
        exitMode: "FIFO",
        exitQuantity: quantityToExit
      };
    });
  }

  return lots;
}

function getAvailableLotsForAdjustment(materialName) {
  const locationName =
    document.getElementById("movementLocation")?.value ||
    adjustmentFormState.locationName ||
    "";

  if (!locationName) return [];

  const lots = [];

  lineStore.stockMovementItems.forEach((item) => {
    if (item.materialName !== materialName) return;

    const movement = lineStore.stockMovements.find((movementItem) => {
      return movementItem.id === item.movementId;
    });

    if (!movement || movement.status === "Cancelado") return;

    const isPurchaseInLocation =
      movement.type === "PURCHASE" &&
      movement.locationName === locationName;

    const isTransferInLocation =
      movement.type === "TRANSFER" &&
      movement.destinationLocation === locationName;

    if (!isPurchaseInLocation && !isTransferInLocation) return;

    (item.lots || []).forEach((lot) => {
      const availableQuantity = Number(lot.quantity || lot.exitQuantity || 0);

      if (availableQuantity <= 0) return;

      lots.push({
        id: crypto.randomUUID(),
        sourceLotId: lot.sourceLotId || lot.id,
        lotCode: lot.lotCode,
        availableQuantity,
        availableSecondaryQuantity: Number(lot.secondaryQuantity || 0),
        secondaryUnit: item.secondaryUnit || "",
        selected: false,
        adjustmentType: adjustmentEntryMode,
        adjustmentQuantity: 0,
        finalQuantity: availableQuantity
      });
    });
  });

  return lots;
}

function buildInventoryCountItemsByLocation(locationName) {
  if (!locationName) return [];

  const items = [];

  lineStore.stockMovementItems.forEach((item) => {
    const movement = lineStore.stockMovements.find((movementItem) => {
      return movementItem.id === item.movementId;
    });

    if (!movement || movement.status === "Cancelado") return;

    const isPurchaseInLocation =
      movement.type === "PURCHASE" &&
      movement.locationName === locationName;

    const isTransferInLocation =
      movement.type === "TRANSFER" &&
      movement.destinationLocation === locationName;

    if (!isPurchaseInLocation && !isTransferInLocation) return;

    (item.lots || []).forEach((lot) => {
      const systemQuantity = Number(lot.quantity || lot.exitQuantity || 0);
      const material = findMaterialByName(item.materialName) || {};
      const secondaryData = {
        ...getMaterialSecondaryData(material),
        secondaryUnit: item.secondaryUnit || material.secondaryUnit || ""
      };

      if (systemQuantity <= 0) return;

      items.push({
        id: crypto.randomUUID(),
        materialName: item.materialName,
        materialCode: item.materialCode,
        unit: item.unit,
        ...secondaryData,
        lotCode: lot.lotCode,
        sourceLotId: lot.sourceLotId || lot.id,
        systemQuantity,
        systemSecondaryQuantity: Number(lot.secondaryQuantity || 0),
        countedQuantity: "",
        countedSecondaryQuantity: "",
        difference: 0
      });
    });
  });

  return items;
}

function getAvailableLotsForInventory(materialName) {
  const locationName =
    document.getElementById("movementLocation")?.value ||
    inventoryFormState.locationName ||
    "";

  if (!locationName) return [];

  const lots = [];

  lineStore.stockMovementItems.forEach((item) => {
    if (item.materialName !== materialName) return;

    const movement = lineStore.stockMovements.find((movementItem) => {
      return movementItem.id === item.movementId;
    });

    if (!movement || movement.status === "Cancelado") return;

    const isPurchaseInLocation =
      movement.type === "PURCHASE" &&
      movement.locationName === locationName;

    const isTransferInLocation =
      movement.type === "TRANSFER" &&
      movement.destinationLocation === locationName;

    if (!isPurchaseInLocation && !isTransferInLocation) return;

    (item.lots || []).forEach((lot) => {
      const systemQuantity = Number(lot.quantity || lot.exitQuantity || 0);
      const material = findMaterialByName(item.materialName) || {};
      const secondaryData = {
        ...getMaterialSecondaryData(material),
        secondaryUnit: item.secondaryUnit || material.secondaryUnit || ""
      };

      if (systemQuantity <= 0) return;

      lots.push({
        id: crypto.randomUUID(),
        sourceLotId: lot.sourceLotId || lot.id,
        lotCode: lot.lotCode,
        ...secondaryData,
        systemQuantity,
        systemSecondaryQuantity: Number(lot.secondaryQuantity || 0),
        countedQuantity: "",
        countedSecondaryQuantity: "",
        quantity: systemQuantity
      });
    });
  });

  return lots;
}

function getAvailableLotsForReturn(materialName, requestedQuantity = 0) {
  let lots = [];

  lineStore.stockMovementItems.forEach((item) => {
    if (item.materialName !== materialName) return;

    const movement = lineStore.stockMovements.find((movementItem) => {
      return movementItem.id === item.movementId;
    });

    if (!movement || movement.type !== "SALE" || movement.status === "Cancelado") return;

    (item.lots || []).forEach((lot) => {
      const soldQuantity = Number(lot.quantity || lot.exitQuantity || 0);
      const alreadyReturned = getAlreadyReturnedQuantity({
        sourceSaleMovementId: movement.id,
        sourceSaleItemId: item.id,
        sourceLotId: lot.sourceLotId,
        lotCode: lot.lotCode
      });

      const availableQuantity = soldQuantity - alreadyReturned;

      if (availableQuantity <= 0) return;

      lots.push({
        id: crypto.randomUUID(),
        sourceSaleMovementId: movement.id,
        sourceSaleItemId: item.id,
        sourceLotId: lot.sourceLotId || lot.id,
        lotCode: lot.lotCode,
        saleDate: movement.movementDate,
        availableSecondaryQuantity: Number(lot.secondaryQuantity || 0),
        secondaryUnit: item.secondaryUnit || "",
saleDateFormatted: formatDateOnly(movement.movementDate),
lotSearchText: `
  ${lot.lotCode || ""}
  ${movement.movementDate || ""}
  ${formatDateOnly(movement.movementDate) || ""}
`.toLowerCase(),
        availableQuantity,
        selected: false,
        exitMode: "PARTIAL",
        exitQuantity: 0
      });
    });
  });

  lots.sort((a, b) => {
    return String(b.saleDate || "").localeCompare(String(a.saleDate || ""));
  });

  if (returnFormState.stockExitMode === "FIFO") {
    let remaining = Number(requestedQuantity || 0);

    return lots.map((lot) => {
      const quantityToReturn = Math.min(lot.availableQuantity, remaining);

      remaining -= quantityToReturn;

      return {
        ...lot,
        selected: quantityToReturn > 0,
        exitMode: "FIFO",
        exitQuantity: quantityToReturn
      };
    });
  }

  return lots;
}

function getAlreadyReturnedQuantity({ sourceSaleMovementId, sourceSaleItemId, sourceLotId, lotCode }) {
  let total = 0;

  lineStore.stockMovementItems.forEach((item) => {
    const movement = lineStore.stockMovements.find((movementItem) => {
      return movementItem.id === item.movementId;
    });

    if (!movement || movement.type !== "RETURN" || movement.status === "Cancelado") return;

    (item.lots || []).forEach((lot) => {
      const sameSaleMovement = lot.sourceSaleMovementId === sourceSaleMovementId;
      const sameSaleItem = lot.sourceSaleItemId === sourceSaleItemId;
      const sameSourceLot = lot.sourceLotId && lot.sourceLotId === sourceLotId;
      const sameLotCode = lot.lotCode === lotCode;

      if (sameSaleMovement && sameSaleItem && (sameSourceLot || sameLotCode)) {
        total += Number(lot.quantity || lot.exitQuantity || 0);
      }
    });
  });

  return total;
}

function getMovementsByType(type) {
  return (lineStore.stockMovements || []).filter((movement) => movement.type === type);
}

function getMovementItems(movementId) {
  return (lineStore.stockMovementItems || []).filter((item) => item.movementId === movementId);
}

function getActiveTab() {
  return movementTabs.find((tab) => tab.key === activeMovementTab);
}


function closeMovementDetail() {
  selectedMovementId = null;
  isEditingMovement = false;
  movementDeleteTargetId = null;
  refreshMovimentacoesPage();
}

function saveMovementEdit() {
  const movement = lineStore.stockMovements.find((item) => item.id === selectedMovementId);

  if (!movement) return;

  const dateValue = document.getElementById("editMovementDate")?.value || movement.movementDate;
  const attachment = document.getElementById("editMovementAttachment")?.files?.[0];

    const isDateOnlyMovement =
  movement.type === "PURCHASE" ||
  movement.type === "SALE" ||
  movement.type === "RETURN" ||
  movement.type === "TRANSFER" ||
movement.type === "ADJUSTMENT";

movement.movementDate = isDateOnlyMovement
  ? getDateOnly(dateValue)
  : getDateOnly(dateValue);

movement.dateTime = isDateOnlyMovement
  ? `${getDateOnly(dateValue)}T00:00:00`
  : dateValue;

  if (movement.type === "TRANSFER") {
  movement.originLocation = document.getElementById("editMovementOriginLocation")?.value || "";
  movement.destinationLocation = document.getElementById("editMovementDestinationLocation")?.value || "";
} else {
  movement.locationName = document.getElementById("editMovementLocation")?.value || "";
}
  movement.fiscalNumber = document.getElementById("editMovementFiscalNumber")?.value || "";
  movement.observation = document.getElementById("editMovementObservation")?.value || "";

  if (attachment) {
  movement.attachmentName = attachment.name;
  movement.attachmentUrl = URL.createObjectURL(attachment);
}

  if (movement.type !== "TRANSFER") {
  movement.supplierName =
    document.getElementById("editMovementSupplier")?.value || "";
}

  document.querySelectorAll(".movement-edit-qty").forEach((input) => {
    const item = lineStore.stockMovementItems.find((movementItem) => {
      return movementItem.id === input.dataset.itemId;
    });

    if (item) {
      item.quantity = Number(input.value || 0);
    }
  });

  document.querySelectorAll(".edit-lot-code").forEach((input) => {
  const item = lineStore.stockMovementItems.find((movementItem) => {
    return movementItem.id === input.dataset.itemId;
  });

  if (!item) return;

  const lotIndex = Number(input.dataset.lotIndex);

  if (!item.lots?.[lotIndex]) return;

  item.lots[lotIndex].lotCode = input.value;
});

document.querySelectorAll(".edit-lot-quantity").forEach((input) => {
  const item = lineStore.stockMovementItems.find((movementItem) => {
    return movementItem.id === input.dataset.itemId;
  });

  if (!item) return;

  const lotIndex = Number(input.dataset.lotIndex);

  if (!item.lots?.[lotIndex]) return;

  item.lots[lotIndex].quantity = Number(input.value || 0);
  item.lots[lotIndex].movementQuantity = Number(input.value || 0);
  applyLotSecondaryQuantity(item, item.lots[lotIndex], item.lots[lotIndex].quantity);
});

document.querySelectorAll(".edit-lot-secondary-quantity").forEach((input) => {
  const item = lineStore.stockMovementItems.find((movementItem) => {
    return movementItem.id === input.dataset.itemId;
  });

  if (!item) return;

  const lotIndex = Number(input.dataset.lotIndex);

  if (!item.lots?.[lotIndex] || item.secondaryUnitMode === "fixed") return;

  item.lots[lotIndex].secondaryQuantity = Number(input.value || 0);
  item.lots[lotIndex].secondaryUnit = item.secondaryUnit || "";
});

  isEditingMovement = false;
  refreshMovimentacoesPage();
}

function deleteMovement() {
  if (!movementDeleteTargetId) return;

  const movement = lineStore.stockMovements.find((item) => {
    return item.id === movementDeleteTargetId;
  });

  if (movement) {
    movement.status = "Cancelado";
    movement.canceledAt = new Date().toISOString();
  }

  movementDeleteTargetId = null;
  isEditingMovement = false;

  refreshMovimentacoesPage();
}

function reprocessMovement() {
  if (!movementReprocessTargetId) return;

  const movement = lineStore.stockMovements.find((item) => {
    return item.id === movementReprocessTargetId;
  });

  if (movement) {
    movement.status = "Reprocessado";
    movement.reprocessedAt = new Date().toISOString();
  }

  movementReprocessTargetId = null;
  isEditingMovement = false;

  refreshMovimentacoesPage();
}

function getMovementStatusClass(status) {
  if (status === "Cancelado") return "movement-status-canceled";
  if (status === "Reprocessado") return "movement-status-reprocessed";

  return "movement-status-processed";
}

function getMovementCardStatusClass(movement) {
  if (movement.status === "Cancelado") return "movement-card-canceled";
  if (movement.status === "Reprocessado") return "movement-card-reprocessed";

  return "";
}

function getMovementModalStatusClass(movement) {
  if (movement.status === "Cancelado") return "movement-modal-canceled";
  if (movement.status === "Reprocessado") return "movement-modal-reprocessed";

  return "";
}

function renderLocationOptionsWithSelected(mode, selectedLocation) {
  const locations = getLocationsByMode(mode);

  if (!locations.length) {
    return `<option value="">Nenhum local disponível</option>`;
  }

  return `
    <option value="">Selecione um local</option>
    ${locations
      .map((location) => `
        <option value="${location.name}" ${location.name === selectedLocation ? "selected" : ""}>
          ${location.name}
        </option>
      `)
      .join("")}
  `;
}


function formatMovementHistoryDate(movement) {
  if (movement.type === "PURCHASE" || movement.type === "SALE" || movement.type === "RETURN" || movement.type === "TRANSFER" || movement.type === "ADJUSTMENT") {
    return formatDateOnly(movement.movementDate);
  }

  return formatDateTime(movement.dateTime);
}


function refreshMovimentacoesPage(focusElementId = null) {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${movimentacoesPage.title}</h1>
      <p>${movimentacoesPage.subtitle}</p>
    </div>

    ${renderMovimentacoes()}
  `;

  setupMovimentacoesEvents();

  if (focusElementId) {
    const element = document.getElementById(focusElementId);

    if (element) {
      element.focus();
      element.setSelectionRange(element.value.length, element.value.length);
    }
  }
}
