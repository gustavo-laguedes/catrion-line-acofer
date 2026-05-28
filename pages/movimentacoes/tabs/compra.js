import { renderLotSecondaryField } from "../movimentacoes-utils.js";

export function createPurchaseFormState(getToday) {
  return {
    date: getToday(),
    supplierName: "",
    locationName: "",
    fiscalNumber: "",
    supplierCertificateNumber: "",
    observation: ""
  };
}

export function ensureSupplierStore(lineStore) {
  if (!lineStore.suppliers) {
    lineStore.suppliers = [];
  }
}

export function renderSupplierOptions(lineStore, getActiveItems, selectedSupplier = "") {
  const suppliers = getActiveItems(lineStore.suppliers || []);

  if (!suppliers.length) {
    return `<option value="">Nenhum fornecedor cadastrado</option>`;
  }

  return `
    <option value="">Selecione um fornecedor</option>
    ${suppliers.map((supplier) => `
      <option value="${supplier.name}" ${supplier.name === selectedSupplier ? "selected" : ""}>
        ${supplier.name}
      </option>
    `).join("")}
  `;
}

export function renderPurchaseHeaderFields({
  formState,
  attachmentFile,
  getToday,
  lineStore,
  getActiveItems,
  renderLocationOptionsWithSelected
}) {
  return `
    <div class="form-grid">
      <label>
        Data
        <input id="movementDate" type="date" value="${formState.date || getToday()}" />
      </label>

      <label>
        Fornecedor
        <select id="movementSupplier">
          ${renderSupplierOptions(lineStore, getActiveItems, formState.supplierName)}
        </select>
      </label>

      <label>
        Local de entrada
        <select id="movementLocation">
          ${renderLocationOptionsWithSelected("stock", formState.locationName)}
        </select>
      </label>

      <label>
        Número da NF
        <input id="movementFiscalNumber" type="text" placeholder="Ex: 000123" value="${formState.fiscalNumber || ""}" />
      </label>

      <label>
        Nº certificado fornecedor
        <input id="movementSupplierCertificateNumber" type="text" placeholder="Ex: CERT-2026-001" value="${formState.supplierCertificateNumber || ""}" />
      </label>

      <label>
        Anexo da NF
        <input id="movementAttachment" type="file" accept=".pdf,.xml,.jpg,.png" />
      </label>

      ${attachmentFile ? `
        <div class="selected-attachment-wrapper">
          <span class="selected-attachment-name">
            Anexo selecionado: ${attachmentFile.name}
          </span>
        </div>
      ` : ""}

      <label class="full-field">
        Observação
        <input id="movementObservation" type="text" placeholder="Observações da compra" value="${formState.observation || ""}" />
      </label>
    </div>
  `;
}

export function validatePurchaseLots(items) {
  for (const item of items) {
    const lots = item.lots || [];

    if (!lots.length) {
      return {
        valid: false,
        title: "Lote obrigatório",
        message: `Informe pelo menos um lote para o material ${item.materialName}.`
      };
    }

    const hasEmptyLot = lots.some((lot) => !lot.lotCode?.trim());

    if (hasEmptyLot) {
      return {
        valid: false,
        title: "Lote incompleto",
        message: `Existe lote sem código no material ${item.materialName}.`
      };
    }

    const lotTotal = lots.reduce((sum, lot) => {
      return sum + Number(lot.quantity || 0);
    }, 0);

    if (Math.abs(lotTotal - Number(item.quantity || 0)) > 0.0001) {
      return {
        valid: false,
        title: "Quantidade dos lotes divergente",
        message: `A soma dos lotes do material ${item.materialName} precisa bater exatamente com a quantidade geral.`
      };
    }
  }

  return { valid: true };
}

export function getPurchaseDraftItemLotStatusClass(item) {
  const lotTotal = (item.lots || []).reduce((sum, lot) => {
    return sum + Number(lot.quantity || 0);
  }, 0);

  if (!item.lots?.length) return "";

  if (Math.abs(lotTotal - Number(item.quantity || 0)) > 0.0001) {
    return "lot-total-invalid";
  }

  return "lot-total-valid";
}

export function renderPurchaseDraftLots(item, index) {
  return `
    <tr>
      <td colspan="6">
        <div class="purchase-lots-box">
          <div class="purchase-lots-header">
            <strong>Lotes da compra</strong>

            <button class="secondary-btn add-draft-lot-btn" data-index="${index}" type="button">
              + Adicionar lote
            </button>
          </div>

          ${(item.lots || []).map((lot, lotIndex) => `
            <div class="purchase-lot-row">
              <label>
                Lote
                <input
                  class="draft-lot-code"
                  data-index="${index}"
                  data-lot-index="${lotIndex}"
                  type="text"
                  placeholder="Ex: LT-2026-001"
                  value="${lot.lotCode || ""}"
                />
              </label>

              <label>
                Quantidade
                <input
                  class="draft-lot-quantity"
                  data-index="${index}"
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
                itemIndex: index,
                lotIndex,
                primaryQuantity: lot.quantity || 0,
                inputClass: "draft-lot-secondary-quantity"
              })}

              <button class="mini-danger-btn remove-draft-lot-btn" data-index="${index}" data-lot-index="${lotIndex}" type="button">
                Remover lote
              </button>
            </div>
          `).join("")}
        </div>
      </td>
    </tr>
  `;
}
