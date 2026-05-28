import {
  getSaleExitModeLabel,
  getSaleDraftItemLotStatusClass,
} from "./venda.js";

import { renderLotSecondaryField } from "../movimentacoes-utils.js";

export function createTransferFormState(getToday) {
  return {
    date: getToday(),
    originLocation: "",
    destinationLocation: "",
    stockExitMode: "LOT",
    fiscalNumber: "",
    observation: ""
  };
}

export function renderTransferForm({
  tab,
  transferFormState,
  getTabDescription,
  renderTransferHeaderFields,
  renderDraftItemsBox,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-form-header">
      <div>
        <h2>${tab.icon} ${tab.label}</h2>
        <p>${getTabDescription("TRANSFER")}</p>
      </div>
    </div>

    <div class="movement-method-card">
      <h3>Transferência manual</h3>
      <p>Transfira materiais entre locais, mantendo o controle por lote.</p>

      ${renderTransferHeaderFields()}

      ${renderMovementSystemNotice()}

      ${renderDraftItemsBox("TRANSFER")}

      <div class="movement-actions">
        <button id="registerMovementBtn" class="primary-btn" type="button">
          Registrar ${tab.label}
        </button>
      </div>
    </div>
  `;
}

export function renderTransferHeaderFields({
  formState,
  getToday,
  renderLocationOptionsWithSelected
}) {
  return `
    <div class="form-grid transfer-header-grid">
      <label>
        Data da transferência
        <input id="movementDate" type="date" value="${formState.date || getToday()}" />
      </label>

      <label>
        Número da NF
        <input
          id="movementFiscalNumber"
          type="text"
          placeholder="Ex: 000456"
          value="${formState.fiscalNumber || ""}"
        />
      </label>

      <div class="transfer-route-row full-field">
        <label class="transfer-location-box transfer-origin-box">
          Local de origem
          <select id="movementOriginLocation">
            ${renderLocationOptionsWithSelected("stock", formState.originLocation)}
          </select>
        </label>

        <div class="transfer-route-arrow">→</div>

        <label class="transfer-location-box transfer-destination-box">
          Local de destino
          <select id="movementDestinationLocation">
            ${renderLocationOptionsWithSelected("stock", formState.destinationLocation)}
          </select>
        </label>
      </div>

      <label>
        Forma de baixa
        <select id="movementStockExitMode">
          ${renderTransferExitModeOptions(formState.stockExitMode)}
        </select>
      </label>

      <label>
        Anexo da NF
        <input id="movementAttachment" type="file" accept=".pdf,.xml,.jpg,.png" />
      </label>

      <label class="full-field">
        Observação
        <input
          id="movementObservation"
          type="text"
          placeholder="Observações da transferência"
          value="${formState.observation || ""}"
        />
      </label>
    </div>
  `;
}

export function getTransferModeLabel(mode) {
  return getSaleExitModeLabel(mode);
}

export function renderTransferDraftLots(item, index, stockExitMode) {
  if (!item.lots?.length) {
    return `
      <tr>
        <td colspan="6">
          <div class="purchase-lots-box sale-lots-box transfer-lots-box">
            <strong>Nenhum lote disponível para este material na origem.</strong>
          </div>
        </td>
      </tr>
    `;
  }

  const isFifo = stockExitMode === "FIFO";
  const selectedLots = item.lots.filter((lot) => lot.selected);

  return `
    <tr>
      <td colspan="6">
        <div class="purchase-lots-box sale-lots-box transfer-lots-box">
          <div class="sale-lots-title transfer-lots-title">
            <div>
              <strong>${isFifo ? "Transferência automática por FIFO" : "Lotes para transferência"}</strong>
              <span>
                ${
                  isFifo
                    ? "O sistema selecionou automaticamente os lotes mais antigos da origem."
                    : "Selecione os lotes da origem e defina se a transferência será total ou parcial."
                }
              </span>
            </div>

            <span class="sale-lots-total">Total da transferência: <strong>${item.quantity} ${item.unit}</strong></span>
          </div>

          ${
            !isFifo
              ? `
                <details class="sale-lot-picker transfer-lot-picker">
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
                          <span>Disponível na origem: ${lot.availableQuantity} ${item.unit}</span>
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
                <div class="sale-lot-list selected-only transfer-lot-list">
                  ${selectedLots.map((lot) => {
                    const lotIndex = item.lots.indexOf(lot);

                    return `
                      <div class="sale-lot-card transfer-lot-card ${isFifo ? "readonly-mode" : ""}">
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
                          Transferir
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
                          disabled: true
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

export function getTransferDraftItemLotStatusClass(item) {
  return getSaleDraftItemLotStatusClass(item);
}

function renderTransferExitModeOptions(selectedMode) {
  return `
    <option value="FIFO" ${selectedMode === "FIFO" ? "selected" : ""}>
      FIFO automático
    </option>

    <option value="LOT" ${selectedMode === "LOT" ? "selected" : ""}>
      Manual por lote
    </option>
  `;
}
