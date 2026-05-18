import { renderLotSecondaryField } from "../movimentacoes-utils.js";

export function createReturnFormState(getToday) {
  return {
    date: getToday(),
    locationName: "",
    stockExitMode: "FIFO",
    observation: ""
  };
}

export function renderReturnForm({
  tab,
  returnEntryMode,
  returnFormState,
  getTabDescription,
  renderReturnHeaderFields,
  renderDraftItemsBox,
  renderImportPreview,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-form-header">
      <div>
        <h2>${tab.icon} ${tab.label}</h2>
        <p>${getTabDescription("RETURN")}</p>
      </div>
    </div>

    <div class="movement-entry-tabs">
      <button class="movement-entry-tab ${returnEntryMode === "IMPORT" ? "active" : ""}" data-return-entry-mode="IMPORT" type="button">
        Importar devoluções
      </button>

      <button class="movement-entry-tab ${returnEntryMode === "MANUAL" ? "active" : ""}" data-return-entry-mode="MANUAL" type="button">
        Devolução manual
      </button>
    </div>

    ${
      returnEntryMode === "IMPORT"
        ? renderReturnImportForm({ returnFormState, renderImportPreview, renderMovementSystemNotice })
        : renderReturnManualForm({ tab, renderReturnHeaderFields, renderDraftItemsBox, renderMovementSystemNotice })
    }
  `;
}

export function renderReturnHeaderFields({
  formState,
  getToday,
  renderLocationOptionsWithSelected
}) {
  return `
    <div class="form-grid">
      <label>
        Data da devolução
        <input id="movementDate" type="date" value="${formState.date || getToday()}" />
      </label>

      <label>
        Local da devolução
        <select id="movementLocation">
          ${renderLocationOptionsWithSelected("sale", formState.locationName)}
        </select>
      </label>

      <label>
        Forma da devolução
        <select id="movementStockExitMode">
          ${renderReturnModeOptions(formState.stockExitMode)}
        </select>
      </label>

      <label class="full-field">
        Observação
        <input id="movementObservation" type="text" placeholder="Observações da devolução" value="${formState.observation || ""}" />
      </label>
    </div>
  `;
}

export function getReturnModeLabel(mode) {
  if (mode === "LOT") return "Manual por lote";
  return "Automática pela última saída";
}

function renderReturnImportForm({
  returnFormState,
  renderImportPreview,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-method-card">
      <h3>Importar devoluções</h3>
      <p>Use o modelo padrão para leitura automática dos materiais devolvidos.</p>

      ${renderMovementSystemNotice()}

      <div class="form-grid">
        <label>
          Forma da devolução
          <select id="importStockExitMode">
            ${renderReturnModeOptions(returnFormState.stockExitMode)}
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

      ${renderImportPreview("RETURN")}
    </div>
  `;
}

function renderReturnManualForm({
  tab,
  renderReturnHeaderFields,
  renderDraftItemsBox,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-method-card">
      <h3>Devolução manual</h3>
      <p>Informe manualmente os materiais e quantidades devolvidas.</p>

      ${renderReturnHeaderFields()}

      ${renderMovementSystemNotice()}

      ${renderDraftItemsBox("RETURN")}

      <div class="movement-actions">
        <button id="registerMovementBtn" class="primary-btn" type="button">
          Registrar ${tab.label}
        </button>
      </div>
    </div>
  `;
}

function renderReturnModeOptions(selectedMode) {
  return `
    <option value="FIFO" ${selectedMode === "FIFO" ? "selected" : ""}>
      Automática pela última saída
    </option>

    <option value="LOT" ${selectedMode === "LOT" ? "selected" : ""}>
      Manual por lote
    </option>
  `;
}

export function renderReturnDraftLots(item, index, stockExitMode = "FIFO") {
  if (!item.lots?.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="purchase-lots-box sale-lots-box">
            <strong>Nenhum lote de saída disponível para devolução deste material.</strong>
          </div>
        </td>
      </tr>
    `;
  }

  const isAutomatic = stockExitMode === "FIFO";
  const selectedLots = item.lots.filter((lot) => lot.selected);

  return `
    <tr>
      <td colspan="6">
        <div class="purchase-lots-box sale-lots-box">
          <div class="sale-lots-title">
            <div>
              <strong>${isAutomatic ? "Devolução automática pela última saída" : "Lotes de saída para devolução"}</strong>
              <span>
                ${
                  isAutomatic
                    ? "O sistema selecionou automaticamente os últimos lotes vendidos."
                    : "Filtre por lote ou data da saída, selecione os lotes devolvidos e ajuste total ou parcial."
                }
              </span>
            </div>

            <span class="sale-lots-total">
              Total da devolução: <strong>${item.quantity} ${item.unit}</strong>
            </span>
          </div>

          ${
            !isAutomatic
              ? `
                <details class="sale-lot-picker">
                  <summary>Selecione o(s) lote(s) de saída</summary>

                  <div class="sale-lot-filters with-spacing">
                    <input class="return-lot-filter" type="text" placeholder="Buscar lote..." />
                    <input class="return-lot-date-filter" type="date" />
                  </div>

                  <div class="sale-lot-picker-placeholder">
  Digite um lote ou selecione uma data para exibir os lotes disponíveis.
</div>

<div class="sale-lot-picker-list hidden-until-filter">
  ${item.lots.map((lot, lotIndex) => `
                      <label
                        class="sale-lot-picker-option return-lot-option"
                        data-lot-text="${lot.lotSearchText || String(lot.lotCode || "").toLowerCase()}"
                        data-lot-date="${lot.saleDate || ""}"
                      >
                        <input
                          class="sale-lot-picker-check"
                          data-index="${index}"
                          data-lot-index="${lotIndex}"
                          type="checkbox"
                          ${lot.selected ? "checked" : ""}
                        />

                        <div>
                          <strong>${lot.lotCode}</strong>
                          <span>Saída: ${lot.saleDateFormatted || "-"}</span>
                          <span>Disponível para devolver: ${lot.availableQuantity} ${item.unit}</span>
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
                      <div class="sale-lot-card ${isAutomatic ? "readonly-mode" : ""}">
                        <div class="sale-lot-info">
                          <strong>${lot.lotCode}</strong>
                          <span>Saída: ${lot.saleDateFormatted || "-"}</span>
                          <span>Disponível para devolver: ${lot.availableQuantity} ${item.unit}</span>
                        </div>

                        <div class="sale-lot-mode-box">
                          <label>
                            <input class="sale-lot-mode" data-index="${index}" data-lot-index="${lotIndex}" type="radio" name="return-lot-mode-${index}-${lotIndex}" value="TOTAL" ${lot.exitMode === "TOTAL" || lot.exitMode === "FIFO" ? "checked" : ""} ${isAutomatic ? "disabled" : ""} />
                            Total
                          </label>

                          <label>
                            <input class="sale-lot-mode" data-index="${index}" data-lot-index="${lotIndex}" type="radio" name="return-lot-mode-${index}-${lotIndex}" value="PARTIAL" ${lot.exitMode === "PARTIAL" ? "checked" : ""} ${isAutomatic ? "disabled" : ""} />
                            Parcial
                          </label>
                        </div>

                        <label class="sale-lot-qty">
                          Devolver
                          <input
                            class="sale-lot-quantity ${Number(lot.exitQuantity || 0) > Number(lot.availableQuantity || 0) ? "sale-lot-quantity-invalid" : ""}"
                            data-index="${index}"
                            data-lot-index="${lotIndex}"
                            type="number"
                            min="0"
                            step="0.001"
                            value="${lot.exitQuantity || 0}"
                            ${isAutomatic || lot.exitMode === "TOTAL" ? "disabled" : ""}
                          />
                        </label>

                        ${renderLotSecondaryField({
                          item,
                          lot,
                          itemIndex: index,
                          lotIndex,
                          primaryQuantity: lot.exitQuantity || 0,
                          inputClass: "sale-lot-secondary-quantity"
                        })}
                      </div>
                    `;
                  }).join("")}
                </div>
              `
              : `<div class="sale-lot-empty-selected">Nenhum lote selecionado.</div>`
          }
        </div>
      </td>
    </tr>
  `;
}
