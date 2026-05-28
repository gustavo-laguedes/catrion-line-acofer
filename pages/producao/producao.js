import { lineStore, getActiveItems, saveStockLossParameters } from "../../shared/data-store.js";
import { buildStockSnapshot } from "../../shared/stock-engine.js";
import { apiGet, apiPost, apiPut } from "../../shared/api-client.js";

let activeProductionTab = "NEW";
let productionDraft = createProductionDraft();
let producedLots = [createProducedLotDraft(1)];
let productionNotice = null;
let apiStockSnapshot = null;
let hasLoadedProductionApi = false;
let selectedProductionRecordId = null;
let pendingProductionPayload = null;
let isProductionEditMode = false;
let productionEditDraft = null;
let productionEditRecordId = null;
let productionStatusAction = null;
let productionOutputLotAction = null;
let productionHistoryFilters = {
  search: "",
  date: "",
  status: "Todos"
};
let productionHistorySort = {
  field: "productionDate",
  direction: "desc"
};

export const produçãoPage = {
  title: "⚙️ Produção",
  subtitle: "Apontamentos, transformação de lotes e geração de novos lotes",
  render: renderProdução,
  afterRender: setupProduçãoEvents
};

export const producaoPage = produçãoPage;

function createProductionDraft() {
  return {
    date: getToday(),
    locationName: "",
    outputMaterialName: "",
    productionModelName: "",
    machineName: "",
    operatorCodes: [],
    consumedLotCode: "",
    consumedLotSelections: {},
    observation: ""
  };
}

function createProducedLotDraft(sequence) {
  return {
    id: crypto.randomUUID(),
    sequence,
    lotCode: "",
    outputQuantity: "",
    outputSecondaryQuantity: ""
  };
}

function showProductionError(message) {
  productionNotice = {
    type: "danger",
    title: "Produção bloqueada",
    message
  };

  showProductionNotice();
}

function showProductionBlockingAlert(title, message) {
  document.querySelector(".production-alert-backdrop")?.remove();

  const alert = document.createElement("div");
  alert.className = "modal-backdrop open danger-backdrop production-alert-backdrop";
  alert.innerHTML = `
    <div class="modal danger-modal production-alert-modal">
      <div class="delete-alert-icon">⚠️</div>

      <div class="modal-header vertical">
        <div>
          <h2>${title}</h2>
          <p>${message}</p>
        </div>
      </div>

      <div class="danger-warning-box">
        <strong>Atenção:</strong>
        <span>Revise o saldo disponível antes de tentar reprocessar novamente.</span>
      </div>

      <div class="modal-footer">
        <button class="primary-btn" id="closeProductionAlertBtn" type="button">Entendi</button>
      </div>
    </div>
  `;
  document.getElementById("appContent")?.appendChild(alert);

  alert.querySelector("#closeProductionAlertBtn")?.addEventListener("click", closeProductionBlockingAlert);
}

function getOutputLotStatusErrorMessage(error, action) {
  const message = error?.data?.error || error?.message || "";
  const fallback = action === "reprocess"
    ? "Não há estoque disponível suficiente para reprocessar este lote."
    : "Não foi possível alterar este lote produzido.";

  return message && !/^Erro HTTP/i.test(message) ? message : fallback;
}

function getProductionStatusErrorMessage(error, status) {
  const message = error?.data?.error || error?.message || "";
  const fallback = status === "Reprocessado"
    ? "Não há estoque disponível suficiente para reprocessar esta produção."
    : "Não foi possível alterar o status desta produção.";

  return message && !/^Erro HTTP/i.test(message) ? message : fallback;
}

function closeProductionBlockingAlert() {
  document.querySelector(".production-alert-backdrop")?.remove();
}

function renderProdução() {
  applyProductionDefaults();

  return `
    <div class="production-tabs">
      <button class="production-tab ${activeProductionTab === "NEW" ? "active" : ""}" data-production-tab="NEW" type="button">
        Nova produção
      </button>

      <button class="production-tab ${activeProductionTab === "HISTORY" ? "active" : ""}" data-production-tab="HISTORY" type="button">
        Histórico
      </button>
    </div>

    ${
      activeProductionTab === "NEW"
        ? renderNewProduction()
        : renderProductionHistory()
    }
  `;
}

function renderNewProduction() {
  const material = getSelectedOutputMaterial();
  const model = getSelectedProductionModel();
  const consumedInputs = getModelConsumedInputs(model);
  const selectedConsumedLots = getSelectedConsumedLots();

  syncProducedLotCodes();

  return `
    <div class="card production-card">
      <div class="table-header">
        <div>
          <h2>Novo apontamento de produção</h2>
          <p>Registre a transformação de um lote consumido em um ou mais lotes produzidos.</p>
        </div>
      </div>

      <div class="form-grid">
        <label>
          Data da produção
          <input id="productionDate" type="date" value="${productionDraft.date}" />
        </label>

        <label>
          Local de produção
          <select id="productionLocation" ${shouldLockLocationSelect() ? "disabled" : ""}>
            ${renderLocationOptions(productionDraft.locationName)}
          </select>
        </label>

        <label>
          Material produzido
          <select id="productionOutputMaterial">
            ${renderProducedMaterialOptions(productionDraft.outputMaterialName)}
          </select>
        </label>

        <label>
          Modelo
          <select id="productionModel" ${shouldLockModelSelect() ? "disabled" : ""}>
            ${renderProductionModelOptions()}
          </select>
        </label>

        <label>
          Máquina
          <select id="productionMachine" ${shouldLockMachineSelect() ? "disabled" : ""}>
            ${renderMachineOptions(productionDraft.machineName)}
          </select>
        </label>

        <textarea id="productionObservation" class="production-observation-field full-field" placeholder="Observações da produção">${productionDraft.observation}</textarea>
      </div>

      ${renderOperatorsBox()}
      ${renderTransformationSummary(material, model, consumedInputs, selectedConsumedLots)}
      ${renderConsumedLotBox(consumedInputs)}
      ${renderProducedLotsBox(material, consumedInputs, selectedConsumedLots)}

      <div class="movement-actions">
        <button id="registerProductionBtn" class="primary-btn" type="button">
          Registrar produção
        </button>
      </div>
    </div>
  `;
}

function renderOperatorsBox() {
  const operators = getActiveItems(lineStore.operators || []);

  if (!operators.length) {
    return `
      <div class="production-preview-empty">
        Nenhum operador cadastrado para selecionar como responsável.
      </div>
    `;
  }

  return `
    <div class="production-model-preview">
      <div class="production-model-preview-header">
        <div>
          <h3>Responsáveis</h3>
          <p>Selecione os operadores envolvidos neste apontamento.</p>
        </div>
      </div>

      <div class="checkbox-grid production-operator-grid">
        ${operators.map((operator) => `
          <label>
            <input
              class="production-operator-checkbox"
              type="checkbox"
              value="${operator.code}"
              ${productionDraft.operatorCodes.includes(operator.code) ? "checked" : ""}
            />
            ${operator.name}
          </label>
        `).join("")}
      </div>
    </div>
  `;
}

function renderTransformationSummary(material, model, consumedInputs, selectedConsumedLots) {
  return "";

  if (!material || !model || !consumedInputs.length) {
    return `
      <div class="production-preview-empty">
        Selecione material produzido e modelo para carregar a transformação.
      </div>
    `;
  }

  return `
    <div class="production-model-preview">
      <div class="production-model-preview-header">
        <div>
          <h3>${material.name}</h3>
          <p>
            Transformação:
            <strong>${consumedInputs.map((input) => input.inputMaterial).join(" / ")}</strong>
            ${selectedConsumedLots.length ? ` lote <strong>${selectedConsumedLots.map((lot) => lot.lotCode).join(" / ")}</strong>` : ""}
            → <strong>${material.name}</strong>
          </p>
        </div>

        <span class="badge badge-info">
          ${model.name}
        </span>
      </div>
    </div>
  `;
}

function renderConsumedLotBox(consumedInputs) {
  if (!productionDraft.locationName) {
    return `
      <div class="production-preview-empty">
        Selecione um local de produção para carregar os lotes disponíveis.
      </div>
    `;
  }

  if (!consumedInputs.length) {
    return "";
  }

  return `
    <div class="production-consumption-box">
      <div class="production-model-preview-header">
        <div>
          <h3>Lotes consumidos</h3>
          <p>Selecione o lote de origem para cada insumo em ${productionDraft.locationName}.</p>
        </div>

        <span class="badge badge-info">
          ${consumedInputs.length} insumo${consumedInputs.length > 1 ? "s" : ""}
        </span>
      </div>

      <div class="production-consumed-materials">
        ${consumedInputs.map((input, index) => renderConsumedMaterialBlock(input, index)).join("")}
      </div>
    </div>
  `;
}

function renderConsumedMaterialBlock(consumedInput, index) {
  const lots = getAvailableConsumedLots(consumedInput);
  const selectedLotCodes = getSelectedConsumedLotCodes(consumedInput);
  const inputKey = getConsumedInputKey(consumedInput, index);
  const simulation = getConsumptionSimulationForInput(consumedInput, lots);
  const selectedTotal = selectedLotCodes.reduce((sum, lotCode) => {
    const lot = lots.find((item) => item.lotCode === lotCode);
    return sum + Number(lot?.quantity || 0);
  }, 0);

  return `
    <div class="production-consumed-material-card">
      <div class="production-consumed-material-head">
        <div>
          <h4>${consumedInput.inputMaterial}</h4>
          <p>
            Necessário por unidade:
            <strong>${formatNumber(getInputQuantityPerProducedUnit(consumedInput))} ${consumedInput.inputUnit || ""}</strong>
            · Local: <strong>${productionDraft.locationName}</strong>
          </p>
        </div>
        <span class="badge badge-info">${selectedLotCodes.length}/${lots.length} lotes</span>
      </div>

      <div class="production-selected-total">
        <strong>Selecionado:</strong>
        ${formatNumber(selectedTotal)} ${consumedInput.inputUnit || ""}
        ${simulation.requiredQuantity ? ` · Consumo previsto: ${formatNumber(simulation.requiredQuantity)} ${consumedInput.inputUnit || ""}` : ""}
      </div>

      ${
        lots.length
          ? `
            <div class="production-lot-table">
              <div class="production-lot-table-head">
                <span>Lote</span>
                <span>Disponível</span>
                <span>Após produção</span>
                <span>Selecionar</span>
              </div>

              ${lots.map((lot) => {
                const projected = simulation.allocations.find((item) => item.lotCode === lot.lotCode);
                const selected = selectedLotCodes.includes(lot.lotCode);
                return `
                <label class="production-lot-row production-lot-row-multi ${selected ? "selected" : ""}">
                  <div>
                    <strong>${lot.lotCode}</strong>
                    <small>${lot.locationName}${lot.productionDate ? ` · ${formatDateOnly(lot.productionDate)}` : ""}</small>
                  </div>

                  <div>
                    ${formatNumber(lot.quantity)} ${consumedInput.inputUnit}
                  </div>

                  <div>
                    ${
                      projected
                        ? renderProjectedConsumption(projected, consumedInput.inputUnit)
                        : selected ? "Aguardando quantidade" : "-"
                    }
                  </div>

                  <div>
                    <input
                      class="production-consumed-lot-checkbox"
                      data-input-key="${inputKey}"
                      type="checkbox"
                      value="${lot.lotCode}"
                      ${selected ? "checked" : ""}
                    />
                  </div>
                </label>
              `}).join("")}
            </div>
          `
          : `
            <div class="production-preview-empty compact-production-empty">
              Nenhum lote disponível para este material no local de produção.
            </div>
          `
      }
    </div>
  `;
}

function renderProducedLotsBox(material, consumedInputs, selectedConsumedLots) {
  if (!material || !consumedInputs.length || selectedConsumedLots.length !== consumedInputs.length) {
    return "";
  }

  return `
    <div class="production-consumption-box">
      <div class="production-model-preview-header">
        <div>
          <h3>Lotes produzidos</h3>
          <p>Informe as quantidades reais produzidas. A unidade secundária não é inferida.</p>
        </div>

        <button id="addProducedLotBtn" class="secondary-btn" type="button">
          + adicionar lote produzido
        </button>
      </div>

      <div class="production-produced-lots">
        ${producedLots.map((lot, index) => renderProducedLotCard(lot, index, material)).join("")}
      </div>

      ${renderProductionLimitBox(material, consumedInputs, selectedConsumedLots)}
    </div>
  `;
}

function renderProjectedConsumption(projected, unit = "") {
  return `
    <div class="production-lot-projection">
      <span>Consumo previsto: <strong>${formatNumber(projected.consumedQuantity)} ${unit || ""}</strong></span>
      <span>Saldo restante: <strong>${formatNumber(projected.remainingQuantity)} ${unit || ""}</strong> (${formatPercent(projected.remainingPercent)})</span>
      ${projected.isLowStock ? `<span class="badge badge-warning production-low-stock-badge">Possível perda industrial</span>` : ""}
    </div>
  `;
}

