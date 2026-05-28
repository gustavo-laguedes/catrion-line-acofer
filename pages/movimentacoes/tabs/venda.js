import { renderLotSecondaryField } from "../movimentacoes-utils.js";

export function createSaleFormState(getToday) {
  return {
    date: getToday(),
    locationName: "",
    stockExitMode: "FIFO",
    fiscalNumber: "",
    observation: ""
  };
}

export function renderSaleForm({
  tab,
  saleEntryMode,
  saleFormState,
  getTabDescription,
  renderSaleHeaderFields,
  renderDraftItemsBox,
  renderImportPreview,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-form-header">
      <div>
        <h2>${tab.icon} ${tab.label}</h2>
        <p>${getTabDescription("SALE")}</p>
      </div>
    </div>

    <div class="movement-entry-tabs">
      <button
        class="movement-entry-tab ${saleEntryMode === "IMPORT" ? "active" : ""}"
        data-sale-entry-mode="IMPORT"
        type="button"
      >
        Importar vendas
      </button>

      <button
        class="movement-entry-tab ${saleEntryMode === "MANUAL" ? "active" : ""}"
        data-sale-entry-mode="MANUAL"
        type="button"
      >
        Venda manual
      </button>
    </div>

    ${
      saleEntryMode === "IMPORT"
        ? renderSaleImportForm({
    saleFormState,
    renderImportPreview,
    renderMovementSystemNotice
  })
        : renderSaleManualForm({
    tab,
    saleFormState,
    renderSaleHeaderFields,
    renderDraftItemsBox,
    renderMovementSystemNotice
  })
    }
  `;
}

export function renderSaleHeaderFields({
  formState,
  getToday,
  renderLocationOptionsWithSelected
}) {
  return `
    <div class="form-grid">
      <label>
        Data da venda
        <input id="movementDate" type="date" value="${formState.date || getToday()}" />
      </label>

      <label>
        Local da venda
        <select id="movementLocation">
          ${renderLocationOptionsWithSelected("sale", formState.locationName)}
        </select>
      </label>

      <label>
        Forma de baixa
        <select id="movementStockExitMode">
          ${renderSaleExitModeOptions(formState.stockExitMode)}
        </select>
      </label>

      <label class="full-field">
        Observação
        <input id="movementObservation" type="text" placeholder="Observações da venda" value="${formState.observation || ""}" />
      </label>
    </div>
  `;
}

export function renderSaleImportForm({
  saleFormState,
  renderImportPreview,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-method-card">
      <h3>Importar vendas</h3>
      <p>Use o modelo padrão para leitura automática dos materiais vendidos.</p>

    ${renderMovementSystemNotice()}

      <div class="form-grid">
        <label>
          Forma de baixa
          <select id="importStockExitMode">
            ${renderSaleExitModeOptions(saleFormState.stockExitMode)}
          </select>
        </label>

        <label class="full-field">
          Arquivo Excel
          <input id="importFileInput" type="file" accept=".xlsx,.xls,.csv" />
        </label>
      </div>

      <div class="movement-import-actions">
        <button id="downloadTemplateBtn" class="secondary-btn" type="button">
          Baixar modelo
        </button>

        <button id="previewImportBtn" class="primary-btn" type="button">
          Ler arquivo
        </button>
      </div>

      ${renderImportPreview("SALE")}
    </div>
  `;
}

export function renderSaleManualForm({
  tab,
  renderSaleHeaderFields,
  renderDraftItemsBox,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-method-card">
      <h3>Venda manual</h3>
      <p>Informe manualmente os materiais e quantidades.</p>

      ${renderSaleHeaderFields()}

      ${renderMovementSystemNotice()}

      ${renderDraftItemsBox("SALE")}

      <div class="movement-actions">
        <button id="registerMovementBtn" class="primary-btn" type="button">
          Registrar ${tab.label}
        </button>
      </div>
    </div>
  `;
}

export function getSaleExitModeLabel(mode) {
  if (mode === "LOT") return "Manual por lote";
  return "FIFO automático";
}

function renderSaleExitModeOptions(selectedMode) {
  return `
    <option value="FIFO" ${selectedMode === "FIFO" ? "selected" : ""}>
      FIFO automático
    </option>

    <option value="LOT" ${selectedMode === "LOT" ? "selected" : ""}>
      Manual por lote
    </option>
  `;
}

export function getSaleDraftItemLotStatusClass(item) {
  const selectedLots = item.lots || [];

  if (!selectedLots.length) return "";

  const hasInvalidLot = selectedLots.some((lot) => {
  return Number(lot.exitQuantity || 0) > Number(lot.availableQuantity || 0);
});

if (hasInvalidLot) {
  return "lot-total-invalid";
}

  const lotTotal = selectedLots.reduce((sum, lot) => {
    if (!lot.selected) return sum;
    return sum + Number(lot.exitQuantity || 0);
  }, 0);

  if (Math.abs(lotTotal - Number(item.quantity || 0)) > 0.0001) {
    return "lot-total-invalid";
  }

  return "lot-total-valid";
}

export function renderSaleDraftLots(item, index, stockExitMode = "FIFO") {
  if (!item.lots?.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="purchase-lots-box sale-lots-box">
            <strong>Nenhum lote disponível para este material.</strong>
          </div>
        </td>
      </tr>
    `;
  }

  const isFifo = stockExitMode === "FIFO";
  const selectedLots = isFifo ? item.lots.filter((lot) => lot.selected) : item.lots.filter((lot) => lot.selected);

  return `
    <tr>
      <td colspan="6">
        <div class="purchase-lots-box sale-lots-box">
          <div class="sale-lots-title">
            <div>
              <strong>${isFifo ? "Baixa automática por FIFO" : "Lotes para baixa"}</strong>
              <span>
                ${
                  isFifo
                    ? "O sistema selecionou automaticamente os lotes mais antigos."
                    : "Selecione os lotes que serão baixados e depois ajuste total ou parcial."
                }
              </span>
            </div>

            <span class="sale-lots-total">Total da venda: <strong>${item.quantity} ${item.unit}</strong></span>
          </div>

          ${
            !isFifo
              ? `
                <details class="sale-lot-picker">
                  <summary>Selecione o(s) lote(s)</summary>

                  <div class="sale-lot-picker-list">
                    ${item.lots.map((lot, lotIndex) => `
                      <label class="sale-lot-picker-option">
                        <input
                          class="sale-lot-picker-check"
                          data-index="${index}"
                          data-lot-index="${lotIndex}"
                          type="checkbox"
                          ${lot.selected ? "checked" : ""}
                        />

                        <div>
                          <strong>${lot.lotCode}</strong>
                          <span>Disponível: ${lot.availableQuantity} ${item.unit}</span>
                        </div>
                      </label>
                    `).join("")}
                  </div>

                  <div class="sale-lot-picker-actions">
                    <button class="secondary-btn apply-sale-lot-selection-btn" type="button">
                      Selecionar
                    </button>
                  </div>
                </details>
              `
              : ""
          }

          ${
            selectedLots.length
              ? `
                <div class="sale-lot-list selected-only">
                  ${selectedLots.map((lot) => {
                    const lotIndex = item.lots.indexOf(lot);

                    return `
                      <div class="sale-lot-card ${isFifo ? "readonly-mode" : ""}">
                        <div class="sale-lot-info">
                          <strong>${lot.lotCode}</strong>
                          <span>Disponível: ${lot.availableQuantity} ${item.unit}</span>
                        </div>

                        <div class="sale-lot-mode-box">
                          <label>
                            <input
                              class="sale-lot-mode"
                              data-index="${index}"
                              data-lot-index="${lotIndex}"
                              type="radio"
                              name="sale-lot-mode-${index}-${lotIndex}"
                              value="TOTAL"
                              ${lot.exitMode === "TOTAL" || lot.exitMode === "FIFO" ? "checked" : ""}
                              ${isFifo ? "disabled" : ""}
                            />
                            Total
                          </label>

                          <label>
                            <input
                              class="sale-lot-mode"
                              data-index="${index}"
                              data-lot-index="${lotIndex}"
                              type="radio"
                              name="sale-lot-mode-${index}-${lotIndex}"
                              value="PARTIAL"
                              ${lot.exitMode === "PARTIAL" ? "checked" : ""}
                              ${isFifo ? "disabled" : ""}
                            />
                            Parcial
                          </label>
                        </div>

                        <label class="sale-lot-qty">
                          Baixar
                          <input
  class="sale-lot-quantity ${
    Number(lot.exitQuantity || 0) > Number(lot.availableQuantity || 0)
      ? "sale-lot-quantity-invalid"
      : ""
  }"
                            data-index="${index}"
                            data-lot-index="${lotIndex}"
                            type="number"
                            min="0"
                            step="0.001"
                            value="${lot.exitQuantity || 0}"
                            ${isFifo || lot.exitMode === "TOTAL" ? "disabled" : ""}
                          />
                        </label>

                        ${renderLotSecondaryField({
                          item,
                          lot,
                          itemIndex: index,
                          lotIndex,
                          primaryQuantity: lot.exitQuantity || 0,
                          inputClass: "sale-lot-secondary-quantity",
                          disabled: isFifo || lot.exitMode === "TOTAL"
                        })}
                      </div>
                    `;
                  }).join("")}
                </div>
              `
              : `
                <div class="sale-lot-empty-selected">
                  Nenhum lote selecionado.
                </div>
              `
          }
        </div>
      </td>
    </tr>
  `;
}
