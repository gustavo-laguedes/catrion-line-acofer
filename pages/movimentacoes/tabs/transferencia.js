import {
  getSaleExitModeLabel,
  getSaleDraftItemLotStatusClass,
  renderSaleDraftLots
} from "./venda.js";

export function createTransferFormState(getToday) {
  return {
    date: getToday(),
    originLocation: "",
    destinationLocation: "",
    stockExitMode: "FIFO",
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
  return renderSaleDraftLots(item, index, stockExitMode);
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
