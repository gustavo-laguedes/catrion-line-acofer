import { lineStore, getActiveItems } from "../../shared/data-store.js";
import { buildStockSnapshot } from "../../shared/stock-engine.js";

let activeProductionTab = "NEW";
let productionDraft = createProductionDraft();
let producedLots = [createProducedLotDraft(1)];
let productionNotice = null;
let selectedProductionRecordId = null;
let pendingProductionPayload = null;
let isProductionActionMode = false;
let productionStatusAction = null;
let productionHistoryFilters = {
  search: "",
  date: "",
  status: "Todos"
};
let productionHistorySort = {
  field: "productionDate",
  direction: "desc"
};

export const producaoPage = {
  title: "⚙️ Produção",
  subtitle: "Apontamentos, transformação de lotes e geração de novos lotes",
  render: renderProducao,
  afterRender: setupProducaoEvents
};

function createProductionDraft() {
  return {
    date: getToday(),
    locationName: "",
    outputMaterialName: "",
    productionModelName: "",
    machineName: "",
    operatorCodes: [],
    consumedLotCode: "",
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

function renderProducao() {
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
  const consumedInput = getModelConsumedInput(model);
  const selectedConsumedLot = getSelectedConsumedLot();

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
      ${renderTransformationSummary(material, model, consumedInput, selectedConsumedLot)}
      ${renderConsumedLotBox(consumedInput)}
      ${renderProducedLotsBox(material, consumedInput, selectedConsumedLot)}

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

function renderTransformationSummary(material, model, consumedInput, selectedConsumedLot) {
  return "";

  if (!material || !model || !consumedInput) {
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
            <strong>${consumedInput.inputMaterial}</strong>
            ${selectedConsumedLot ? ` lote <strong>${selectedConsumedLot.lotCode}</strong>` : ""}
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

function renderConsumedLotBox(consumedInput) {
  if (!productionDraft.locationName) {
    return `
      <div class="production-preview-empty">
        Selecione um local de produção para carregar os lotes disponíveis.
      </div>
    `;
  }

  if (!consumedInput) {
    return "";
  }

  const lots = getAvailableConsumedLots(consumedInput);

  return `
    <div class="production-consumption-box">
      <div class="production-model-preview-header">
        <div>
          <h3>Lote consumido</h3>
          <p>${consumedInput.inputMaterial} sai de ${productionDraft.locationName}.</p>
        </div>

        <span class="badge badge-info">
          ${lots.length} lotes disponíveis
        </span>
      </div>

      ${
        lots.length
          ? `
            <div class="production-lot-table">
              <div class="production-lot-table-head">
                <span>Lote</span>
                <span>Disponível</span>
                <span>Selecionar</span>
              </div>

              ${lots.map((lot) => `
                <label class="production-lot-row ${productionDraft.consumedLotCode === lot.lotCode ? "selected" : ""}">
                  <div>
                    <strong>${lot.lotCode}</strong>
                    <small>${lot.locationName}</small>
                  </div>

                  <div>
                    ${formatNumber(lot.quantity)} ${consumedInput.inputUnit}
                  </div>

                  <div>
                    <input
                      class="production-consumed-lot-radio"
                      type="radio"
                      name="productionConsumedLot"
                      value="${lot.lotCode}"
                      ${productionDraft.consumedLotCode === lot.lotCode ? "checked" : ""}
                    />
                  </div>
                </label>
              `).join("")}
            </div>
          `
          : `
            <div class="production-preview-empty">
              Nenhum lote disponível para este material no local de produção.
            </div>
          `
      }
    </div>
  `;
}

function renderProducedLotsBox(material, consumedInput, selectedConsumedLot) {
  if (!material || !consumedInput || !selectedConsumedLot) {
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

      ${renderProductionLimitBox(material, consumedInput, selectedConsumedLot)}
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

function renderProductionLimitBox(material, consumedInput, selectedConsumedLot) {
  const summary = getProductionLimitSummary(material, consumedInput, selectedConsumedLot);

  return `
    <div class="production-lot-validation ${summary.isOverLimit ? "invalid" : "valid"}" id="productionLimitSummary">
      <span>
        Lote consumido:
        <strong>${formatNumber(summary.consumedQuantity)} ${consumedInput.inputUnit}</strong>
      </span>

      <span>
        Comparado por:
        <strong>${summary.samePrimaryUnit ? "quantidade principal" : "quantidade secundária produzida"}</strong>
      </span>

      <span>
        Produzido:
        <strong>${formatNumber(summary.comparedProduced)} ${summary.comparedUnit || "-"}</strong>
      </span>
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
                <td>${formatDateOnly(record.productionDate)}</td>
                <td><strong>${record.outputMaterialName}</strong></td>
                <td>${formatNumber(record.outputQuantity)} ${record.outputUnit}</td>
                <td>${lots.length ? lots.map((lot) => lot.lotCode).join(" / ") : record.generatedLotCode || "-"}</td>
                <td>${record.locationName || "-"}</td>
                <td>${record.machineName || "-"}</td>
                <td><span class="badge ${getProductionStatusBadgeClass(record.status)}">${record.status}</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
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

function setupProducaoEvents() {
  compactProductionLayout();
  setupProductionHistoryEvents();

  document.querySelectorAll("[data-production-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeProductionTab = button.dataset.productionTab;
      rerenderProducao();
    });
  });

  document.getElementById("productionDate")?.addEventListener("change", () => {
    captureProductionDraft();
    syncProducedLotCodes(true);
    rerenderProducao();
  });

  document.getElementById("productionLocation")?.addEventListener("change", () => {
    captureProductionDraft();
    productionDraft.consumedLotCode = "";
    rerenderProducao();
  });

  document.getElementById("productionOutputMaterial")?.addEventListener("change", () => {
    captureProductionDraft();
    productionDraft.productionModelName = "";
    productionDraft.machineName = "";
    productionDraft.consumedLotCode = "";
    producedLots = [createProducedLotDraft(1)];
    applyProductionDefaults();
    syncProducedLotCodes(true);
    rerenderProducao();
  });

  document.getElementById("productionModel")?.addEventListener("change", () => {
    captureProductionDraft();
    productionDraft.locationName = "";
    productionDraft.consumedLotCode = "";
    applyProductionDefaults();
    syncProducedLotCodes(true);
    rerenderProducao();
  });

  document.getElementById("productionMachine")?.addEventListener("change", () => {
    captureProductionDraft();
    syncProducedLotCodes(true);
    rerenderProducao();
  });

  document.getElementById("productionObservation")?.addEventListener("input", () => {
    captureProductionDraft();
  });

  document.querySelectorAll(".production-operator-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      captureProductionDraft();
    });
  });

  document.querySelectorAll(".production-consumed-lot-radio").forEach((input) => {
    input.addEventListener("change", () => {
      productionDraft.consumedLotCode = input.value;
      rerenderProducao();
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
    rerenderProducao();
  });

  document.getElementById("registerProductionBtn")?.addEventListener("click", registerProduction);
}

function registerProduction() {
  captureProductionDraft();
  captureProducedLots();

  const material = getSelectedOutputMaterial();
  const model = getSelectedProductionModel();
  const consumedInput = getModelConsumedInput(model);
  const consumedLot = getSelectedConsumedLot();
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

  if (!consumedInput || !consumedLot) {
    showProductionError("Selecione o lote consumido.");
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

  const validation = validateProducedLimit(material, consumedInput, consumedLot, validProducedLots);

  if (!validation.valid) {
    showProductionError(validation.message);
    return;
  }

  const totalOutputQuantity = validProducedLots.reduce((sum, lot) => sum + lot.outputQuantity, 0);
  const totalOutputSecondaryQuantity = validProducedLots.reduce((sum, lot) => sum + lot.outputSecondaryQuantity, 0);
  const consumedQuantity = validation.consumedQuantity;

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
    consumedInput,
    consumedLot,
    consumedQuantity
  };

  openProductionConfirmModal(pendingProductionPayload);
  return;

  lineStore.productionRecords.unshift(record);

  validProducedLots.forEach((lot) => {
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

  lineStore.productionRecordItems.unshift({
    id: crypto.randomUUID(),
    productionRecordId: record.id,
    inputMaterial: consumedInput.inputMaterial,
    inputCode: consumedInput.inputCode,
    inputUnit: consumedInput.inputUnit,
    consumptionMode: consumedInput.consumptionMode,
    requiredQuantity: consumedQuantity,
    consumedLots: [
      {
        sourceLotId: consumedLot.id,
        lotCode: consumedLot.lotCode,
        locationName: consumedLot.locationName,
        quantity: consumedQuantity
      }
    ],
    sourceLocation: productionDraft.locationName,
    notes: consumedInput.notes || ""
  });

  productionDraft = createProductionDraft();
  producedLots = [createProducedLotDraft(1)];
  productionNotice = null;
  activeProductionTab = "HISTORY";

  rerenderProducao();
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
    rerenderProducao();
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
  return (model?.inputs || [])[0] || null;
}

function getAvailableConsumedLots(consumedInput) {
  if (!consumedInput || !productionDraft.locationName) return [];

  const snapshot = buildStockSnapshot(lineStore);

  return snapshot.lots
    .filter((lot) => {
      return (
        lot.balanceMaterialCode === consumedInput.inputCode &&
        lot.locationName === productionDraft.locationName &&
        Number(lot.quantity || 0) > 0
      );
    })
    .map((lot) => ({
      id: lot.id,
      lotCode: lot.lotCode,
      locationName: lot.locationName,
      quantity: Number(lot.quantity || 0)
    }));
}

function getSelectedConsumedLot() {
  const consumedInput = getModelConsumedInput(getSelectedProductionModel());

  if (!consumedInput || !productionDraft.consumedLotCode) return null;

  return getAvailableConsumedLots(consumedInput).find((lot) => {
    return lot.lotCode === productionDraft.consumedLotCode;
  });
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
  const prefix = getProductionLotPrefix();

  if (!prefix) return;

  const existingLots = getExistingProductionLotCodes();
  const materialLotCode = prefix.slice(6, 9);
  const machineLotCode = prefix.slice(9, 14);

  producedLots.forEach((lot) => {
    if (force || !lot.lotCode || !String(lot.lotCode).startsWith(prefix)) {
      lot.lotCode = generateProductionLotCode({
        productionDate: productionDraft.date,
        materialLotCode,
        machineLotCode,
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

function validateProducedLimit(material, consumedInput, consumedLot, lots) {
  const consumedQuantity = getConsumedQuantityForProducedLots(material, consumedInput, lots);

  if (consumedQuantity <= 0) {
    return {
      valid: false,
      message: "Informe as quantidades produzidas para validar o consumo."
    };
  }

  if (material.unit !== consumedInput.inputUnit && !material.secondaryUnit) {
    return {
      valid: false,
      message: "A unidade principal produzida é diferente da consumida e o material produzido não possui unidade secundária para comparação."
    };
  }

  if (consumedQuantity > Number(consumedLot.quantity || 0)) {
    return {
      valid: false,
      message: "A produção informada ultrapassa a quantidade disponível no lote consumido."
    };
  }

  return {
    valid: true,
    consumedQuantity
  };
}

function getProductionLimitSummary(material, consumedInput, consumedLot) {
  const totalPrincipal = getProducedTotalPrincipal();
  const totalSecondary = getProducedTotalSecondary();
  const samePrimaryUnit = material.unit === consumedInput.inputUnit;
  const comparedProduced = samePrimaryUnit ? totalPrincipal : totalSecondary;
  const comparedUnit = samePrimaryUnit ? material.unit : material.secondaryUnit;
  const consumedQuantity = Number(consumedLot.quantity || 0);

  return {
    totalPrincipal,
    totalSecondary,
    samePrimaryUnit,
    comparedProduced,
    comparedUnit,
    consumedQuantity,
    isOverLimit: comparedProduced > consumedQuantity
  };
}

function getConsumedQuantityForProducedLots(material, consumedInput, lots) {
  if (material.unit === consumedInput.inputUnit) {
    return lots.reduce((sum, lot) => sum + lot.outputQuantity, 0);
  }

  return lots.reduce((sum, lot) => sum + lot.outputSecondaryQuantity, 0);
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
  const prefix = getProductionLotPrefix();

  if (!prefix) return "Gerado automaticamente";

  return `${prefix}${String(sequence).padStart(2, "0")}`;
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
  rerenderProducao();
}

function renderProductionConfirmModal(payload) {
  const { record, producedLots: lots, consumedInput, consumedLot } = payload;

  return `
    <div class="modal large-modal movement-detail-modal">
      <div class="modal-header">
        <div>
          <h2>Confirmar produção</h2>
          <p>Revise o apontamento antes de registrar definitivamente.</p>
        </div>
      </div>

      <div class="movement-detail-grid">
        <div><small>Data</small><strong>${formatDateOnly(record.productionDate)}</strong></div>
        <div><small>Local</small><strong>${record.locationName || "-"}</strong></div>
        <div><small>Material produzido</small><strong>${record.outputMaterialName || "-"}</strong></div>
        <div><small>Modelo</small><strong>${record.productionModelName || "-"}</strong></div>
        <div><small>Máquina</small><strong>${record.machineName || "-"}</strong></div>
        <div><small>Responsáveis</small><strong>${record.responsibleName || "-"}</strong></div>
        <div><small>Lote consumido</small><strong>${consumedLot.lotCode || "-"}</strong></div>
        <div><small>Consumo</small><strong>${formatNumber(payload.consumedQuantity)} ${consumedInput.inputUnit || ""}</strong></div>
      </div>

      ${renderGeneratedLotsReadOnly(lots.map((lot) => ({
        lotCode: lot.lotCode,
        quantity: lot.outputQuantity,
        secondaryQuantity: lot.outputSecondaryQuantity,
        unit: record.outputUnit,
        secondaryUnit: record.outputSecondaryUnit
      })), record)}

      ${
        record.observation
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

function confirmProductionRegistration() {
  if (!pendingProductionPayload) return;

  const { record, producedLots: lots, consumedInput, consumedLot, consumedQuantity } = pendingProductionPayload;

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

  lineStore.productionRecordItems.unshift({
    id: crypto.randomUUID(),
    productionRecordId: record.id,
    inputMaterial: consumedInput.inputMaterial,
    inputCode: consumedInput.inputCode,
    inputUnit: consumedInput.inputUnit,
    consumptionMode: consumedInput.consumptionMode,
    requiredQuantity: consumedQuantity,
    consumedLots: [
      {
        sourceLotId: consumedLot.id,
        lotCode: consumedLot.lotCode,
        locationName: consumedLot.locationName,
        quantity: consumedQuantity
      }
    ],
    sourceLocation: productionDraft.locationName,
    notes: consumedInput.notes || ""
  });

  pendingProductionPayload = null;
  closeProductionConfirmModal();

  productionDraft = createProductionDraft();
  producedLots = [createProducedLotDraft(1)];
  productionNotice = null;
  activeProductionTab = "HISTORY";

  rerenderProducao();
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
  const consumedInput = getModelConsumedInput(model);
  const consumedLot = getSelectedConsumedLot();

  if (!summary || !material || !consumedInput || !consumedLot) return;

  const next = document.createElement("div");
  next.innerHTML = renderProductionLimitBox(material, consumedInput, consumedLot).trim();
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
    rerenderProducao();
  });

  document.getElementById("productionHistoryStatus")?.addEventListener("change", (event) => {
    productionHistoryFilters.status = event.target.value;
    rerenderProducao();
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

function openProductionRecordModal(recordId, actionMode = false) {
  selectedProductionRecordId = recordId;
  isProductionActionMode = actionMode;
  document.querySelector(".production-detail-backdrop")?.remove();

  const record = (lineStore.productionRecords || []).find((item) => item.id === recordId);
  if (!record) return;

  const modal = document.createElement("div");
  modal.className = "modal-backdrop open movement-detail-backdrop production-detail-backdrop";
  modal.innerHTML = renderProductionRecordModal(record);
  document.getElementById("appContent").appendChild(modal);

  modal.querySelector("#closeProductionDetailBtn")?.addEventListener("click", closeProductionRecordModal);
  modal.querySelector("#closeProductionDetailFooterBtn")?.addEventListener("click", closeProductionRecordModal);
  modal.querySelector("#editProductionBtn")?.addEventListener("click", () => {
    openProductionRecordModal(record.id, true);
  });
  modal.querySelector("#cancelProductionBtn")?.addEventListener("click", () => openProductionStatusWarning(record.id, "Cancelado"));
  modal.querySelector("#reprocessProductionBtn")?.addEventListener("click", () => openProductionStatusWarning(record.id, "Reprocessado"));
}

function closeProductionRecordModal() {
  selectedProductionRecordId = null;
  isProductionActionMode = false;
  document.querySelector(".production-detail-backdrop")?.remove();
}

function updateProductionStatus(recordId, status) {
  const record = (lineStore.productionRecords || []).find((item) => item.id === recordId);
  if (!record) return;

  record.status = status;

  if (status === "Cancelado") {
    record.canceledAt = new Date().toISOString();
  } else {
    record.reprocessedAt = new Date().toISOString();
  }

  closeProductionRecordModal();
  rerenderProducao();
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
  confirmBtn?.addEventListener("click", () => {
    if (!productionStatusAction) return;

    const action = productionStatusAction;
    closeProductionStatusWarning();
    updateProductionStatus(action.recordId, action.status);
  });
}

function closeProductionStatusWarning() {
  productionStatusAction = null;
  document.querySelector(".production-status-warning-backdrop")?.remove();
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
        <div><small>Data</small><strong>${formatDateOnly(record.productionDate)}</strong></div>
        <div><small>Status</small><strong>${record.status}</strong></div>
        <div><small>Local</small><strong>${record.locationName || "-"}</strong></div>
        <div><small>Material produzido</small><strong>${record.outputMaterialName || "-"}</strong></div>
        <div><small>Modelo</small><strong>${record.productionModelName || "-"}</strong></div>
        <div><small>Máquina</small><strong>${record.machineName || "-"}</strong></div>
        <div><small>Responsáveis</small><strong>${record.responsibleName || "-"}</strong></div>
      </div>

      ${renderConsumedLotsReadOnly(consumedItems)}
      ${renderGeneratedLotsReadOnly(generatedLots, record)}

      ${
        record.observation
          ? `<div class="movement-detail-note"><strong>Observação:</strong> ${record.observation}</div>`
          : ""
      }

      <div class="modal-footer between">
        <button id="closeProductionDetailFooterBtn" class="secondary-btn" type="button">Fechar</button>

        <div class="modal-footer-actions">
          ${!isProductionActionMode ? `<button id="editProductionBtn" class="secondary-btn" type="button">Editar</button>` : ""}

          ${isProductionActionMode ? (
            record.status === "Cancelado"
              ? `<button id="reprocessProductionBtn" class="success-btn" type="button">Reprocessar</button>`
              : `<button id="cancelProductionBtn" class="danger-btn" type="button">Cancelar produção</button>`
          ) : ""}
        </div>
      </div>
    </div>
  `;
}

function renderConsumedLotsReadOnly(items) {
  if (!items.length) {
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
            ${items.flatMap((item) => {
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

function renderGeneratedLotsReadOnly(lots, record) {
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
    <div class="movement-detail-section">
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
                <td><strong>${lot.lotCode || "-"}</strong></td>
                <td>${formatNumber(lot.quantity)} ${lot.unit || record.outputUnit || ""}</td>
                <td>${lot.secondaryUnit || record.outputSecondaryUnit ? `${formatNumber(lot.secondaryQuantity)} ${lot.secondaryUnit || record.outputSecondaryUnit}` : "-"}</td>
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

function rerenderProducao() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${producaoPage.title}</h1>
      <p>${producaoPage.subtitle}</p>
    </div>

    ${producaoPage.render()}
  `;

  setupProducaoEvents();
}