function renderProducedLotCard(lot, index, material) {
  return `
    <div class="production-lot-card">
      <div class="production-lot-card-header">
        <div>
          <h4>${material.name}</h4>
          <p>Lote produzido ${index + 1}</p>
        </div>

        ${
          producedLots.length > 1
            ? `<button class="secondary-btn remove-produced-lot-btn" data-produced-lot-index="${index}" type="button">Remover</button>`
            : ""
        }
      </div>

      <div class="form-grid">
        <label>
          Código do lote
          <input
            class="produced-lot-code"
            data-produced-lot-index="${index}"
            type="text"
            value="${lot.lotCode}"
            placeholder="${getGeneratedLotSuggestion(index + 1)}"
            readonly
          />
        </label>

        <label>
          Quantidade principal (${material.unit || "-"})
          <input
            class="produced-lot-quantity"
            data-produced-lot-index="${index}"
            type="number"
            min="0"
            step="0.001"
            value="${lot.outputQuantity}"
            placeholder="0"
          />
        </label>

        <label>
          Quantidade secundária (${material.secondaryUnit || "-"})
          <input
            class="produced-lot-secondary-quantity"
            data-produced-lot-index="${index}"
            type="number"
            min="0"
            step="0.001"
            value="${lot.outputSecondaryQuantity}"
            placeholder="0"
          />
        </label>
      </div>
    </div>
  `;
}

function renderProductionLimitBox(material, consumedInputs, selectedConsumedLots) {
  const summaries = getProductionLimitSummary(material, consumedInputs, selectedConsumedLots);

  return `
    <div class="production-lot-validation ${summaries.some((summary) => summary.isOverLimit) ? "invalid" : "valid"}" id="productionLimitSummary">
      ${summaries.map((summary) => `
        <span>
          ${summary.input.inputMaterial}:
          <strong>${formatNumber(summary.consumedQuantity)} ${summary.input.inputUnit || ""}</strong>
          de <strong>${formatNumber(summary.availableQuantity)} ${summary.input.inputUnit || ""}</strong> disponíveis
        </span>
      `).join("")}
    </div>
  `;
}

function renderProductionHistory() {
  const records = getFilteredSortedProductionRecords();

  return `
    <div class="card production-card">
      <div class="table-header">
        <div>
          <h2>Histórico de produção</h2>
          <p>Registros de produção lançados no sistema.</p>
        </div>
      </div>

      ${renderProductionHistoryFilters()}

      <div id="productionHistoryResults">
        ${renderProductionHistoryResults(records)}
      </div>
    </div>
  `;
}

function renderProductionHistoryResults(records = getFilteredSortedProductionRecords()) {
  return records.length
    ? renderProductionHistoryTable(records)
    : `
      <div class="empty-state small-empty">
        <div class="empty-icon">⚙️</div>
        <h3>Nenhuma produção registrada</h3>
        <p>Os apontamentos de produção aparecerão aqui depois do lançamento.</p>
      </div>
    `;
}

