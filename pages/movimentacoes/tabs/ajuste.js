import { getToday, formatNumber, renderLotSecondaryField } from "../movimentacoes-utils.js";

export function createAdjustmentFormState() {
  return {
    date: getToday(),
    locationName: "",
    reason: ""
  };
}

export function renderAdjustmentForm({
  tab,
  adjustmentEntryMode,
  adjustmentFormState,
  getTabDescription,
  renderAdjustmentHeaderFields,
  renderDraftItemsBox,
  renderMovementSystemNotice
}) {
  return `
    <div class="movement-form-header">
      <div>
        <h2>${tab.icon} ${tab.label}</h2>
        <p>${getTabDescription("ADJUSTMENT")}</p>
      </div>
    </div>

    <div class="movement-entry-tabs">
      <button
        class="movement-entry-tab ${adjustmentEntryMode === "INCREASE" ? "active" : ""}"
        data-adjustment-entry-mode="INCREASE"
        type="button"
      >
        Acréscimo no lote
      </button>

      <button
        class="movement-entry-tab ${adjustmentEntryMode === "DECREASE" ? "active" : ""}"
        data-adjustment-entry-mode="DECREASE"
        type="button"
      >
        Redução no lote
      </button>
    </div>

    <div class="movement-method-card ${adjustmentEntryMode === "INCREASE" ? "adjustment-plus-card" : "adjustment-minus-card"}">
      <h3>${getAdjustmentModeLabel(adjustmentEntryMode)}</h3>
      <p>Ajuste operacional em lote já existente. Este lançamento não cria novos lotes.</p>

      ${renderAdjustmentHeaderFields()}

      ${renderMovementSystemNotice()}

      ${renderDraftItemsBox("ADJUSTMENT")}

      <div class="movement-actions">
        <button id="registerMovementBtn" class="primary-btn" type="button">
          Registrar ${tab.label}
        </button>
      </div>
    </div>
  `;
}

export function renderAdjustmentHeaderFields({
  formState,
  renderLocationOptionsWithSelected
}) {
  return `
    <div class="form-grid">
      <label>
  Data do ajuste
  <input id="movementDate" type="date" value="${formState.date || getToday()}" />
</label>

      <label>
        Local
        <select id="movementLocation">
          ${renderLocationOptionsWithSelected("stock", formState.locationName)}
        </select>
      </label>

      <label class="full-field">
        Motivo
        <input
          id="movementReason"
          type="text"
          placeholder="Ex: erro operacional, perda, sobra, divergência pontual..."
          value="${formState.reason || ""}"
        />
      </label>
    </div>
  `;
}

export function getAdjustmentModeLabel(mode) {
  if (mode === "DECREASE") return "Redução no lote";
  return "Acréscimo no lote";
}

export function getAdjustmentDraftItemLotStatusClass(item) {
  const lots = item.lots || [];

  if (!lots.length) return "";

  const selectedLots = lots.filter((lot) => lot.selected);

  if (!selectedLots.length) return "lot-total-invalid";

  const hasInvalid = selectedLots.some((lot) => {
    const adjustmentQuantity = Number(lot.adjustmentQuantity || 0);
    const availableQuantity = Number(lot.availableQuantity || 0);

    if (adjustmentQuantity <= 0) return true;

    if (lot.adjustmentType === "DECREASE" && adjustmentQuantity > availableQuantity) {
      return true;
    }

    return false;
  });

  if (hasInvalid) return "lot-total-invalid";

  return "lot-total-valid";
}

export function renderAdjustmentDraftLots(item, index, adjustmentEntryMode) {
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

  const selectedLots = item.lots.filter((lot) => lot.selected);

  return `
    <tr>
      <td colspan="6">
        <div class="purchase-lots-box sale-lots-box adjustment-lots-box">
          <div class="sale-lots-title">
            <div>
              <strong>${getAdjustmentModeLabel(adjustmentEntryMode)}</strong>
              <span>Selecione um lote existente e informe quanto será ajustado.</span>
            </div>

            <span class="sale-lots-total">
              Movimento: <strong>${adjustmentEntryMode === "INCREASE" ? "+" : "-"} ajuste</strong>
            </span>
          </div>

          <details class="sale-lot-picker">
            <summary>Selecione o(s) lote(s)</summary>

            <div class="sale-lot-picker-list">
              ${item.lots.map((lot, lotIndex) => `
                <label class="sale-lot-picker-option">
                  <input
                    class="adjustment-lot-picker-check"
                    data-index="${index}"
                    data-lot-index="${lotIndex}"
                    type="checkbox"
                    ${lot.selected ? "checked" : ""}
                  />

                  <div>
                    <strong>${lot.lotCode}</strong>
                    <span>Saldo atual: ${formatNumber(lot.availableQuantity)} ${item.unit}</span>
                  </div>
                </label>
              `).join("")}
            </div>

            <div class="sale-lot-picker-actions">
              <button class="secondary-btn apply-adjustment-lot-selection-btn" type="button">
                Selecionar
              </button>
            </div>
          </details>

          ${
            selectedLots.length
              ? `
                <div class="sale-lot-list selected-only">
                  ${selectedLots.map((lot) => {
                    const lotIndex = item.lots.indexOf(lot);
                    const adjustmentQuantity = Number(lot.adjustmentQuantity || 0);
                    const currentQuantity = Number(lot.availableQuantity || 0);
                    const finalQuantity =
                      adjustmentEntryMode === "INCREASE"
                        ? currentQuantity + adjustmentQuantity
                        : currentQuantity - adjustmentQuantity;

                    return `
                      <div class="sale-lot-card adjustment-lot-card">
                        <div class="sale-lot-info">
                          <strong>${lot.lotCode}</strong>
                          <span>Saldo atual: ${formatNumber(currentQuantity)} ${item.unit}</span>
                        </div>

                        <label class="sale-lot-qty">
                          Ajustar
                          <input
                            class="adjustment-lot-quantity ${
                              adjustmentEntryMode === "DECREASE" && adjustmentQuantity > currentQuantity
                                ? "sale-lot-quantity-invalid"
                                : ""
                            }"
                            data-index="${index}"
                            data-lot-index="${lotIndex}"
                            type="number"
                            min="0"
                            step="0.001"
                            value="${adjustmentQuantity || 0}"
                          />
                        </label>

                        ${renderLotSecondaryField({
                          item,
                          lot,
                          itemIndex: index,
                          lotIndex,
                          primaryQuantity: adjustmentQuantity || 0,
                          inputClass: "adjustment-lot-secondary-quantity"
                        })}

                        <div class="adjustment-result-box ${adjustmentEntryMode === "INCREASE" ? "plus" : "minus"}">
                          <small>Resultado</small>
                          <strong>${formatNumber(finalQuantity)} ${item.unit}</strong>
                          <span>${adjustmentEntryMode === "INCREASE" ? "+" : "-"}${formatNumber(adjustmentQuantity)} ${item.unit}</span>
                        </div>
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