function renderProductionHistoryFilters() {
  return `
    <div class="stock-filters production-history-filters">
      <label class="stock-search">
        Buscar
        <input id="productionHistorySearch" type="text" placeholder="Material, lote, local, máquina..." value="${productionHistoryFilters.search}" />
      </label>

      <label>
        Data
        <input id="productionHistoryDate" type="date" value="${productionHistoryFilters.date}" />
      </label>

      <label>
        Status
        <select id="productionHistoryStatus">
          ${["Todos", "Processado", "Cancelado", "Reprocessado"].map((status) => `
            <option value="${status}" ${status === productionHistoryFilters.status ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderProductionHistoryTable(records) {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="sortable-column" data-production-sort="productionDate">Data ${renderProductionSortIcon("productionDate")}</th>
            <th class="sortable-column" data-production-sort="outputMaterialName">Material ${renderProductionSortIcon("outputMaterialName")}</th>
            <th class="sortable-column" data-production-sort="outputQuantity">Quantidade ${renderProductionSortIcon("outputQuantity")}</th>
            <th>Lotes</th>
            <th class="sortable-column" data-production-sort="locationName">Local ${renderProductionSortIcon("locationName")}</th>
            <th>Máquina</th>
            <th class="sortable-column" data-production-sort="status">Status ${renderProductionSortIcon("status")}</th>
          </tr>
        </thead>

        <tbody>
          ${records.map((record) => {
            const lots = getGeneratedLotsByRecord(record.id);

            return `
              <tr class="production-history-row ${record.status === "Cancelado" ? "production-history-row-canceled" : ""}" data-production-record-id="${record.id}">
                <td>${formatDateTime(record.createdAt || record.productionDate)}</td>
                <td><strong>${record.outputMaterialName}</strong></td>
                <td>${formatNumber(record.outputQuantity)} ${record.outputUnit}</td>
                <td>${renderProductionHistoryLots(lots, record)}</td>
                <td>${record.locationName || "-"}</td>
                <td>${record.machineName || "-"}</td>
                <td>${renderProductionHistoryStatus(record, lots)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function isProductionLotCanceled(lot) {
  return lot?.status === "Cancelado" || lot?.lotStatus === "Cancelado";
}

function hasPartiallyCanceledOutput(record, lots = getGeneratedLotsByRecord(record.id)) {
  return (record.status === "Processado" || record.status === "Reprocessado") && lots.some(isProductionLotCanceled);
}

function renderProductionHistoryLots(lots, record) {
  if (!lots.length) return record.generatedLotCode || "-";

  return lots.map((lot) => `
    <span class="production-history-lot ${isProductionLotCanceled(lot) ? "is-canceled" : ""}">
      ${lot.lotCode || "-"}
    </span>
  `).join(" / ");
}

function renderProductionHistoryStatus(record, lots) {
  return `
    <span class="production-history-status">
      <span class="badge ${getProductionStatusBadgeClass(record.status)}">${record.status}</span>
    ${hasPartiallyCanceledOutput(record, lots) ? `<span class="badge badge-danger production-partial-cancel-badge">Cancelado parcialmente</span>` : ""}
    </span>
  `;
}

function renderProductionSortIcon(field) {
  if (productionHistorySort.field !== field) return `<span class="sort-icon">↕</span>`;

  return productionHistorySort.direction === "asc"
    ? `<span class="sort-icon active">▲</span>`
    : `<span class="sort-icon active">▼</span>`;
}

function getFilteredSortedProductionRecords() {
  const search = productionHistoryFilters.search.trim().toLowerCase();

  const filtered = (lineStore.productionRecords || []).filter((record) => {
    const lots = getGeneratedLotsByRecord(record.id).map((lot) => lot.lotCode).join(" ");
    const haystack = `
      ${record.outputMaterialName || ""}
      ${record.productionModelName || ""}
      ${record.machineName || ""}
      ${record.locationName || ""}
      ${record.responsibleName || ""}
      ${record.status || ""}
      ${lots}
    `.toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesDate = !productionHistoryFilters.date || record.productionDate === productionHistoryFilters.date;
    const matchesStatus = productionHistoryFilters.status === "Todos" || record.status === productionHistoryFilters.status;

    return matchesSearch && matchesDate && matchesStatus;
  });

  return filtered.sort((a, b) => {
    const field = productionHistorySort.field;
    let valueA = a[field] ?? "";
    let valueB = b[field] ?? "";

    if (typeof valueA === "string") valueA = valueA.toLowerCase();
    if (typeof valueB === "string") valueB = valueB.toLowerCase();

    if (valueA > valueB) return productionHistorySort.direction === "asc" ? 1 : -1;
    if (valueA < valueB) return productionHistorySort.direction === "asc" ? -1 : 1;

    return 0;
  });
}

function getProductionStatusBadgeClass(status) {
  if (status === "Cancelado") return "badge-danger";
  if (status === "Reprocessado") return "badge-warning";
  return "badge-success";
}

function setupProduçãoEvents(options = {}) {
  compactProductionLayout();
  setupProductionHistoryEvents();
  const shouldRefreshAfterLoad = options.navigation || !hasLoadedProductionApi;
  const loadPromise = loadProductionPageFromApi(Boolean(options.navigation)).then(() => {
    if (shouldRefreshAfterLoad) {
      syncProducedLotCodes(true);
      rerenderProdução();
    }
  });

  document.querySelectorAll("[data-production-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeProductionTab = button.dataset.productionTab;
      rerenderProdução();
    });
  });

  document.getElementById("productionDate")?.addEventListener("change", () => {
    captureProductionDraft();
    syncProducedLotCodes(true);
    rerenderProdução();
  });

  document.getElementById("productionLocation")?.addEventListener("change", () => {
    captureProductionDraft();
    resetConsumedLotSelections();
    rerenderProdução();
  });

  document.getElementById("productionOutputMaterial")?.addEventListener("change", () => {
    captureProductionDraft();
    productionDraft.productionModelName = "";
    productionDraft.machineName = "";
    resetConsumedLotSelections();
    producedLots = [createProducedLotDraft(1)];
    applyProductionDefaults();
    syncProducedLotCodes(true);
    rerenderProdução();
  });

  document.getElementById("productionModel")?.addEventListener("change", () => {
    captureProductionDraft();
    productionDraft.locationName = "";
    resetConsumedLotSelections();
    applyProductionDefaults();
    syncProducedLotCodes(true);
    rerenderProdução();
  });

  document.getElementById("productionMachine")?.addEventListener("change", () => {
    captureProductionDraft();
    syncProducedLotCodes(true);
    rerenderProdução();
  });

  document.getElementById("productionObservation")?.addEventListener("input", () => {
    captureProductionDraft();
  });

  document.querySelectorAll(".production-operator-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      captureProductionDraft();
    });
  });

  document.querySelectorAll(".production-consumed-lot-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      const current = normalizeSelectedLotCodes((productionDraft.consumedLotSelections || {})[input.dataset.inputKey]);
      const next = input.checked
        ? [...new Set([...current, input.value])]
        : current.filter((lotCode) => lotCode !== input.value);

      productionDraft.consumedLotSelections = {
        ...(productionDraft.consumedLotSelections || {}),
        [input.dataset.inputKey]: next
      };
      productionDraft.consumedLotCode = next[0] || "";
      rerenderProdução();
    });
  });

  document.querySelectorAll(".produced-lot-quantity").forEach((input) => {
    input.addEventListener("input", () => {
      updateProducedLot(input.dataset.producedLotIndex, { outputQuantity: input.value });
    });
  });

  document.querySelectorAll(".produced-lot-secondary-quantity").forEach((input) => {
    input.addEventListener("input", () => {
      updateProducedLot(input.dataset.producedLotIndex, { outputSecondaryQuantity: input.value });
    });
  });

  document.getElementById("addProducedLotBtn")?.addEventListener("click", () => {
    captureProducedLots();
    producedLots.push(createProducedLotDraft(producedLots.length + 1));
    syncProducedLotCodes();
    rerenderProdução();
  });

  document.querySelectorAll(".remove-produced-lot-btn").forEach((button) => {
    button.addEventListener("click", () => {
      removeProducedLot(button.dataset.producedLotIndex);
    });
  });

  document.getElementById("registerProductionBtn")?.addEventListener("click", registerProduction);

  return loadPromise;
}

function removeProducedLot(index) {
  if (producedLots.length <= 1) return;

  captureProducedLots();
  producedLots.splice(Number(index), 1);
  producedLots = producedLots.map((lot, lotIndex) => ({
    ...lot,
    sequence: lotIndex + 1
  }));
  syncProducedLotCodes(true);
  rerenderProdução();
}

function registerProduction() {
  captureProductionDraft();
  captureProducedLots();

  const material = getSelectedOutputMaterial();
  const model = getSelectedProductionModel();
  const consumedInputs = getModelConsumedInputs(model);
  const selectedConsumedLots = getSelectedConsumedLots();
  const machineRequired = getAllowedMachines(material).length > 0;

  if (!productionDraft.locationName) {
    showProductionError("Selecione o local de produção.");
    return;
  }

  if (!material) {
    showProductionError("Selecione o material produzido.");
    return;
  }

  if (!model) {
    showProductionError("Selecione o modelo de produção.");
    return;
  }

  if (machineRequired && !productionDraft.machineName) {
    showProductionError("Selecione a máquina.");
    return;
  }

  const selectedMachine = getSelectedProductionMachine();
  const materialLotCode = normalizeProductionLotPart(material.lotCode || material.lot_code, 3, true);
  const machineLotCode = normalizeProductionLotPart(selectedMachine?.lotCode || selectedMachine?.lot_code, 5, false);

  if (!materialLotCode || materialLotCode.length !== 3) {
    showProductionError("Configure o Código para lote deste material antes de registrar produção.");
    return;
  }

  if (!selectedMachine) {
    showProductionError("Selecione a máquina para gerar o lote produzido.");
    return;
  }

  if (!machineLotCode || machineLotCode.length !== 5) {
    showProductionError("Configure o Código para lote desta máquina antes de registrar produção.");
    return;
  }

  syncProducedLotCodes(true);

  if (!productionDraft.operatorCodes.length) {
    showProductionError("Selecione ao menos um responsável.");
    return;
  }

  if (!consumedInputs.length) {
    showProductionError("Modelo de produção sem insumo consumido.");
    return;
  }

  if (selectedConsumedLots.length !== consumedInputs.length) {
    showProductionError("Selecione o lote consumido para todos os insumos obrigatórios.");
    return;
  }

  const validProducedLots = normalizeProducedLots();

  if (!validProducedLots.length) {
    showProductionError("Adicione ao menos um lote produzido.");
    return;
  }

  const hasInvalidQuantity = validProducedLots.some((lot) => {
    return !lot.lotCode || lot.outputQuantity <= 0 || (material.secondaryUnit && lot.outputSecondaryQuantity <= 0);
  });

  if (hasInvalidQuantity) {
    showProductionError("Cada lote produzido precisa ter código, quantidade principal maior que zero e quantidade secundária maior que zero quando houver unidade secundária.");
    return;
  }

  const lotCodeValidation = validateProducedLotCodes(validProducedLots);

  if (!lotCodeValidation.valid) {
    showProductionError(lotCodeValidation.message);
    return;
  }

  const validation = validateProducedLimit(material, consumedInputs, selectedConsumedLots, validProducedLots);

  if (!validation.valid) {
    showProductionError(validation.message);
    return;
  }

  const totalOutputQuantity = validProducedLots.reduce((sum, lot) => sum + lot.outputQuantity, 0);
  const totalOutputSecondaryQuantity = validProducedLots.reduce((sum, lot) => sum + lot.outputSecondaryQuantity, 0);
  const consumedItems = validation.consumedItems;
  const consumedQuantity = consumedItems.reduce((sum, item) => sum + item.consumedQuantity, 0);
  const lossCandidates = getIndustrialLossCandidates(consumedItems);

  const record = {
    id: crypto.randomUUID(),
    productionDate: productionDraft.date,
    dateTime: `${productionDraft.date}T00:00:00`,
    locationName: productionDraft.locationName,
    outputMaterialName: material.name,
    outputMaterialCode: material.code,
    outputMaterialType: material.type,
    outputUnit: material.unit,
    outputSecondaryUnit: material.secondaryUnit || "",
    productionModelName: model.name,
    machineName: productionDraft.machineName,
    responsibleName: getSelectedOperatorNames().join(" / "),
    responsibleCodes: [...productionDraft.operatorCodes],
    outputQuantity: totalOutputQuantity,
    outputSecondaryQuantity: totalOutputSecondaryQuantity,
    generatedLotCode: validProducedLots[0]?.lotCode || "",
    observation: productionDraft.observation,
    status: "Processado",
    createdAt: new Date().toISOString()
  };

  pendingProductionPayload = {
    record,
    producedLots: validProducedLots,
    consumedInputs,
    consumedItems,
    consumedQuantity,
    lossCandidates,
    selectedLossIds: lossCandidates.map((loss) => loss.id)
  };

  openProductionConfirmModal(pendingProductionPayload);
}
function captureProductionDraft() {
  productionDraft = {
    ...productionDraft,
    date: document.getElementById("productionDate")?.value || productionDraft.date || getToday(),
    locationName: document.getElementById("productionLocation")?.value || productionDraft.locationName || "",
    outputMaterialName: document.getElementById("productionOutputMaterial")?.value || productionDraft.outputMaterialName || "",
    productionModelName: document.getElementById("productionModel")?.value || productionDraft.productionModelName || "",
    machineName: document.getElementById("productionMachine")?.value || productionDraft.machineName || "",
    observation: document.getElementById("productionObservation")?.value || productionDraft.observation || "",
    operatorCodes: Array.from(document.querySelectorAll(".production-operator-checkbox:checked")).map((input) => input.value)
  };
}

function captureProducedLots() {
  document.querySelectorAll(".produced-lot-code").forEach((input) => {
    updateProducedLot(input.dataset.producedLotIndex, { lotCode: input.value }, false);
  });

  document.querySelectorAll(".produced-lot-quantity").forEach((input) => {
    updateProducedLot(input.dataset.producedLotIndex, { outputQuantity: input.value }, false);
  });

  document.querySelectorAll(".produced-lot-secondary-quantity").forEach((input) => {
    updateProducedLot(input.dataset.producedLotIndex, { outputSecondaryQuantity: input.value }, false);
  });
}

function updateProducedLot(index, patch, shouldRerender = false) {
  const lot = producedLots[Number(index)];

  if (!lot) return;

  Object.assign(lot, patch);
  updateProductionLimitSummary();

  if (shouldRerender) {
    rerenderProdução();
  }
}

function applyProductionDefaults() {
  const locations = getProductionLocationOptions();

  if (locations.length === 1 && productionDraft.locationName !== locations[0].name) {
    productionDraft.locationName = locations[0].name;
  }

  const material = getSelectedOutputMaterial();
  const models = material?.productionModels || [];

  if (models.length === 1 && !productionDraft.productionModelName) {
    productionDraft.productionModelName = models[0].name;
  }

  const machines = getAllowedMachines(material);

  if (machines.length === 1 && !productionDraft.machineName) {
    productionDraft.machineName = machines[0].name;
  }
}

function shouldLockLocationSelect() {
  return getProductionLocationOptions().length === 1;
}

function shouldLockModelSelect() {
  const material = getSelectedOutputMaterial();
  return Boolean(material && (material.productionModels || []).length === 1);
}

function shouldLockMachineSelect() {
  const material = getSelectedOutputMaterial();
  return getAllowedMachines(material).length === 1;
}

function renderLocationOptions(selectedValue = "") {
  const locations = getProductionLocationOptions();

  if (!locations.length) {
    return `<option value="">Nenhum local cadastrado</option>`;
  }

  return `
    <option value="">Selecione um local</option>
    ${locations.map((location) => `
      <option value="${location.name}" ${location.name === selectedValue ? "selected" : ""}>
        ${location.name}
      </option>
    `).join("")}
  `;
}

function getProductionLocationOptions() {
  const locations = getActiveItems(lineStore.locations || []);
  const model = getSelectedProductionModel();
  const modelLocation = model?.sourceLocation;

  if (!modelLocation || modelLocation === "Selecione um local") {
    return locations;
  }

  const matched = locations.filter((location) => location.name === modelLocation);

  return matched.length ? matched : locations;
}

function renderProducedMaterialOptions(selectedValue = "") {
  const materials = getActiveItems(lineStore.materials || []).filter((material) => {
    return material.canBeProduced;
  });

  if (!materials.length) {
    return `<option value="">Nenhum material produzido cadastrado</option>`;
  }

  return `
    <option value="">Selecione um material</option>
    ${materials.map((material) => `
      <option value="${material.name}" ${material.name === selectedValue ? "selected" : ""}>
        ${material.name}
      </option>
    `).join("")}
  `;
}

function renderProductionModelOptions() {
  const material = getSelectedOutputMaterial();
  const models = material?.productionModels || [];

  if (!material) {
    return `<option value="">Selecione um material primeiro</option>`;
  }

  if (!models.length) {
    return `<option value="">Nenhum modelo cadastrado</option>`;
  }

  return `
    <option value="">Selecione um modelo</option>
    ${models.map((model) => `
      <option value="${model.name}" ${model.name === productionDraft.productionModelName ? "selected" : ""}>
        ${model.name}
      </option>
    `).join("")}
  `;
}

function renderMachineOptions(selectedValue = "") {
  const material = getSelectedOutputMaterial();
  const machines = getAllowedMachines(material);

  if (!material) {
    return `<option value="">Selecione um material primeiro</option>`;
  }

  if (!machines.length) {
    return `<option value="">Nenhuma máquina vinculada</option>`;
  }

  return `
    <option value="">Selecione uma máquina</option>
    ${machines.map((machine) => `
      <option value="${machine.name}" ${machine.name === selectedValue ? "selected" : ""}>
        ${machine.name}
      </option>
    `).join("")}
  `;
}

function getSelectedOutputMaterial() {
  if (!productionDraft.outputMaterialName) return null;

  return lineStore.materials.find((material) => {
    return material.name === productionDraft.outputMaterialName;
  });
}

function getSelectedProductionModel() {
  const material = getSelectedOutputMaterial();

  if (!material || !productionDraft.productionModelName) return null;

  return (material.productionModels || []).find((model) => {
    return model.name === productionDraft.productionModelName;
  });
}

function getSelectedProductionMachine() {
  if (!productionDraft.machineName) return null;

  return (lineStore.machines || []).find((machine) => {
    return machine.name === productionDraft.machineName;
  });
}

function getAllowedMachines(material) {
  if (!material) return [];

  const allowedMachines = material.productionMachines || [];

  return getActiveItems(lineStore.machines || []).filter((machine) => {
    return allowedMachines.includes(machine.name);
  });
}

function getModelConsumedInput(model) {
  return getModelConsumedInputs(model)[0] || null;
}

function getModelConsumedInputs(model) {
  return Array.isArray(model?.inputs) ? model.inputs : [];
}

function getConsumedInputKey(consumedInput, index = 0) {
  return `${consumedInput.inputCode || consumedInput.inputMaterial || "input"}-${index}`;
}

function getInputQuantityPerProducedUnit(consumedInput) {
  const quantity = Number(consumedInput.inputQuantity ?? consumedInput.quantity ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function resetConsumedLotSelections() {
  productionDraft.consumedLotCode = "";
  productionDraft.consumedLotSelections = {};
}

function getAvailableConsumedLots(consumedInput) {
  if (!consumedInput || !productionDraft.locationName) return [];

  const snapshot = apiStockSnapshot || buildStockSnapshot(lineStore);

  return snapshot.lots
    .filter((lot) => {
      return (
        lot.balanceMaterialCode === consumedInput.inputCode &&
        lot.locationName === productionDraft.locationName &&
        Number(lot.availableQuantity ?? lot.quantity ?? 0) > 0
      );
    })
    .map((lot) => ({
      id: lot.id,
      lotId: lot.lotId || lot.id,
      lotCode: lot.lotCode,
      locationName: lot.locationName,
      quantity: Number(lot.availableQuantity ?? lot.quantity ?? 0),
      secondaryQuantity: Number(lot.secondaryQuantity || 0),
      productionDate: lot.productionDate || lot.createdAt || ""
    }))
    .sort(compareLotsByAge);
}

function normalizeSelectedLotCodes(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value) return [value];
  return [];
}

function getSelectedConsumedLotCodes(consumedInput) {
  const inputs = getModelConsumedInputs(getSelectedProductionModel());
  const index = inputs.indexOf(consumedInput);
  const key = getConsumedInputKey(consumedInput, index);
  const selected = normalizeSelectedLotCodes((productionDraft.consumedLotSelections || {})[key]);
  if (selected.length) return selected;
  return inputs.length === 1 ? normalizeSelectedLotCodes(productionDraft.consumedLotCode) : [];
}

function getSelectedConsumedLotGroup(consumedInput = getModelConsumedInput(getSelectedProductionModel())) {
  if (!consumedInput) return null;

  const selectedLotCodes = getSelectedConsumedLotCodes(consumedInput);
  if (!selectedLotCodes.length) return null;

  const lots = getAvailableConsumedLots(consumedInput)
    .filter((lot) => selectedLotCodes.includes(lot.lotCode))
    .sort(compareLotsByAge);

  if (!lots.length) return null;

  return {
    input: consumedInput,
    lots,
    quantity: lots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0)
  };
}

function getSelectedConsumedLots() {
  return getModelConsumedInputs(getSelectedProductionModel())
    .map((input) => getSelectedConsumedLotGroup(input))
    .filter(Boolean);
}

function normalizeProducedLots() {
  const material = getSelectedOutputMaterial();

  return producedLots
    .map((lot) => ({
      lotCode: lot.lotCode.trim(),
      outputQuantity: Number(lot.outputQuantity || 0),
      outputSecondaryQuantity: material?.secondaryUnit ? Number(lot.outputSecondaryQuantity || 0) : 0
    }));
}

function normalizeProductionLotPart(value, length, padNumeric = false) {
  const clean = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!clean) return "";
  if (padNumeric && /^\d+$/.test(clean) && clean.length < length) return clean.padStart(length, "0");

  return clean;
}

function formatProductionLotDate(value) {
  const [year, month, day] = String(value || getToday()).slice(0, 10).split("-");

  if (!year || !month || !day) return "";

  return `${day}${month}${year.slice(-2)}`;
}

function getProductionLotPrefix() {
  const material = getSelectedOutputMaterial();
  const machine = getSelectedProductionMachine();
  const materialLotCode = normalizeProductionLotPart(material?.lotCode || material?.lot_code, 3, true);
  const machineLotCode = normalizeProductionLotPart(machine?.lotCode || machine?.lot_code, 5, false);
  const datePart = formatProductionLotDate(productionDraft.date);

  if (!datePart || materialLotCode.length !== 3 || machineLotCode.length !== 5) return "";

  return `${datePart}${materialLotCode}${machineLotCode}`;
}

function getProductionLotCodeContext() {
  const material = getSelectedOutputMaterial();
  const machine = getSelectedProductionMachine();
  const materialLotCode = normalizeProductionLotPart(material?.lotCode || material?.lot_code, 3, true);
  const machineLotCode = normalizeProductionLotPart(machine?.lotCode || machine?.lot_code, 5, false);
  const prefix = getProductionLotPrefix();

  if (!prefix) return null;

  return {
    productionDate: productionDraft.date,
    materialLotCode,
    machineLotCode,
    prefix
  };
}

function generateProductionLotCode({ productionDate, materialLotCode, machineLotCode, existingLots = [] }) {
  const prefix = `${formatProductionLotDate(productionDate)}${materialLotCode}${machineLotCode}`;
  const sequenceNumbers = existingLots
    .filter((lotCode) => String(lotCode || "").startsWith(prefix))
    .map((lotCode) => Number(String(lotCode).slice(-2)))
    .filter((sequence) => Number.isFinite(sequence));
  const nextSequence = sequenceNumbers.length ? Math.max(...sequenceNumbers) + 1 : 1;

  return `${prefix}${String(nextSequence).padStart(2, "0")}`;
}

function getExistingProductionLotCodes() {
  const snapshot = buildStockSnapshot(lineStore);
  const codes = new Set();

  (snapshot.lots || []).forEach((lot) => {
    if (lot.lotCode) codes.add(lot.lotCode);
  });

  (lineStore.productionGeneratedLots || []).forEach((lot) => {
    if (lot.lotCode) codes.add(lot.lotCode);
  });

  (lineStore.productionRecords || []).forEach((record) => {
    if (record.generatedLotCode) codes.add(record.generatedLotCode);
  });

  return [...codes];
}

function syncProducedLotCodes(force = false) {
  const context = getProductionLotCodeContext();

  if (!context) return;

  const existingLots = getExistingProductionLotCodes();

  producedLots.forEach((lot) => {
    if (force || !lot.lotCode || !String(lot.lotCode).startsWith(context.prefix)) {
      lot.lotCode = generateProductionLotCode({
        productionDate: context.productionDate,
        materialLotCode: context.materialLotCode,
        machineLotCode: context.machineLotCode,
        existingLots
      });
    }

    existingLots.push(lot.lotCode);
  });
}

function validateProducedLotCodes(lots) {
  const existingCodes = new Set(getExistingProductionLotCodes());
  const currentCodes = new Set();

  for (const lot of lots) {
    if (!lot.lotCode) {
      return {
        valid: false,
        message: "O código do lote produzido não foi gerado."
      };
    }

    if (currentCodes.has(lot.lotCode)) {
      return {
        valid: false,
        message: "Existe duplicidade de lote produzido nesta produção."
      };
    }

    if (existingCodes.has(lot.lotCode)) {
      return {
        valid: false,
        message: `O lote produzido ${lot.lotCode} já existe no estoque ou histórico.`
      };
    }

    currentCodes.add(lot.lotCode);
  }

  return { valid: true };
}

function compareLotsByAge(a, b) {
  const dateA = new Date(a.productionDate || a.createdAt || 0).getTime() || 0;
  const dateB = new Date(b.productionDate || b.createdAt || 0).getTime() || 0;
  if (dateA !== dateB) return dateA - dateB;
  return String(a.lotCode || a.id || "").localeCompare(String(b.lotCode || b.id || ""));
}

function getStockLossParameters() {
  if (!lineStore.stockLossParameters) {
    lineStore.stockLossParameters = {
      globalLossPercent: 10,
      materialLossPercents: {}
    };
  }

  lineStore.stockLossParameters.materialLossPercents = lineStore.stockLossParameters.materialLossPercents || {};
  lineStore.stockLossParameters.globalLossPercent = Number(lineStore.stockLossParameters.globalLossPercent ?? 10);
  return lineStore.stockLossParameters;
}

function getLossThresholdForInput(consumedInput) {
  const params = getStockLossParameters();
  const materialKey = consumedInput?.inputCode || consumedInput?.inputMaterial || "";
  const override = params.materialLossPercents[materialKey];
  const threshold = override === "" || override === null || override === undefined
    ? params.globalLossPercent
    : Number(override);

  return Number.isFinite(threshold) ? threshold : 10;
}

function simulateLotConsumption(lots, requiredQuantity, consumedInput) {
  let remainingToConsume = Number(requiredQuantity || 0);
  const threshold = getLossThresholdForInput(consumedInput);

  return [...(lots || [])].sort(compareLotsByAge).map((lot) => {
    const originalQuantity = Number(lot.quantity || 0);
    const consumedQuantity = Math.min(originalQuantity, Math.max(remainingToConsume, 0));
    remainingToConsume -= consumedQuantity;
    const remainingQuantity = Math.max(originalQuantity - consumedQuantity, 0);
    const remainingPercent = originalQuantity > 0 ? (remainingQuantity / originalQuantity) * 100 : 0;

    return {
      ...lot,
      consumedQuantity,
      remainingQuantity,
      remainingPercent,
      thresholdPercent: threshold,
      isLowStock: consumedQuantity > 0 && remainingQuantity > 0 && remainingPercent <= threshold
    };
  }).filter((lot) => lot.consumedQuantity > 0);
}

function getConsumptionSimulationForInput(consumedInput, lots = getAvailableConsumedLots(consumedInput)) {
  const material = getSelectedOutputMaterial();
  const requiredQuantity = getConsumedQuantityForProducedLots(material, consumedInput, producedLots);
  const selectedCodes = getSelectedConsumedLotCodes(consumedInput);
  const selectedLots = lots.filter((lot) => selectedCodes.includes(lot.lotCode));

  return {
    requiredQuantity,
    allocations: simulateLotConsumption(selectedLots, requiredQuantity, consumedInput)
  };
}

function getIndustrialLossCandidates(consumedItems) {
  return consumedItems.flatMap((item) => {
    return (item.allocations || [])
      .filter((allocation) => allocation.isLowStock)
      .map((allocation) => ({
        id: `${item.consumedInput.inputCode || item.consumedInput.inputMaterial}-${allocation.lotCode}`,
        inputMaterial: item.consumedInput.inputMaterial,
        inputCode: item.consumedInput.inputCode,
        inputUnit: item.consumedInput.inputUnit,
        lotId: allocation.lotId || allocation.id,
        sourceLotId: allocation.id,
        lotCode: allocation.lotCode,
        locationName: allocation.locationName,
        remainingQuantity: allocation.remainingQuantity,
        remainingPercent: allocation.remainingPercent,
        thresholdPercent: allocation.thresholdPercent,
        secondaryQuantity: 0
      }));
  });
}

function getSelectedLossesFromConfirmModal() {
  return Array.from(document.querySelectorAll(".production-loss-checkbox:checked"))
    .map((input) => input.value);
}

function buildConsumedLotsWithLosses(item, selectedLossIds = []) {
  const allocations = (item.allocations || []).map((allocation) => ({
    sourceLotId: allocation.id,
    lotId: allocation.lotId || allocation.id,
    lotCode: allocation.lotCode,
    locationName: allocation.locationName,
    quantity: allocation.consumedQuantity,
    secondaryQuantity: null,
    eventType: "PRODUCTION_CONSUME"
  }));

  const selectedLosses = getIndustrialLossCandidates([item])
    .filter((loss) => selectedLossIds.includes(loss.id))
    .map((loss) => ({
      sourceLotId: loss.sourceLotId,
      lotId: loss.lotId,
      lotCode: loss.lotCode,
      locationName: loss.locationName,
      quantity: loss.remainingQuantity,
      secondaryQuantity: loss.secondaryQuantity,
      eventType: "INDUSTRIAL_LOSS",
      isIndustrialLoss: true,
      notes: "Perda industrial do saldo remanescente após produção"
    }));

  return [...allocations, ...selectedLosses].filter((lot) => Number(lot.quantity || 0) > 0);
}

function validateProducedLimit(material, consumedInputs, selectedConsumedLots, lots) {
  const consumedItems = consumedInputs.map((input, index) => {
    const consumedLotGroup = selectedConsumedLots[index];
    const consumedQuantity = getConsumedQuantityForProducedLots(material, input, lots);
    const allocations = consumedLotGroup
      ? simulateLotConsumption(consumedLotGroup.lots, consumedQuantity, input)
      : [];

    return {
      consumedInput: input,
      consumedLotGroup,
      consumedLots: consumedLotGroup?.lots || [],
      consumedQuantity,
      allocations
    };
  });

  for (const item of consumedItems) {
    if (item.consumedQuantity === null) {
      return {
        valid: false,
        message: `A unidade consumida de ${item.consumedInput.inputMaterial} precisa ser igual à unidade principal ou secundária do material produzido.`
      };
    }

    if (item.consumedQuantity <= 0) {
      return {
        valid: false,
        message: "Informe as quantidades produzidas para validar o consumo."
      };
    }

    if (!item.consumedLotGroup || !item.consumedLots.length) {
      return {
        valid: false,
        message: `Selecione o lote consumido para ${item.consumedInput.inputMaterial}.`
      };
    }

    const availableQuantity = item.consumedLots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);

    if (item.consumedQuantity > availableQuantity + 0.0001) {
      return {
        valid: false,
        message: `A produção informada ultrapassa a quantidade disponível no lote de ${item.consumedInput.inputMaterial}.`
      };
    }
  }

  return {
    valid: true,
    consumedItems
  };
}

function getProductionLimitSummary(material, consumedInputs, selectedConsumedLots) {
  const totalPrincipal = getProducedTotalPrincipal();
  const totalSecondary = getProducedTotalSecondary();

  return consumedInputs.map((input, index) => {
    const consumedLot = selectedConsumedLots[index];
    const consumedQuantity = getConsumedQuantityForProducedLots(material, input, producedLots);
    const availableQuantity = Number(consumedLot?.quantity || 0);

    return {
      input,
      consumedLot,
      totalPrincipal,
      totalSecondary,
      consumedQuantity: consumedQuantity ?? 0,
      availableQuantity,
      isOverLimit: (consumedQuantity ?? 0) > availableQuantity
    };
  });
}

function getConsumedQuantityForProducedLots(material, consumedInput, lots) {
  const totalOutputQuantity = lots.reduce((sum, lot) => sum + Number(lot.outputQuantity || 0), 0);

  if (consumedInput?.consumptionMode === "Variável na produção") {
    return getProducedQuantityForConsumedUnit(material, consumedInput, lots);
  }

  return totalOutputQuantity * getInputQuantityPerProducedUnit(consumedInput);
}

function normalizeUnitName(unit) {
  return String(unit || "").trim().toLowerCase();
}

function getProducedQuantityForConsumedUnit(material, consumedInput, lots) {
  const consumedUnit = normalizeUnitName(consumedInput?.inputUnit || consumedInput?.unit);
  const primaryUnit = normalizeUnitName(material?.unit || material?.primaryUnit);
  const secondaryUnit = normalizeUnitName(material?.secondaryUnit);

  if (consumedUnit && secondaryUnit && consumedUnit === secondaryUnit) {
    return lots.reduce((sum, lot) => sum + Number(lot.outputSecondaryQuantity || 0), 0);
  }

  if (!consumedUnit || consumedUnit === primaryUnit) {
    return lots.reduce((sum, lot) => sum + Number(lot.outputQuantity || 0), 0);
  }

  return null;
}

function getProducedTotalPrincipal() {
  return producedLots.reduce((sum, lot) => {
    return sum + Number(lot.outputQuantity || 0);
  }, 0);
}

function getProducedTotalSecondary() {
  return producedLots.reduce((sum, lot) => {
    return sum + Number(lot.outputSecondaryQuantity || 0);
  }, 0);
}

function getGeneratedLotsByRecord(recordId) {
  return (lineStore.productionGeneratedLots || []).filter((lot) => {
    return lot.productionRecordId === recordId;
  });
}

function getSelectedOperatorNames() {
  return productionDraft.operatorCodes.map((code) => {
    const operator = (lineStore.operators || []).find((item) => item.code === code);
    return operator?.name || code;
  });
}

function getGeneratedLotSuggestion(sequence) {
  const context = getProductionLotCodeContext();

  if (!context) return "Gerado automaticamente";

  const existingLots = getExistingProductionLotCodes();

  producedLots.slice(0, Math.max(Number(sequence) - 1, 0)).forEach((lot) => {
    if (lot.lotCode) existingLots.push(lot.lotCode);
  });

  return generateProductionLotCode({
    productionDate: context.productionDate,
    materialLotCode: context.materialLotCode,
    machineLotCode: context.machineLotCode,
    existingLots
  });
}

function openProductionConfirmModal(payload) {
  document.querySelector(".production-confirm-backdrop")?.remove();

  const modal = document.createElement("div");
  modal.className = "modal-backdrop open movement-detail-backdrop production-confirm-backdrop";
  modal.innerHTML = renderProductionConfirmModal(payload);
  document.getElementById("appContent").appendChild(modal);

  modal.querySelector("#confirmProductionBtn")?.addEventListener("click", confirmProductionRegistration);
  modal.querySelector("#editProductionConfirmBtn")?.addEventListener("click", closeProductionConfirmModal);
  modal.querySelector("#deleteProductionDraftBtn")?.addEventListener("click", deletePendingProductionDraft);
}

function closeProductionConfirmModal() {
  document.querySelector(".production-confirm-backdrop")?.remove();
}

function deletePendingProductionDraft() {
  pendingProductionPayload = null;
  closeProductionConfirmModal();
  productionDraft = createProductionDraft();
  producedLots = [createProducedLotDraft(1)];
  productionNotice = null;
  activeProductionTab = "NEW";
  rerenderProdução();
}

function renderProductionConfirmModal(payload) {
  const { record, producedLots: lots, consumedItems, lossCandidates = [], selectedLossIds = [] } = payload;

  return `
    <div class="modal large-modal movement-detail-modal">
      <div class="modal-header">
        <div>
          <h2>Confirmar produção</h2>
          <p>Revise o apontamento antes de registrar definitivamente.</p>
        </div>
      </div>

      <div class="movement-detail-grid">
        <div><small>Data</small><strong>${formatDateTime(record.createdAt || record.productionDate)}</strong></div>
        <div><small>Local</small><strong>${record.locationName || "-"}</strong></div>
        <div><small>Material produzido</small><strong>${record.outputMaterialName || "-"}</strong></div>
        <div><small>Modelo</small><strong>${record.productionModelName || "-"}</strong></div>
        <div><small>Máquina</small><strong>${record.machineName || "-"}</strong></div>
        <div><small>Responsáveis</small><strong>${record.responsibleName || "-"}</strong></div>
      </div>

      <div class="movement-detail-section production-confirm-consumed-lots">
        <h3>Lotes consumidos</h3>
        <div class="data-table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Lote</th>
                <th>Consumo</th>
                <th>Saldo previsto</th>
              </tr>
            </thead>
            <tbody>
              ${consumedItems.flatMap((item) => (item.allocations || []).map((allocation) => `
                <tr>
                  <td><strong>${item.consumedInput.inputMaterial}</strong></td>
                  <td>${allocation.lotCode || "-"}</td>
                  <td>${formatNumber(allocation.consumedQuantity)} ${item.consumedInput.inputUnit || ""}</td>
                  <td>${formatNumber(allocation.remainingQuantity)} ${item.consumedInput.inputUnit || ""}</td>
                </tr>
              `)).join("")}
            </tbody>
          </table>
        </div>
      </div>

      ${lossCandidates.length ? `
        <div class="movement-detail-section production-loss-warning">
          <h3>Possíveis perdas industriais</h3>
          <p>Os lotes abaixo ficarão com saldo menor ou igual ao percentual configurado. Escolha quais saldos remanescentes devem ser baixados como perda rastreável.</p>
          <div class="production-loss-list">
            ${lossCandidates.map((loss) => `
              <label class="production-loss-item">
                <input
                  class="production-loss-checkbox"
                  type="checkbox"
                  value="${loss.id}"
                  ${selectedLossIds.includes(loss.id) ? "checked" : ""}
                />
                <span>
                  <strong>${loss.lotCode}</strong>
                  ${loss.inputMaterial} · saldo ${formatNumber(loss.remainingQuantity)} ${loss.inputUnit || ""} · ${formatPercent(loss.remainingPercent)} restante
                </span>
              </label>
            `).join("")}
          </div>
        </div>
      ` : ""}

      ${renderGeneratedLotsReadOnly(lots.map((lot) => ({
        lotCode: lot.lotCode,
        quantity: lot.outputQuantity,
        secondaryQuantity: lot.outputSecondaryQuantity,
        unit: record.outputUnit,
        secondaryUnit: record.outputSecondaryUnit
      })), record, "production-confirm-output-lots")}

      ${
        !isProductionEditMode && record.observation
          ? `<div class="movement-detail-note"><strong>Observação:</strong> ${record.observation}</div>`
          : ""
      }

      <div class="modal-footer between">
        <button id="deleteProductionDraftBtn" class="danger-btn" type="button">Excluir</button>
        <div class="modal-footer-actions">
          <button id="editProductionConfirmBtn" class="secondary-btn" type="button">Editar</button>
          <button id="confirmProductionBtn" class="primary-btn" type="button">Confirmar produção</button>
        </div>
      </div>
    </div>
  `;
}

async function confirmProductionRegistration() {
  if (!pendingProductionPayload) return;

  pendingProductionPayload.selectedLossIds = getSelectedLossesFromConfirmModal();

  const { record, producedLots: lots, consumedItems, selectedLossIds = [] } = pendingProductionPayload;

  const savedProduction = await createProductionFromApi(pendingProductionPayload);

  if (savedProduction !== null) {
    if (savedProduction) {
      pendingProductionPayload = null;
      closeProductionConfirmModal();
      productionDraft = createProductionDraft();
      producedLots = [createProducedLotDraft(1)];
      productionNotice = null;
      activeProductionTab = "HISTORY";
      await reloadProductionFromApi();
      rerenderProdução();
    }

    return;
  }

  lineStore.productionRecords.unshift(record);

  lots.forEach((lot) => {
    lineStore.productionGeneratedLots.unshift({
      id: crypto.randomUUID(),
      productionRecordId: record.id,
      materialName: record.outputMaterialName,
      materialCode: record.outputMaterialCode,
      materialType: record.outputMaterialType,
      lotCode: lot.lotCode,
      locationName: record.locationName,
      quantity: lot.outputQuantity,
      secondaryQuantity: lot.outputSecondaryQuantity,
      unit: record.outputUnit,
      secondaryUnit: record.outputSecondaryUnit,
      origin: "Produção",
      productionDate: record.productionDate,
      createdAt: new Date().toISOString()
    });
  });

  consumedItems.forEach((item) => {
    lineStore.productionRecordItems.unshift({
      id: crypto.randomUUID(),
      productionRecordId: record.id,
      inputMaterial: item.consumedInput.inputMaterial,
      inputCode: item.consumedInput.inputCode,
      inputUnit: item.consumedInput.inputUnit,
      consumptionMode: item.consumedInput.consumptionMode,
      requiredQuantity: item.consumedQuantity,
      consumedLots: buildConsumedLotsWithLosses(item, selectedLossIds),
      sourceLocation: productionDraft.locationName,
      notes: item.consumedInput.notes || ""
    });
  });

  (pendingProductionPayload.lossCandidates || [])
    .filter((loss) => selectedLossIds.includes(loss.id))
    .forEach((loss) => {
      lineStore.industrialLossEvents.unshift({
        id: crypto.randomUUID(),
        productionRecordId: record.id,
        lotId: loss.lotId,
        lotCode: loss.lotCode,
        materialCode: loss.inputCode,
        materialName: loss.inputMaterial,
        quantity: loss.remainingQuantity,
        unit: loss.inputUnit,
        type: "INDUSTRIAL_LOSS",
        createdAt: new Date().toISOString(),
        notes: "Perda industrial registrada na confirmação da produção"
      });
    });

  pendingProductionPayload = null;
  closeProductionConfirmModal();

  productionDraft = createProductionDraft();
  producedLots = [createProducedLotDraft(1)];
  productionNotice = null;
  activeProductionTab = "HISTORY";

  rerenderProdução();
}

function compactProductionLayout() {
  const formGrid = document.querySelector(".production-card > .form-grid");

  if (formGrid) {
    [
      "productionDate",
      "productionOutputMaterial",
      "productionModel",
      "productionMachine",
      "productionLocation"
    ].forEach((id) => {
      const label = document.getElementById(id)?.closest("label");
      if (label) formGrid.appendChild(label);
    });
  }

  const operatorBox = document.querySelector(".production-operator-grid")?.closest(".production-model-preview");
  const observationField = document.getElementById("productionObservation");

  if (operatorBox && observationField && !document.querySelector(".production-responsible-observation-row")) {
    const row = document.createElement("div");
    row.className = "production-responsible-observation-row";

    operatorBox.parentNode.insertBefore(row, operatorBox);
    row.appendChild(operatorBox);
    observationField.classList.remove("full-field");
    row.appendChild(observationField);
  }

  showProductionNotice();
}

function showProductionNotice() {
  document.querySelector(".production-system-notice")?.remove();

  if (!productionNotice) return;

  const target =
    document.querySelector(".production-responsible-observation-row") ||
    document.querySelector(".production-card > .form-grid");

  if (!target) return;

  const notice = document.createElement("div");
  notice.className = `movement-system-notice production-system-notice ${productionNotice.type}`;
  notice.innerHTML = `
    <strong>${productionNotice.title}</strong>
    <span>${productionNotice.message}</span>
  `;

  target.insertAdjacentElement("afterend", notice);
}

function updateProductionLimitSummary() {
  const summary = document.getElementById("productionLimitSummary");
  const material = getSelectedOutputMaterial();
  const model = getSelectedProductionModel();
  const consumedInputs = getModelConsumedInputs(model);
  const selectedConsumedLots = getSelectedConsumedLots();

  if (!summary || !material || !consumedInputs.length || selectedConsumedLots.length !== consumedInputs.length) return;

  const next = document.createElement("div");
  next.innerHTML = renderProductionLimitBox(material, consumedInputs, selectedConsumedLots).trim();
  summary.replaceWith(next.firstElementChild);
}

function setupProductionHistoryEvents() {
  if (activeProductionTab !== "HISTORY") return;

  document.getElementById("productionHistorySearch")?.addEventListener("input", (event) => {
    productionHistoryFilters.search = event.target.value;
    refreshProductionHistoryResults();
  });

  document.getElementById("productionHistoryDate")?.addEventListener("change", (event) => {
    productionHistoryFilters.date = event.target.value;
    rerenderProdução();
  });

  document.getElementById("productionHistoryStatus")?.addEventListener("change", (event) => {
    productionHistoryFilters.status = event.target.value;
    rerenderProdução();
  });

  setupProductionHistoryTableEvents();
}

function refreshProductionHistoryResults() {
  const results = document.getElementById("productionHistoryResults");

  if (!results) return;

  results.innerHTML = renderProductionHistoryResults();
  setupProductionHistoryTableEvents();
}

function setupProductionHistoryTableEvents() {
  document.querySelectorAll("[data-production-sort]").forEach((column) => {
    column.addEventListener("click", () => {
      const field = column.dataset.productionSort;

      if (productionHistorySort.field === field) {
        productionHistorySort.direction = productionHistorySort.direction === "asc" ? "desc" : "asc";
      } else {
        productionHistorySort.field = field;
        productionHistorySort.direction = "asc";
      }

      refreshProductionHistoryResults();
    });
  });

  document.querySelectorAll(".production-history-row").forEach((row) => {
    const recordId = row.dataset.productionRecordId;

    row.classList.add("clickable-row");
    row.addEventListener("click", () => openProductionRecordModal(recordId));
  });
}

function openProductionRecordModal(recordId, editMode = false) {
  selectedProductionRecordId = recordId;
  isProductionEditMode = editMode;
  document.querySelector(".production-detail-backdrop")?.remove();

  const record = (lineStore.productionRecords || []).find((item) => item.id === recordId);
  if (!record) return;

  if (editMode && productionEditRecordId !== recordId) {
    productionEditRecordId = recordId;
    productionEditDraft = createProductionEditDraft(record);
  }

  if (!editMode) {
    productionEditRecordId = null;
    productionEditDraft = null;
  }

  const modal = document.createElement("div");
  modal.className = "modal-backdrop open movement-detail-backdrop production-detail-backdrop";
  modal.innerHTML = renderProductionRecordModal(record);
  document.getElementById("appContent").appendChild(modal);

  modal.querySelector("#closeProductionDetailBtn")?.addEventListener("click", closeProductionRecordModal);
  modal.querySelector("#closeProductionDetailFooterBtn")?.addEventListener("click", () => {
    if (isProductionEditMode) {
      openProductionRecordModal(record.id, false);
      return;
    }

    closeProductionRecordModal();
  });
  modal.querySelector("#editProductionBtn")?.addEventListener("click", () => {
    openProductionRecordModal(record.id, true);
  });
  modal.querySelector("#cancelProductionEditBtn")?.addEventListener("click", () => {
    openProductionRecordModal(record.id, false);
  });
  modal.querySelector("#saveProductionEditBtn")?.addEventListener("click", () => {
    saveProductionEdit(record.id);
  });
  setupProductionEditModalEvents(record);
  modal.querySelector("#cancelProductionBtn")?.addEventListener("click", () => openProductionStatusWarning(record.id, "Cancelado"));
  modal.querySelector("#reprocessProductionBtn")?.addEventListener("click", () => openProductionStatusWarning(record.id, "Reprocessado"));
  modal.querySelectorAll(".production-output-lot-status-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const outputLot = (productionEditDraft?.outputLots || []).find((lot) => lot.lotId === button.dataset.outputLotId || lot.id === button.dataset.outputLotId);
      if (!outputLot) return;
      openProductionOutputLotWarning(record.id, outputLot, button.dataset.outputLotAction);
    });
  });
}

function closeProductionRecordModal() {
  selectedProductionRecordId = null;
  isProductionEditMode = false;
  productionEditDraft = null;
  productionEditRecordId = null;
  document.querySelector(".production-detail-backdrop")?.remove();
}

async function updateProductionStatus(recordId, status) {
  const record = (lineStore.productionRecords || []).find((item) => item.id === recordId);
  if (!record) return;

  const changed = await changeProductionStatusFromApi(recordId, status);

  if (changed !== null) return;

  record.status = status;

  if (status === "Cancelado") {
    record.canceledAt = new Date().toISOString();
  } else {
    record.reprocessedAt = new Date().toISOString();
  }

  closeProductionRecordModal();
  rerenderProdução();
}

async function saveProductionEdit(recordId) {
  const record = (lineStore.productionRecords || []).find((item) => item.id === recordId);
  if (!record) return;

  captureProductionEditDraft();
  const draft = productionEditDraft || createProductionEditDraft(record);
  const material = lineStore.materials.find((item) => item.name === draft.outputMaterialName);
  const model = (material?.productionModels || []).find((item) => item.name === draft.productionModelName);
  const machine = lineStore.machines.find((item) => item.name === draft.machineName);
  const location = lineStore.locations.find((item) => item.name === draft.locationName);

  try {
    const updated = await apiPut(`/api/productions/${recordId}`, {
      productionDate: draft.productionDate,
      materialId: material?.id || record.outputMaterialId || null,
      outputMaterialName: draft.outputMaterialName,
      outputUnit: material?.unit || record.outputUnit || "",
      outputSecondaryUnit: material?.secondaryUnit || record.outputSecondaryUnit || "",
      productionModelId: model?.id || record.productionModelId || null,
      productionModelName: draft.productionModelName,
      machineId: machine?.id || record.machineId || null,
      machineName: draft.machineName,
      locationId: location?.id || record.locationId || null,
      locationName: draft.locationName,
      operatorCodes: draft.operatorCodes,
      consumedQuantity: Number(draft.consumedQuantity || 0),
      consumedLot: {
        lotId: draft.consumedLotId || null,
        lotCode: draft.consumedLotCode,
        quantity: Number(draft.consumedQuantity || 0)
      },
      outputLots: draft.outputLots.map((lot) => ({
        id: lot.id || null,
        lotId: lot.lotId || null,
        lotCode: lot.lotCode,
        quantity: Number(lot.quantity || 0),
        secondaryQuantity: Number(lot.secondaryQuantity || 0),
        status: lot.status || lot.lotStatus || ""
      })),
      observation: draft.observation
    });

    await reloadProductionFromApi();
    closeProductionRecordModal();
    openProductionRecordModal(updated.id, false);
    refreshProductionHistoryResults();
  } catch (error) {
    if (shouldUseLocalFallback(error)) {
      record.productionDate = draft.productionDate;
      record.locationName = draft.locationName;
      record.outputMaterialName = draft.outputMaterialName;
      record.productionModelName = draft.productionModelName;
      record.machineName = draft.machineName;
      record.observation = draft.observation;
      record.responsibleCodes = draft.operatorCodes;
      record.responsibleName = draft.operatorCodes.map((code) => {
        const operator = (lineStore.operators || []).find((item) => item.code === code);
        return operator?.name || code;
      }).join(" / ");
      openProductionRecordModal(recordId, false);
      refreshProductionHistoryResults();
      return;
    }

    productionNotice = {
      type: "danger",
      title: "Produção nao editada",
      message: error.message
    };
    closeProductionRecordModal();
    rerenderProdução();
  }
}

async function changeProductionStatusFromApi(recordId, status) {
  const action = status === "Cancelado" ? "cancel" : "reprocess";

  try {
    await apiPost(`/api/productions/${recordId}/${action}`, {});
    await reloadProductionFromApi();
    closeProductionRecordModal();
    rerenderProdução();
    return true;
  } catch (error) {
    if (shouldUseLocalFallback(error)) {
      console.log("API indisponivel, alterando status da produção localmente");
      return null;
    }

    showProductionBlockingAlert(
      status === "Cancelado" ? "Produção não cancelada" : "Reprocessamento negado",
      getProductionStatusErrorMessage(error, status)
    );
    return false;
  }
}

async function changeProductionOutputLotStatusFromApi(recordId, outputLot, action) {
  try {
    const updated = await apiPost(`/api/productions/${recordId}/output-lots/${outputLot.lotId || outputLot.id}/${action}`, {});
    await reloadProductionFromApi();
    productionEditRecordId = null;
    productionEditDraft = null;
    closeProductionOutputLotWarning();
    openProductionRecordModal(updated?.id || recordId, true);
    refreshProductionHistoryResults();
    return true;
  } catch (error) {
    if (shouldUseLocalFallback(error)) {
      console.log("API indisponivel, lote produzido nao alterado localmente");
      return null;
    }

    closeProductionOutputLotWarning();
    showProductionBlockingAlert(
      action === "cancel" ? "Lote não cancelado" : "Reprocessamento negado",
      getOutputLotStatusErrorMessage(error, action)
    );
    return false;
  }
}

function openProductionStatusWarning(recordId, status) {
  productionStatusAction = { recordId, status };
  document.querySelector(".production-status-warning-backdrop")?.remove();

  const modal = document.createElement("div");
  modal.className = "modal-backdrop open danger-backdrop production-status-warning-backdrop";
  modal.innerHTML = renderProductionStatusWarning(status);
  document.getElementById("appContent").appendChild(modal);

  const awareInput = modal.querySelector("#productionStatusAwareInput");
  const confirmBtn = modal.querySelector("#confirmProductionStatusBtn");

  awareInput?.addEventListener("change", () => {
    confirmBtn.disabled = !awareInput.checked;
  });

  modal.querySelector("#cancelProductionStatusWarningBtn")?.addEventListener("click", closeProductionStatusWarning);
  confirmBtn?.addEventListener("click", async () => {
    if (!productionStatusAction) return;

    const action = productionStatusAction;
    closeProductionStatusWarning();
    await updateProductionStatus(action.recordId, action.status);
  });
}

function closeProductionStatusWarning() {
  productionStatusAction = null;
  document.querySelector(".production-status-warning-backdrop")?.remove();
}

function openProductionOutputLotWarning(recordId, outputLot, action) {
  productionOutputLotAction = { recordId, outputLot, action };
  document.querySelector(".production-output-lot-warning-backdrop")?.remove();

  const modal = document.createElement("div");
  modal.className = "modal-backdrop open danger-backdrop production-output-lot-warning-backdrop";
  modal.innerHTML = renderProductionOutputLotWarning(outputLot, action);
  document.getElementById("appContent").appendChild(modal);

  const awareInput = modal.querySelector("#productionOutputLotAwareInput");
  const confirmBtn = modal.querySelector("#confirmProductionOutputLotBtn");

  awareInput?.addEventListener("change", () => {
    confirmBtn.disabled = !awareInput.checked;
  });

  modal.querySelector("#cancelProductionOutputLotWarningBtn")?.addEventListener("click", closeProductionOutputLotWarning);
  confirmBtn?.addEventListener("click", async () => {
    if (!productionOutputLotAction) return;

    const currentAction = productionOutputLotAction;
    await changeProductionOutputLotStatusFromApi(currentAction.recordId, currentAction.outputLot, currentAction.action);
  });
}

function closeProductionOutputLotWarning() {
  productionOutputLotAction = null;
  document.querySelector(".production-output-lot-warning-backdrop")?.remove();
}

function renderProductionOutputLotWarning(outputLot, action) {
  const isCancel = action === "cancel";

  return `
    <div class="modal danger-modal">
      <div class="delete-alert-icon">⚠️</div>

      <div class="modal-header vertical">
        <div>
          <h2>${isCancel ? "Cancelar lote produzido" : "Reprocessar lote produzido"}</h2>
          <p>
            ${isCancel
              ? `O lote ${outputLot.lotCode} sera removido do saldo e a quantidade sera devolvida ao lote consumido.`
              : `O lote ${outputLot.lotCode} voltara ao saldo e a quantidade sera baixada do lote consumido.`}
          </p>
        </div>
      </div>

      <div class="danger-warning-box">
        <strong>Atenção:</strong>
        <span>Essa ação altera estoque e rastreabilidade apenas deste lote produzido.</span>
      </div>

      <label class="aware-check">
        <input id="productionOutputLotAwareInput" type="checkbox" />
        Estou ciente do impacto parcial no estoque e desejo continuar.
      </label>

      <div class="modal-footer">
        <button class="secondary-btn" id="cancelProductionOutputLotWarningBtn" type="button">Voltar</button>
        <button class="${isCancel ? "danger-btn" : "success-btn"}" id="confirmProductionOutputLotBtn" type="button" disabled>
          ${isCancel ? "Confirmar cancelamento" : "Confirmar reprocessamento"}
        </button>
      </div>
    </div>
  `;
}

function renderProductionStatusWarning(status) {
  const isCancel = status === "Cancelado";

  return `
    <div class="modal danger-modal">
      <div class="delete-alert-icon">⚠️</div>

      <div class="modal-header vertical">
        <div>
          <h2>${isCancel ? "Confirmar cancelamento da produção" : "Confirmar reprocessamento da produção"}</h2>
          <p>
            ${
              isCancel
                ? "Cancelar produção altera o estoque porque remove o efeito deste apontamento."
                : "Reprocessar produção volta a impactar o estoque com o efeito deste apontamento."
            }
          </p>
        </div>
      </div>

      <div class="danger-warning-box">
        <strong>Atenção:</strong>
        <span>Essa ação altera os saldos calculados pela engine de estoque a partir do status da produção.</span>
      </div>

      <label class="aware-check">
        <input id="productionStatusAwareInput" type="checkbox" />
        Estou ciente do impacto no estoque e desejo continuar.
      </label>

      <div class="modal-footer">
        <button class="secondary-btn" id="cancelProductionStatusWarningBtn" type="button">Voltar</button>
        <button class="${isCancel ? "danger-btn" : "success-btn"}" id="confirmProductionStatusBtn" type="button" disabled>
          ${isCancel ? "Confirmar cancelamento" : "Confirmar reprocessamento"}
        </button>
      </div>
    </div>
  `;
}

function renderProductionRecordModal(record) {
  const generatedLots = getGeneratedLotsByRecord(record.id);
  const consumedItems = getConsumedItemsByRecord(record.id);

  return `
    <div class="modal large-modal movement-detail-modal">
      <div class="modal-header">
        <div>
          <h2>Produção ${record.status === "Cancelado" ? "cancelada" : "processada"}</h2>
          <p>Consulta do apontamento e dos lotes gerados.</p>
        </div>

        <button id="closeProductionDetailBtn" class="modal-close" type="button">×</button>
      </div>

      <div class="movement-detail-grid">
        <div><small>Data</small><strong>${formatDateTime(record.createdAt || record.productionDate)}</strong></div>
        <div><small>Status</small><strong>${record.status}</strong></div>
        <div><small>Local</small><strong>${record.locationName || "-"}</strong></div>
        <div><small>Material produzido</small><strong>${record.outputMaterialName || "-"}</strong></div>
        <div><small>Modelo</small><strong>${record.productionModelName || "-"}</strong></div>
        <div><small>Máquina</small><strong>${record.machineName || "-"}</strong></div>
        <div><small>Responsáveis</small><strong>${record.responsibleName || "-"}</strong></div>
      </div>

      ${renderConsumedLotsReadOnly(consumedItems)}
      ${renderIndustrialLossesReadOnly(consumedItems)}
      ${renderGeneratedLotsReadOnly(generatedLots, record, "production-detail-output-lots")}

      ${isProductionEditMode ? renderProductionEditFields(record) : ""}

      ${
        record.observation
          ? `<div class="movement-detail-note"><strong>Observação:</strong> ${record.observation}</div>`
          : ""
      }

      <div class="modal-footer between">
        <button id="closeProductionDetailFooterBtn" class="secondary-btn" type="button">${isProductionEditMode ? "Cancelar edição" : "Fechar"}</button>

        <div class="modal-footer-actions">
          ${renderProductionRecordActions(record)}
        </div>
      </div>
    </div>
  `;
}

function renderProductionRecordActions(record) {
  if (!isProductionEditMode) {
    return `
      <button id="editProductionBtn" class="secondary-btn" type="button">Editar</button>
      ${
        record.status === "Cancelado"
          ? `<button id="reprocessProductionBtn" class="success-btn" type="button">Reprocessar</button>`
          : ""
      }
    `;
  }

  return `
    <button id="saveProductionEditBtn" class="primary-btn" type="button">Salvar edição</button>
    ${record.status === "Cancelado" ? "" : `<button id="cancelProductionBtn" class="danger-btn" type="button">Cancelar produção</button>`}
  `;
}

function createProductionEditDraft(record) {
  const consumedItem = getConsumedItemsByRecord(record.id)[0] || record.consumedItems?.[0] || {};
  const consumedLot = consumedItem.consumedLots?.[0] || {};
  const outputLots = getGeneratedLotsByRecord(record.id);

  return {
    productionDate: record.productionDate || getToday(),
    locationName: record.locationName || "",
    outputMaterialName: record.outputMaterialName || "",
    productionModelName: record.productionModelName || "",
    machineName: record.machineName || "",
    operatorCodes: Array.isArray(record.responsibleCodes) ? [...record.responsibleCodes] : [],
    consumedLotId: consumedLot.sourceLotId || consumedLot.lotId || "",
    consumedLotCode: consumedLot.lotCode || "",
    consumedQuantity: consumedLot.quantity || consumedItem.requiredQuantity || "",
    observation: record.observation || "",
    outputLots: outputLots.length
      ? outputLots.map((lot) => ({
          id: lot.id || "",
          lotId: lot.lotId || lot.id || "",
          lotCode: lot.lotCode || "",
          quantity: lot.quantity || "",
          secondaryQuantity: lot.secondaryQuantity || "",
          status: lot.status || lot.lotStatus || ""
        }))
      : [{
          id: "",
          lotId: "",
          lotCode: record.generatedLotCode || "",
          quantity: record.outputQuantity || "",
          secondaryQuantity: record.outputSecondaryQuantity || "",
          status: ""
        }]
  };
}

function captureProductionEditDraft() {
  if (!productionEditDraft) return;

  const outputLotCards = Array.from(document.querySelectorAll("[data-edit-output-lot-index]"))
    .filter((element) => element.classList.contains("production-lot-card"));
  const capturedOutputLots = outputLotCards.length
    ? outputLotCards.map((element) => {
        const index = element.dataset.editOutputLotIndex;
        const originalLot = productionEditDraft.outputLots[Number(index)] || {};
        return {
          id: originalLot.id || "",
          lotId: originalLot.lotId || "",
          lotCode: document.querySelector(`.production-edit-output-lot-code[data-edit-output-lot-index="${index}"]`)?.value || "",
          quantity: document.querySelector(`.production-edit-output-lot-quantity[data-edit-output-lot-index="${index}"]`)?.value || "",
          secondaryQuantity: document.querySelector(`.production-edit-output-lot-secondary[data-edit-output-lot-index="${index}"]`)?.value || "",
          status: originalLot.status || originalLot.lotStatus || ""
        };
      })
    : productionEditDraft.outputLots;
  const consumedQuantity = capturedOutputLots
    .filter((lot) => lot.status !== "Cancelado")
    .reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);

  productionEditDraft = {
    ...productionEditDraft,
    productionDate: document.getElementById("productionEditDate")?.value || productionEditDraft.productionDate,
    locationName: document.getElementById("productionEditLocation")?.value || productionEditDraft.locationName,
    outputMaterialName: document.getElementById("productionEditOutputMaterial")?.value || productionEditDraft.outputMaterialName,
    productionModelName: document.getElementById("productionEditModel")?.value || productionEditDraft.productionModelName,
    machineName: document.getElementById("productionEditMachine")?.value || productionEditDraft.machineName,
    consumedLotCode: document.getElementById("productionEditConsumedLot")?.value || productionEditDraft.consumedLotCode,
    consumedQuantity,
    observation: document.getElementById("productionEditObservation")?.value || "",
    operatorCodes: Array.from(document.querySelectorAll(".production-edit-operator-checkbox:checked")).map((input) => input.value),
    outputLots: capturedOutputLots
  };

  const selectedLot = getProductionEditConsumedLots(productionEditDraft, getModelConsumedInput(getProductionEditModel()), null)
    .find((lot) => lot.lotCode === productionEditDraft.consumedLotCode);

  productionEditDraft.consumedLotId = selectedLot?.lotId || selectedLot?.id || productionEditDraft.consumedLotId;
}

function setupProductionEditModalEvents(record) {
  if (!isProductionEditMode) return;

  ["productionEditDate", "productionEditLocation", "productionEditOutputMaterial", "productionEditModel", "productionEditMachine", "productionEditConsumedLot"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", () => {
      captureProductionEditDraft();
      if (id === "productionEditOutputMaterial") {
        productionEditDraft.productionModelName = "";
      }
      openProductionRecordModal(record.id, true);
    });
  });

  document.querySelectorAll(".production-edit-output-lot-quantity").forEach((input) => {
    input.addEventListener("input", () => {
      captureProductionEditDraft();
      const consumedInput = document.getElementById("productionEditConsumedQuantity");
      if (consumedInput) consumedInput.value = productionEditDraft.consumedQuantity || 0;
    });
  });

  document.querySelectorAll(".production-edit-output-lot-code, .production-edit-output-lot-secondary").forEach((input) => {
    input.addEventListener("input", captureProductionEditDraft);
  });
}

function isIndustrialLossLot(lot) {
  return Boolean(lot?.isIndustrialLoss) ||
    lot?.eventType === "INDUSTRIAL_LOSS" ||
    lot?.type === "INDUSTRIAL_LOSS" ||
    lot?.status === "INDUSTRIAL_LOSS";
}

function getProductionEditModel() {
  const material = lineStore.materials.find((item) => item.name === productionEditDraft?.outputMaterialName);
  return (material?.productionModels || []).find((item) => item.name === productionEditDraft?.productionModelName);
}

function renderGenericOptions(values, selectedValue) {
  if (!values.length) return `<option value="">Nenhum item disponível</option>`;

  return `
    <option value="">Selecione</option>
    ${values.map((value) => `
      <option value="${value}" ${value === selectedValue ? "selected" : ""}>${value}</option>
    `).join("")}
  `;
}

function renderConsumedLotOptions(lots, selectedValue) {
  if (!lots.length) return `<option value="">Nenhum lote disponível</option>`;

  return `
    <option value="">Selecione</option>
    ${lots.map((lot) => `
      <option value="${lot.lotCode}" ${lot.lotCode === selectedValue ? "selected" : ""}>
        ${lot.lotCode} - ${formatNumber(lot.quantity)}
      </option>
    `).join("")}
  `;
}

function getProductionEditConsumedLots(draft, consumedInput, record) {
  const lots = [];
  const seen = new Set();
  const materialCode = consumedInput?.inputCode || "";
  const snapshotLots = apiStockSnapshot?.lots || buildStockSnapshot(lineStore).lots || [];

  snapshotLots.forEach((lot) => {
    if (
      (!materialCode || lot.balanceMaterialCode === materialCode) &&
      (!draft.locationName || lot.locationName === draft.locationName) &&
      Number(lot.availableQuantity ?? lot.quantity ?? 0) > 0
    ) {
      lots.push({
        id: lot.id,
        lotId: lot.lotId || lot.id,
        lotCode: lot.lotCode,
        quantity: Number(lot.availableQuantity ?? lot.quantity ?? 0)
      });
      seen.add(lot.lotCode);
    }
  });

  const originalConsumed = (record ? getConsumedItemsByRecord(record.id)[0] : null)?.consumedLots?.[0];
  if (originalConsumed?.lotCode && !seen.has(originalConsumed.lotCode)) {
    lots.unshift({
      id: originalConsumed.sourceLotId || originalConsumed.lotId,
      lotId: originalConsumed.sourceLotId || originalConsumed.lotId,
      lotCode: originalConsumed.lotCode,
      quantity: Number(originalConsumed.quantity || 0)
    });
  }

  return lots;
}

function renderProductionEditFields(record) {
  const draft = productionEditDraft || createProductionEditDraft(record);
  const material = lineStore.materials.find((item) => item.name === draft.outputMaterialName);
  const model = (material?.productionModels || []).find((item) => item.name === draft.productionModelName);
  const consumedInput = getModelConsumedInput(model);
  const consumedLots = getProductionEditConsumedLots(draft, consumedInput, record);
  const operators = getActiveItems(lineStore.operators || []);
  const activeOutputLots = draft.outputLots.filter((lot) => lot.status !== "Cancelado");
  const consumedQuantity = activeOutputLots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);

  return `
    <div class="movement-detail-section production-edit-section">
      <h3>Editar produção</h3>

      <div class="form-grid">
        <label>
          Data
          <input id="productionEditDate" type="date" value="${draft.productionDate || getToday()}" />
        </label>

        <label>
          Local
          <select id="productionEditLocation">
            ${renderGenericOptions(getActiveItems(lineStore.locations || []).map((item) => item.name), draft.locationName)}
          </select>
        </label>

        <label>
          Material produzido
          <select id="productionEditOutputMaterial">
            ${renderGenericOptions(getActiveItems(lineStore.materials || []).filter((item) => item.canBeProduced).map((item) => item.name), draft.outputMaterialName)}
          </select>
        </label>

        <label>
          Modelo
          <select id="productionEditModel">
            ${renderGenericOptions((material?.productionModels || []).map((item) => item.name), draft.productionModelName)}
          </select>
        </label>

        <label>
          Máquina
          <select id="productionEditMachine">
            ${renderGenericOptions(getActiveItems(lineStore.machines || []).map((item) => item.name), draft.machineName)}
          </select>
        </label>

        <label>
          Lote consumido
          <select id="productionEditConsumedLot">
            ${renderConsumedLotOptions(consumedLots, draft.consumedLotCode)}
          </select>
        </label>

        <label>
          Quantidade consumida
          <input id="productionEditConsumedQuantity" type="number" min="0" step="0.001" value="${consumedQuantity || 0}" readonly />
        </label>
      </div>

      <label class="full-field production-edit-observation-label">
        Observação
        <textarea id="productionEditObservation" class="production-observation-field">${draft.observation || ""}</textarea>
      </label>

      <div class="movement-detail-section">
        <h3>Lotes produzidos</h3>
        <div class="production-edit-output-lots">
          ${draft.outputLots.map((lot, index) => `
            <div class="production-lot-card production-edit-output-card ${lot.status === "Cancelado" ? "is-canceled" : ""}" data-edit-output-lot-index="${index}">
              <div class="production-lot-card-header">
                <div>
                  <h4>Lote produzido ${index + 1}</h4>
                  <p>${lot.lotCode || "-"}</p>
                </div>
                <div class="production-output-lot-actions">
                  <span class="badge ${lot.status === "Cancelado" ? "badge-danger" : "badge-success"}">${lot.status === "Cancelado" ? "Cancelado" : "Ativo"}</span>
                  ${
                    lot.status === "Cancelado"
                      ? `<button class="success-btn production-output-lot-status-btn" data-output-lot-action="reprocess" data-output-lot-id="${lot.lotId || lot.id}" type="button">Reprocessar lote</button>`
                      : `<button class="danger-btn production-output-lot-status-btn" data-output-lot-action="cancel" data-output-lot-id="${lot.lotId || lot.id}" type="button" ${activeOutputLots.length <= 1 ? "disabled title=\"Use Cancelar produção para cancelar o último lote ativo.\"" : ""}>Cancelar lote</button>`
                  }
                </div>
              </div>

              <div class="production-edit-output-grid">
                <label>
                  Código do lote
                  <input class="production-edit-output-lot-code" data-edit-output-lot-index="${index}" type="text" value="${lot.lotCode || ""}" ${lot.status === "Cancelado" ? "disabled" : ""} />
                </label>

                <label>
                  Quantidade principal
                  <input class="production-edit-output-lot-quantity" data-edit-output-lot-index="${index}" type="number" min="0" step="0.001" value="${lot.quantity || ""}" ${lot.status === "Cancelado" ? "disabled" : ""} />
                </label>

                <label>
                  Quantidade secundária
                  <input class="production-edit-output-lot-secondary" data-edit-output-lot-index="${index}" type="number" min="0" step="0.001" value="${lot.secondaryQuantity || ""}" ${lot.status === "Cancelado" ? "disabled" : ""} />
                </label>
              </div>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="production-edit-operators-section">
        <h3>Operadores</h3>
        <div class="checkbox-grid production-operator-grid">
          ${operators.map((operator) => `
            <label>
              <input
                class="production-edit-operator-checkbox"
                type="checkbox"
                value="${operator.code}"
                ${draft.operatorCodes.includes(operator.code) ? "checked" : ""}
              />
              ${operator.name}
            </label>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderConsumedLotsReadOnly(items) {
  const productiveItems = items.map((item) => ({
    ...item,
    consumedLots: (item.consumedLots || []).filter((lot) => !isIndustrialLossLot(lot))
  })).filter((item) => item.consumedLots.length);

  if (!productiveItems.length) {
    return `<div class="production-preview-empty compact-production-empty">Nenhum lote consumido registrado.</div>`;
  }

  return `
    <div class="movement-detail-section">
      <h3>Lote consumido</h3>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Código</th>
              <th>Lote</th>
              <th>Quantidade</th>
            </tr>
          </thead>
          <tbody>
            ${productiveItems.flatMap((item) => {
              return (item.consumedLots || []).map((lot) => `
                <tr>
                  <td>${item.inputMaterial}</td>
                  <td><strong>${item.inputCode || "-"}</strong></td>
                  <td>${lot.lotCode || "-"}</td>
                  <td>${formatNumber(lot.quantity)} ${item.inputUnit || ""}</td>
                </tr>
              `);
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderIndustrialLossesReadOnly(items) {
  const lossItems = items.map((item) => ({
    ...item,
    consumedLots: (item.consumedLots || []).filter(isIndustrialLossLot)
  })).filter((item) => item.consumedLots.length);

  if (!lossItems.length) return "";

  return `
    <div class="movement-detail-section production-industrial-loss-section">
      <h3>Perdas industriais</h3>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>CÓDIGO</th>
              <th>Lote</th>
              <th>Quantidade</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            ${lossItems.flatMap((item) => {
              return (item.consumedLots || []).map((lot) => `
                <tr>
                  <td>${item.inputMaterial}</td>
                  <td><strong>${item.inputCode || "-"}</strong></td>
                  <td>${lot.lotCode || "-"}</td>
                  <td>${formatNumber(lot.quantity)} ${item.inputUnit || ""}</td>
                  <td><span class="badge production-industrial-loss-badge">Perda industrial</span></td>
                </tr>
              `);
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderGeneratedLotsReadOnly(lots, record, extraClass = "") {
  const displayLots = lots.length
    ? lots
    : [{
        lotCode: record.generatedLotCode,
        quantity: record.outputQuantity,
        secondaryQuantity: record.outputSecondaryQuantity,
        unit: record.outputUnit,
        secondaryUnit: record.outputSecondaryUnit
      }];

  return `
    <div class="movement-detail-section ${extraClass}">
      <h3>Lotes produzidos</h3>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Lote</th>
              <th>Quantidade principal</th>
              <th>Quantidade secundária</th>
            </tr>
          </thead>
          <tbody>
            ${displayLots.map((lot) => `
              <tr>
                <td>
                  <strong class="${isProductionLotCanceled(lot) ? "production-canceled-value" : ""}">${lot.lotCode || "-"}</strong>
                  ${isProductionLotCanceled(lot) ? `<span class="badge badge-danger production-lot-status-badge">Cancelado</span>` : ""}
                </td>
                <td><span class="${isProductionLotCanceled(lot) ? "production-canceled-value" : ""}">${formatNumber(lot.quantity)} ${lot.unit || record.outputUnit || ""}</span></td>
                <td><span class="${isProductionLotCanceled(lot) ? "production-canceled-value" : ""}">${lot.secondaryUnit || record.outputSecondaryUnit ? `${formatNumber(lot.secondaryQuantity)} ${lot.secondaryUnit || record.outputSecondaryUnit}` : "-"}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getConsumedItemsByRecord(recordId) {
  return (lineStore.productionRecordItems || []).filter((item) => {
    return item.productionRecordId === recordId;
  });
}

async function loadProductionPageFromApi(force = false) {
  if (hasLoadedProductionApi && !force) return;

  hasLoadedProductionApi = true;
  await Promise.all([
    loadProductionReferencesFromApi(),
    reloadProductionFromApi()
  ]);
}

async function loadProductionReferencesFromApi() {
  try {
    const [materials, locations, machines, operators, stock, stockLossParameters] = await Promise.all([
      apiGet("/api/materials"),
      apiGet("/api/locations"),
      apiGet("/api/machines"),
      apiGet("/api/operators"),
      apiGet("/api/stock"),
      apiGet("/api/stock-loss-parameters")
    ]);

    lineStore.materials.splice(0, lineStore.materials.length, ...materials.map(normalizeApiMaterial).filter(isActiveItem));
    lineStore.locations.splice(0, lineStore.locations.length, ...locations.map(normalizeApiLocation).filter(isActiveItem));
    lineStore.machines.splice(0, lineStore.machines.length, ...machines.map(normalizeApiMachine).filter(isActiveItem));
    lineStore.operators.splice(0, lineStore.operators.length, ...operators.map(normalizeApiOperator).filter(isActiveItem));
    saveStockLossParameters(stockLossParameters);
    apiStockSnapshot = normalizeApiStockSnapshot(stock);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      productionNotice = {
        type: "danger",
        title: "Dados nao carregados",
        message: error.message
      };
      showProductionNotice();
      return;
    }

    console.log("API indisponivel, usando dados locais de produção");
  }
}

async function reloadProductionFromApi() {
  try {
    const [productions, stock] = await Promise.all([
      apiGet("/api/productions"),
      apiGet("/api/stock")
    ]);

    const normalized = productions.map(normalizeApiProduction);
    lineStore.productionRecords.splice(0, lineStore.productionRecords.length, ...normalized);
    lineStore.productionGeneratedLots.splice(0, lineStore.productionGeneratedLots.length);
    lineStore.productionRecordItems.splice(0, lineStore.productionRecordItems.length);

    normalized.forEach((production) => {
      (production.producedLots || []).forEach((lot) => lineStore.productionGeneratedLots.unshift(lot));
      (production.consumedItems || []).forEach((item) => lineStore.productionRecordItems.unshift(item));
    });

    apiStockSnapshot = normalizeApiStockSnapshot(stock);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      productionNotice = {
        type: "danger",
        title: "Histórico nao carregado",
        message: error.message
      };
      showProductionNotice();
      return;
    }

    console.log("API indisponivel, usando histórico local de produção");
  }
}

async function createProductionFromApi(payload) {
  const { record, producedLots: lots, consumedItems, selectedLossIds = [] } = payload;
  const material = getSelectedOutputMaterial();
  const model = getSelectedProductionModel();
  const machine = getSelectedProductionMachine();

  try {
    const saved = await apiPost("/api/productions", {
      productionDate: record.productionDate,
      materialId: material?.id || null,
      outputMaterialName: record.outputMaterialName,
      outputUnit: material?.unit || record.outputUnit || "",
      outputSecondaryUnit: material?.secondaryUnit || record.outputSecondaryUnit || "",
      productionModelId: model?.id || null,
      productionModelName: record.productionModelName,
      machineId: machine?.id || null,
      machineName: record.machineName,
      locationName: record.locationName,
      operatorCodes: record.responsibleCodes || [],
      consumedLots: consumedItems.flatMap((item) => {
        return buildConsumedLotsWithLosses(item, selectedLossIds).map((lot) => ({
          lotId: lot.lotId || lot.sourceLotId,
          lotCode: lot.lotCode,
          materialCode: item.consumedInput.inputCode,
          materialName: item.consumedInput.inputMaterial,
          quantity: lot.quantity,
          secondaryQuantity: lot.secondaryQuantity,
          eventType: lot.eventType,
          isIndustrialLoss: Boolean(lot.isIndustrialLoss),
          notes: lot.notes
        }));
      }),
      outputLots: lots.map((lot) => ({
        lotCode: lot.lotCode,
        quantity: lot.outputQuantity,
        secondaryQuantity: lot.outputSecondaryQuantity
      })),
      observation: record.observation,
      notes: record.observation || ""
    });

    return normalizeApiProduction(saved);
  } catch (error) {
    if (shouldUseLocalFallback(error)) {
      console.log("API indisponivel, registrando produção localmente");
      return null;
    }

    productionNotice = {
      type: "danger",
      title: "Produção nao registrada",
      message: error.message
    };
    closeProductionConfirmModal();
    rerenderProdução();
    return false;
  }
}

function normalizeApiProduction(production) {
  return {
    id: production.id,
    productionDate: production.productionDate,
    dateTime: production.dateTime || `${production.productionDate}T00:00:00`,
    locationId: production.locationId || "",
    locationName: production.locationName || "",
    outputMaterialId: production.outputMaterialId || "",
    outputMaterialName: production.outputMaterialName || "",
    outputMaterialCode: production.outputMaterialCode || "",
    outputMaterialType: production.outputMaterialType || "",
    outputUnit: production.outputUnit || "un",
    outputSecondaryUnit: production.outputSecondaryUnit || "",
    productionModelId: production.productionModelId || "",
    productionModelName: production.productionModelName || "",
    machineId: production.machineId || "",
    machineName: production.machineName || "",
    responsibleName: production.responsibleName || "",
    responsibleCodes: Array.isArray(production.responsibleCodes) ? production.responsibleCodes : [],
    outputQuantity: Number(production.outputQuantity || 0),
    outputSecondaryQuantity: Number(production.outputSecondaryQuantity || 0),
    generatedLotCode: production.generatedLotCode || "",
    observation: production.observation || production.notes || "",
    status: production.status || "Processado",
    createdAt: production.createdAt,
    updatedAt: production.updatedAt,
    consumedItems: Array.isArray(production.consumedItems) ? production.consumedItems : [],
    producedLots: Array.isArray(production.producedLots) ? production.producedLots.map((lot) => ({
      ...lot,
      productionRecordId: production.id,
      quantity: Number(lot.quantity || 0),
      secondaryQuantity: Number(lot.secondaryQuantity || 0)
    })) : []
  };
}

function normalizeApiMaterial(material) {
  return {
    ...material,
    unit: material.unit || material.primaryUnit || "un",
    secondaryUnit: material.secondaryUnit || "",
    lotCode: material.lotCode || "",
    canBeProduced: Boolean(material.canBeProduced || material.producible),
    productionMachines: Array.isArray(material.productionMachines) ? material.productionMachines : [],
    productionModels: Array.isArray(material.productionModels) ? material.productionModels.map((model) => ({
      ...model,
      inputs: Array.isArray(model.inputs) ? model.inputs : []
    })) : [],
    status: material.status || "Ativo"
  };
}

function normalizeApiLocation(location) {
  return {
    id: location.id,
    name: location.name || "",
    code: location.code || "",
    production: Boolean(location.production),
    storage: Boolean(location.storage),
    status: location.status || "Ativo"
  };
}

function normalizeApiMachine(machine) {
  return {
    id: machine.id,
    name: machine.name || "",
    code: machine.code || "",
    lotCode: machine.lotCode || machine.lot_code || "",
    status: machine.status || "Ativo"
  };
}

function normalizeApiOperator(operator) {
  return {
    id: operator.id,
    name: operator.name || "",
    code: operator.code || "",
    status: operator.status || "Ativo"
  };
}

function normalizeApiStockSnapshot(snapshot) {
  return {
    groups: Array.isArray(snapshot?.groups) ? snapshot.groups : [],
    lots: Array.isArray(snapshot?.lots) ? snapshot.lots.map((lot) => ({
      id: lot.lotId || lot.id,
      lotId: lot.lotId || lot.id,
      balanceMaterialCode: lot.balanceMaterialCode || lot.materialCode || "",
      materialName: lot.materialName || "",
      locationName: lot.locationName || "",
      lotCode: lot.lotCode || "",
      quantity: Number(lot.quantity || 0),
      secondaryQuantity: Number(lot.secondaryQuantity || 0),
      availableQuantity: Number(lot.availableQuantity ?? lot.quantity ?? 0),
      productionDate: lot.productionDate || lot.createdAt || ""
    })) : []
  };
}

function shouldUseLocalFallback(error) {
  return !error.status;
}

function isActiveItem(item) {
  return item.status !== "Inativo";
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateOnly(value) {
  if (!value) return "-";

  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  })}%`;
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })}`;
}

function rerenderProdução() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${produçãoPage.title}</h1>
      <p>${produçãoPage.subtitle}</p>
    </div>

    ${produçãoPage.render()}
  `;

  setupProduçãoEvents();
}
