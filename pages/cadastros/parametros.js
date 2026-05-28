import { lineStore, getMaterialOptions, getStockLossParameters, saveStockLossParameters } from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";
import { parametrosExpedicaoPage } from "./parametros-expedicao.js";

const technicalParameters = lineStore.technicalParameters;
const technicalUnitOptions = ["kg/m", "kg", "g/m", "mm", "MPa", "%", "un"];
let hasTriedApiLoad = false;
let hasTriedMaterialLoad = false;
let hasTriedStockLossLoad = false;

/*
const unitOptions = [
  "un",
  "kg",
  "m",
  "m²",
  "m³",
  "%",
  "fator",
  "mm",
  "cm",
  "outro"
];
*/

let selectedParameterIndex = null;
let isEditingParameter = false;
let isDeleteWarningOpen = false;
let toleranceMode = "percentual";
let activeParameterTab = "quality";
let stockParametersNotice = null;

export const parametrosPage = {
  title: "Parâmetros",
  subtitle: "Cadastre regras, fatores, tolerâncias e configurações usadas nos cálculos e na operação",
  render: renderParametros,
  afterRender: setupParametrosEvents
};

function renderParametros() {
  ensureProductionLotPattern();
  ensureStockLossParameters();

  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>

      <div class="module-toolbar-actions">
        ${activeParameterTab === "quality" ? `<button class="primary-btn" id="openParameterModalBtn">Novo parâmetro</button>` : ""}
      </div>
    </div>

    ${renderParameterTabs()}

    ${activeParameterTab === "lot" ? renderProductionLotPatternCard() : ""}
    ${activeParameterTab === "stock" ? renderStockParametersCard() : ""}
    ${activeParameterTab === "expedition" ? parametrosExpedicaoPage.render({ embedded: true }) : ""}

    <div class="card ${activeParameterTab === "quality" ? "" : "hidden-parameter-section"}">
      <div class="table-header">
        <div>
          <h2>Parâmetros cadastrados</h2>
          <p>Esses parâmetros serão usados em cálculos, produção, relatórios e validações técnicas.</p>
        </div>
      </div>

      ${technicalParameters.length ? renderParametersTable() : renderEmptyParameters()}
    </div>

    ${renderParameterModal()}

    ${
      selectedParameterIndex !== null
        ? renderEditParameterModal(technicalParameters[selectedParameterIndex])
        : ""
    }

    ${
      isDeleteWarningOpen && selectedParameterIndex !== null
        ? renderDeleteWarningModal(technicalParameters[selectedParameterIndex])
        : ""
    }
  `;
}

function renderParameterTabs() {
  const tabs = [
    { key: "quality", label: "Parâmetros de qualidade" },
    { key: "lot", label: "Parâmetros de lote" },
    { key: "stock", label: "Parâmetros de estoque" },
    { key: "expedition", label: "Parâmetros de expedição" }
  ];

  return `
    <div class="parameter-tabs">
      ${tabs.map((tab) => `
        <button class="parameter-tab ${activeParameterTab === tab.key ? "active" : ""}" data-parameter-tab="${tab.key}" type="button">
          ${tab.label}
        </button>
      `).join("")}
    </div>
  `;
}

function ensureProductionLotPattern() {
  if (!lineStore.productionLotPattern) {
    lineStore.productionLotPattern = {};
  }

  lineStore.productionLotPattern = {
    format: lineStore.productionLotPattern.format || "DDMMAA + MATERIAL + MAQUINA + SEQUENCIAL",
    materialCodeLength: Number(lineStore.productionLotPattern.materialCodeLength || 3),
    machineCodeLength: Number(lineStore.productionLotPattern.machineCodeLength || 5),
    sequenceLength: Number(lineStore.productionLotPattern.sequenceLength || 2),
    resetRule: lineStore.productionLotPattern.resetRule || "data + material + máquina"
  };
}

function ensureStockLossParameters() {
  return getStockLossParameters();
}

function renderStockParametersCard() {
  const params = lineStore.stockLossParameters;
  const materials = (lineStore.materials || []).filter(isActiveItem);

  return `
    <div class="card stock-parameters-card">
      <div class="table-header">
        <div>
          <h2>Parâmetros de estoque</h2>
          <p>Configure o percentual que dispara alerta e opcionalmente registra perda industrial do saldo remanescente.</p>
        </div>
      </div>

      <div class="form-grid">
        <label>
          Percentual global de alerta/perda
          <input id="globalLossPercentInput" type="number" min="0" max="100" step="0.1" value="${params.globalLossPercent}" />
        </label>
      </div>

      <div class="data-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Material</th>
              <th>Percentual específico</th>
              <th>Aplicado</th>
            </tr>
          </thead>
          <tbody>
            ${materials.map((material) => {
              const key = material.code || material.name;
              const override = params.materialLossPercents[key] ?? "";
              const applied = override === "" ? params.globalLossPercent : override;
              return `
                <tr>
                  <td><strong>${material.code || "-"}</strong></td>
                  <td>${material.name || "-"}</td>
                  <td>
                    <input
                      class="material-loss-percent-input"
                      data-material-loss-key="${key}"
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value="${override}"
                      placeholder="Usar global"
                    />
                  </td>
                  <td>${applied}%</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>

      <div class="modal-footer">
        <button class="primary-btn" id="saveStockLossParametersBtn" type="button">Salvar modificacoes</button>
      </div>
    </div>
  `;
}

function renderProductionLotPatternCard() {
  const pattern = lineStore.productionLotPattern;

  return `
    <div class="card production-lot-pattern-card">
      <div class="table-header">
        <div>
          <h2>Padrão de lotes</h2>
          <p>Configuração atual para geração automática de lotes produzidos.</p>
        </div>
      </div>

      <div class="form-grid readonly-mode">
        <label>
          Formato
          <input type="text" value="${pattern.format}" disabled />
        </label>

        <label>
          Tamanho código material
          <input type="text" value="${pattern.materialCodeLength}" disabled />
        </label>

        <label>
          Tamanho código máquina
          <input type="text" value="${pattern.machineCodeLength}" disabled />
        </label>

        <label>
          Tamanho sequencial
          <input type="text" value="${pattern.sequenceLength}" disabled />
        </label>

        <label>
          Reinício do sequencial
          <input type="text" value="${pattern.resetRule}" disabled />
        </label>

        <label>
          Preview
          <input type="text" value="150526034EC12501" disabled />
        </label>
      </div>
    </div>
  `;
}

function renderParametersTable() {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Material</th>
            <th>Unidade</th>
            <th>Valor base</th>
            <th>Tol. mín.</th>
            <th>Tol. máx.</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${technicalParameters.map(renderParameterRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyParameters() {
  return `
    <div class="empty-state">
      <div class="empty-icon">📐</div>
      <h3>Nenhum parâmetro técnico cadastrado</h3>
      <p>Comece cadastrando fatores, tolerâncias, regras técnicas ou referências usadas nos cálculos do processo.</p>
      <button class="primary-btn" id="openParameterModalEmptyBtn">Cadastrar primeiro parâmetro</button>
    </div>
  `;
}

function renderParameterRow(parameter) {
  const statusClass = parameter.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-parameter-index="${technicalParameters.indexOf(parameter)}">
      <td><strong>${parameter.code}</strong></td>
      <td>${parameter.name}</td>
      <td>${parameter.material}</td>
      <td>${parameter.unit}</td>
      <td>${formatBaseValue(parameter.baseValue)}</td>
      <td>${formatTolerance(parameter, "min")}</td>
<td>${formatTolerance(parameter, "max")}</td>
      <td><span class="badge ${statusClass}">${parameter.status}</span></td>
    </tr>
  `;
}

function renderParameterModal() {
  return `
    <div class="modal-backdrop" id="parameterModal">
      <div class="modal large-modal">
        <div class="modal-header">
          <div>
            <h2>Novo parâmetro técnico</h2>
            <p>Cadastre uma regra técnica livre para uso em cálculos e validações.</p>
          </div>

          <button class="modal-close" id="closeParameterModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome do parâmetro
            <input id="parameterNameInput" type="text" placeholder="Ex: Fator nominal, Tolerância de peso, Perda esperada" />
          </label>

          <label>
            Código
            <input id="parameterCodeInput" type="text" placeholder="Ex: FAT-NOM, TOL-PESO" />
          </label>

          <label>
            Material relacionado
            <select id="parameterMaterialInput">
              ${renderSelectOptions(getMaterialOptions())}
            </select>
          </label>

          <label>
            Unidade
            <select id="parameterUnitInput">
              ${renderSelectOptions(technicalUnitOptions)}
            </select>
          </label>

          <label>
            Valor base
            <input id="parameterBaseValueInput" type="text" inputmode="decimal" placeholder="0,000" />
          </label>

          </div>

${renderToleranceModeSelector()}

${renderToleranceFields({}, "", "")}

<div class="form-grid">
        </div>

        <div class="form-grid single">
          <label>
            Observação técnica
            <input id="parameterNotesInput" type="text" placeholder="Observação opcional sobre aplicação, norma, referência ou regra" />
          </label>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelParameterModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveParameterBtn">Salvar parâmetro</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditParameterModal(parameter) {
  const disabled = isEditingParameter ? "" : "disabled";
  const readonlyClass = isEditingParameter ? "" : "readonly-mode";

  return `
    <div class="modal-backdrop open" id="editParameterModal">
      <div class="modal large-modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingParameter ? "Editar parâmetro técnico" : "Visualizar parâmetro técnico"}</h2>
            <p>${isEditingParameter ? "Altere os dados deste parâmetro." : "Confira os dados cadastrados para este parâmetro."}</p>
          </div>

          <button class="modal-close" id="closeEditParameterModalBtn">×</button>
        </div>

        <div class="form-grid ${readonlyClass}">
          <label>
            Nome do parâmetro
            <input id="editParameterNameInput" type="text" value="${parameter.name}" ${disabled} />
          </label>

          <label>
            Código
            <input id="editParameterCodeInput" type="text" value="${parameter.code}" ${disabled} />
          </label>

          <label>
            Material relacionado
            <select id="editParameterMaterialInput" ${disabled}>
              ${renderSelectOptions(getMaterialOptions(), parameter.material)}
            </select>
          </label>

          <label>
            Unidade
            <select id="editParameterUnitInput" ${disabled}>
              ${renderSelectOptions(technicalUnitOptions, parameter.unit)}
            </select>
          </label>

          <label>
            Valor base
            <input id="editParameterBaseValueInput" type="text" inputmode="decimal" value="${formatBaseInputValue(parameter.baseValue)}" ${disabled} />
          </label>

          </div>

${renderToleranceModeSelector(parameter.toleranceMode || "percentual", disabled)}

${renderToleranceFields(parameter, disabled, "edit")}

<div class="form-grid ${readonlyClass}">

          <label>
            Status
            <select id="editParameterStatusInput" ${disabled}>
              <option ${parameter.status === "Ativo" ? "selected" : ""}>Ativo</option>
              <option ${parameter.status === "Inativo" ? "selected" : ""}>Inativo</option>
            </select>
          </label>
        </div>

        <div class="form-grid single ${readonlyClass}">
          <label>
            Observação técnica
            <input id="editParameterNotesInput" type="text" value="${parameter.notes || ""}" ${disabled} />
          </label>
        </div>

        <div class="modal-footer between">
          ${
            isEditingParameter
              ? `<button class="danger-btn" id="openDeleteParameterWarningBtn">Excluir parâmetro</button>`
              : `<button class="secondary-btn" id="enableEditParameterBtn">Editar</button>`
          }

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditParameterBtn">
              ${isEditingParameter ? "Cancelar" : "Fechar"}
            </button>

            ${
              isEditingParameter
                ? `<button class="primary-btn" id="saveEditParameterBtn">Salvar alterações</button>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderToleranceModeSelector(selectedMode = toleranceMode, disabled = "") {
  return `
    <div class="tolerance-mode-box">
      <strong>Tipo de tolerância</strong>

      <div class="tolerance-mode-options">
        <label>
          <input
            type="radio"
            name="toleranceMode"
            value="percentual"
            ${selectedMode === "percentual" ? "checked" : ""}
            ${disabled}
          />
          Percentual
        </label>

        <label>
          <input
            type="radio"
            name="toleranceMode"
            value="numeral"
            ${selectedMode === "numeral" ? "checked" : ""}
            ${disabled}
          />
          Numeral
        </label>
      </div>
    </div>
  `;
}

function renderToleranceFields(parameter = {}, disabled = "", prefix = "") {
  const mode = parameter.toleranceMode || toleranceMode;
  const percentDisabled = mode === "numeral" || disabled ? "disabled" : "";
  const numberDisabled = mode === "percentual" || disabled ? "disabled" : "";

  const idPrefix = prefix === "edit" ? "editParameter" : "parameter";

  return `
    <div class="tolerance-grid">
      <div class="tolerance-group">
        <h4>Tolerância mínima</h4>

        <label>
          Percentual
          <input id="${idPrefix}MinTolerancePercentInput" type="text" inputmode="decimal" value="${parameter.minTolerancePercent || ""}" placeholder="Ex: -6,000" ${percentDisabled} />
        </label>

        <label>
          Numeral
          <input id="${idPrefix}MinToleranceNumberInput" type="text" inputmode="decimal" value="${formatToleranceNumberInputValue(parameter.minToleranceNumber)}" placeholder="Ex: 0,2090" ${numberDisabled} />
        </label>
      </div>

      <div class="tolerance-group">
        <h4>Tolerância máxima</h4>

        <label>
          Percentual
          <input id="${idPrefix}MaxTolerancePercentInput" type="text" inputmode="decimal" value="${parameter.maxTolerancePercent || ""}" placeholder="Ex: 6,000" ${percentDisabled} />
        </label>

        <label>
          Numeral
          <input id="${idPrefix}MaxToleranceNumberInput" type="text" inputmode="decimal" value="${formatToleranceNumberInputValue(parameter.maxToleranceNumber)}" placeholder="Ex: 0,2350" ${numberDisabled} />
        </label>
      </div>
    </div>
  `;
}

function formatTolerance(parameter, side) {
  const percent = parameter[`${side}TolerancePercent`];
  const number = parameter[`${side}ToleranceNumber`];

  if (parameter.toleranceMode === "percentual") {
    return percent ? `${percent}% / ${formatToleranceNumber(number)} ${parameter.unit}` : "-";
  }

  return number ? `${formatToleranceNumber(number)} ${parameter.unit} / ${percent || "-"}%` : "-";
}

function formatBaseValue(value) {
  const formatted = formatDecimalDisplay(value, 3);
  return formatted || "-";
}

function formatBaseInputValue(value) {
  return formatDecimalDisplay(value, 3);
}

function formatToleranceNumber(value) {
  return formatDecimalDisplay(value, 4) || "-";
}

function formatToleranceNumberInputValue(value) {
  return formatDecimalDisplay(value, 4);
}

function formatDecimalDisplay(value, digits) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(String(value).replace(",", "."));
  if (!Number.isFinite(number)) return String(value);
  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function parseDecimal(value) {
  if (!value) return null;
  return Number(String(value).replace(",", "."));
}

function formatDecimal(value, digits = 3) {
  if (value === null || Number.isNaN(value)) return "";
  return value.toFixed(digits).replace(".", ",");
}

function formatParameterDecimalInput(input) {
  const value = parseDecimal(input.value);
  if (value === null || !Number.isFinite(value)) return;

  if (input.id.includes("BaseValue")) {
    input.value = formatDecimal(value, 3);
    return;
  }

  if (input.id.includes("ToleranceNumber")) {
    input.value = formatDecimal(value, 4);
    return;
  }

  if (input.id.includes("TolerancePercent")) {
    input.value = formatDecimal(value, 3);
  }
}

function calculateToleranceFields(prefix = "") {
  const idPrefix = prefix === "edit" ? "editParameter" : "parameter";

  const baseInput = document.getElementById(`${idPrefix}BaseValueInput`);
  const base = parseDecimal(baseInput?.value);

  const minPercentInput = document.getElementById(`${idPrefix}MinTolerancePercentInput`);
  const minNumberInput = document.getElementById(`${idPrefix}MinToleranceNumberInput`);
  const maxPercentInput = document.getElementById(`${idPrefix}MaxTolerancePercentInput`);
  const maxNumberInput = document.getElementById(`${idPrefix}MaxToleranceNumberInput`);

  if (!base) return;

  if (toleranceMode === "percentual") {
    const minPercent = parseDecimal(minPercentInput?.value);
    const maxPercent = parseDecimal(maxPercentInput?.value);

    if (minPercent !== null) {
      const normalizedMinPercent = minPercent > 0 ? -minPercent : minPercent;
      minPercentInput.value = formatDecimal(normalizedMinPercent);
      minNumberInput.value = formatDecimal(base + (base * (normalizedMinPercent / 100)), 4);
    }

    if (maxPercent !== null) {
      const normalizedMaxPercent = Math.abs(maxPercent);
      maxPercentInput.value = formatDecimal(normalizedMaxPercent);
      maxNumberInput.value = formatDecimal(base + (base * (normalizedMaxPercent / 100)), 4);
    }
  }

  if (toleranceMode === "numeral") {
    const minNumber = parseDecimal(minNumberInput?.value);
    const maxNumber = parseDecimal(maxNumberInput?.value);

    if (minNumber !== null) {
      minPercentInput.value = formatDecimal(((minNumber - base) / base) * 100);
    }

    if (maxNumber !== null) {
      maxPercentInput.value = formatDecimal(((maxNumber - base) / base) * 100);
    }
  }
}
function renderDeleteWarningModal(parameter) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteParameterWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de parâmetro</h2>
            <p>
              Você está prestes a excluir o parâmetro <strong>${parameter.name}</strong>.
              Essa ação pode afetar cálculos, produção, relatórios e validações técnicas.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, se este parâmetro já tiver sido usado em produção ou cálculo, o recomendado será inativar ou versionar, não excluir definitivamente.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteParameterAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteParameterWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteParameterBtn" disabled>Confirmar exclusão</button>
        </div>
      </div>
    </div>
  `;
}

function renderSelectOptions(options, selectedValue = "") {
  return options.map(option => `
    <option ${option === selectedValue ? "selected" : ""}>
      ${option}
    </option>
  `).join("");
}

function setupParametrosEvents() {
  loadParameterMaterialsFromApi();
  loadTechnicalParametersFromApi();
  loadStockLossParametersFromApi();

  document.querySelectorAll("[data-parameter-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeParameterTab = button.dataset.parameterTab;
      rerenderParametros();
    });
  });

  document.getElementById("saveStockLossParametersBtn")?.addEventListener("click", saveStockLossParametersFromForm);
  if (activeParameterTab === "expedition") {
    parametrosExpedicaoPage.afterRender({ embedded: true });
  }

  const modal = document.getElementById("parameterModal");
  const openBtn = document.getElementById("openParameterModalBtn");
  const openEmptyBtn = document.getElementById("openParameterModalEmptyBtn");
  const closeBtn = document.getElementById("closeParameterModalBtn");
  const cancelBtn = document.getElementById("cancelParameterModalBtn");
  const saveBtn = document.getElementById("saveParameterBtn");
  const rows = document.querySelectorAll(".clickable-row");

  const toleranceModeInputs = document.querySelectorAll('input[name="toleranceMode"]');
const toleranceInputs = document.querySelectorAll(
  "#parameterBaseValueInput, #parameterMinTolerancePercentInput, #parameterMinToleranceNumberInput, #parameterMaxTolerancePercentInput, #parameterMaxToleranceNumberInput, #editParameterBaseValueInput, #editParameterMinTolerancePercentInput, #editParameterMinToleranceNumberInput, #editParameterMaxTolerancePercentInput, #editParameterMaxToleranceNumberInput"
);

  openBtn?.addEventListener("click", () => {
  toleranceMode = "percentual";
  modal.classList.add("open");
});

openEmptyBtn?.addEventListener("click", () => {
  toleranceMode = "percentual";
  modal.classList.add("open");
});
  closeBtn?.addEventListener("click", () => modal.classList.remove("open"));
  cancelBtn?.addEventListener("click", () => modal.classList.remove("open"));

  toleranceModeInputs.forEach((input) => {
  input.addEventListener("change", () => {
    toleranceMode = input.value;

    updateToleranceModeFields("");
    updateToleranceModeFields("edit");

    calculateToleranceFields("");
    calculateToleranceFields("edit");
  });
});

toleranceInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const prefix = input.id.startsWith("edit") ? "edit" : "";
    calculateToleranceFields(prefix);
  });
  input.addEventListener("blur", () => {
    formatParameterDecimalInput(input);
  });
});

  saveBtn?.addEventListener("click", async () => {
    const name = document.getElementById("parameterNameInput").value.trim();
    const code = document.getElementById("parameterCodeInput").value.trim().toUpperCase();
    const material = document.getElementById("parameterMaterialInput").value;
    const unit = document.getElementById("parameterUnitInput").value;
    const baseValue = document.getElementById("parameterBaseValueInput").value.trim();
    const minTolerancePercent = document.getElementById("parameterMinTolerancePercentInput").value.trim();
const minToleranceNumber = document.getElementById("parameterMinToleranceNumberInput").value.trim();
const maxTolerancePercent = document.getElementById("parameterMaxTolerancePercentInput").value.trim();
const maxToleranceNumber = document.getElementById("parameterMaxToleranceNumberInput").value.trim();
    const notes = document.getElementById("parameterNotesInput").value.trim();

    if (!name || !code) {
      alert("Preencha pelo menos o nome e o código do parâmetro.");
      return;
    }

    const savedParameter = await createTechnicalParameter({
      name,
      code,
      material,
      unit,
      baseValue,
      toleranceMode,
minTolerancePercent,
minToleranceNumber,
maxTolerancePercent,
maxToleranceNumber,
      notes,
      status: "Ativo"
    });

    if (!savedParameter) return;

    technicalParameters.push(savedParameter);

    modal.classList.remove("open");
    rerenderParametros();
  });

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedParameterIndex = Number(row.dataset.parameterIndex);
toleranceMode = technicalParameters[selectedParameterIndex].toleranceMode || "percentual";
isEditingParameter = false;
isDeleteWarningOpen = false;
rerenderParametros();
    });
  });

  const closeEditBtn = document.getElementById("closeEditParameterModalBtn");
  const cancelEditBtn = document.getElementById("cancelEditParameterBtn");
  const enableEditBtn = document.getElementById("enableEditParameterBtn");
  const saveEditBtn = document.getElementById("saveEditParameterBtn");
  const openDeleteWarningBtn = document.getElementById("openDeleteParameterWarningBtn");

  closeEditBtn?.addEventListener("click", closeEditModal);
  cancelEditBtn?.addEventListener("click", closeEditModal);

  enableEditBtn?.addEventListener("click", () => {
    isEditingParameter = true;
    rerenderParametros();
  });

  saveEditBtn?.addEventListener("click", async () => {
    const parameter = technicalParameters[selectedParameterIndex];

    const updatedParameter = await updateTechnicalParameter(parameter, {
      ...parameter,
      name: document.getElementById("editParameterNameInput").value.trim(),
      code: document.getElementById("editParameterCodeInput").value.trim().toUpperCase(),
      material: document.getElementById("editParameterMaterialInput").value,
      unit: document.getElementById("editParameterUnitInput").value,
      baseValue: document.getElementById("editParameterBaseValueInput").value.trim(),
      toleranceMode,
      minTolerancePercent: document.getElementById("editParameterMinTolerancePercentInput").value.trim(),
      minToleranceNumber: document.getElementById("editParameterMinToleranceNumberInput").value.trim(),
      maxTolerancePercent: document.getElementById("editParameterMaxTolerancePercentInput").value.trim(),
      maxToleranceNumber: document.getElementById("editParameterMaxToleranceNumberInput").value.trim(),
      status: document.getElementById("editParameterStatusInput").value,
      notes: document.getElementById("editParameterNotesInput").value.trim()
    });

    if (!updatedParameter) return;

    technicalParameters[selectedParameterIndex] = updatedParameter;

    isEditingParameter = false;
    rerenderParametros();
  });

  openDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = true;
    rerenderParametros();
  });

  const cancelDeleteWarningBtn = document.getElementById("cancelDeleteParameterWarningBtn");
  const deleteAwareInput = document.getElementById("deleteParameterAwareInput");
  const confirmDeleteBtn = document.getElementById("confirmDeleteParameterBtn");

  cancelDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = false;
    rerenderParametros();
  });

  deleteAwareInput?.addEventListener("change", () => {
    confirmDeleteBtn.disabled = !deleteAwareInput.checked;
  });

  confirmDeleteBtn?.addEventListener("click", async () => {
    const deletedParameter = await deleteTechnicalParameter(technicalParameters[selectedParameterIndex]);

    if (!deletedParameter) return;

    technicalParameters.splice(selectedParameterIndex, 1);

    selectedParameterIndex = null;
    isEditingParameter = false;
    isDeleteWarningOpen = false;

    rerenderParametros();
  });

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.remove("open");
  });
}

async function loadParameterMaterialsFromApi() {
  if (hasTriedMaterialLoad) return;

  hasTriedMaterialLoad = true;

  try {
    const apiMaterials = await apiGet("/api/materials");
    lineStore.materials.splice(0, lineStore.materials.length, ...apiMaterials.map(normalizeMaterial).filter(isActiveItem));
    rerenderParametros();
  } catch (error) {
    console.log("API indisponivel, usando materiais locais");
  }
}

async function loadTechnicalParametersFromApi() {
  if (hasTriedApiLoad) return;

  hasTriedApiLoad = true;

  try {
    const apiParameters = await apiGet("/api/technical-parameters");
    technicalParameters.splice(0, technicalParameters.length, ...apiParameters.map(normalizeTechnicalParameter).filter(isActiveItem));
    rerenderParametros();
  } catch (error) {
    console.log("API indisponivel, usando parametros locais");
  }
}

async function loadStockLossParametersFromApi() {
  if (hasTriedStockLossLoad) return;

  hasTriedStockLossLoad = true;

  try {
    const parameters = await apiGet("/api/stock-loss-parameters");
    saveStockLossParameters(normalizeStockLossParameters(parameters));
    rerenderParametros();
  } catch (error) {
    console.log("API indisponivel, usando parametros de estoque locais");
  }
}

function readStockLossParametersFromForm() {
  const globalInput = document.getElementById("globalLossPercentInput");
  const globalLossPercent = normalizePercent(globalInput?.value, 10);

  const materialLossPercents = {};
  document.querySelectorAll(".material-loss-percent-input").forEach((input) => {
    const key = input.dataset.materialLossKey;
    if (!key) return;
    materialLossPercents[key] = input.value === "" ? "" : normalizePercent(input.value, globalLossPercent);
  });

  return {
    globalLossPercent,
    materialLossPercents
  };
}

async function saveStockLossParametersFromForm() {
  const payload = readStockLossParametersFromForm();

  if (!isValidStockLossParameters(payload)) {
    showStockParametersNotice("danger", "Erro ao salvar", "Informe percentuais entre 0 e 100.");
    return;
  }

  try {
    const savedParameters = await apiPut("/api/stock-loss-parameters", payload);
    saveStockLossParameters(normalizeStockLossParameters(savedParameters));
    rerenderParametros();
    showStockParametersNotice("success", "Parametros salvos", "As modificacoes de estoque foram salvas com sucesso.");
  } catch (error) {
    showStockParametersNotice("danger", "Erro ao salvar", error.message || "Nao foi possivel salvar os parametros de estoque.");
  }
}

function normalizeStockLossParameters(parameters = {}) {
  return {
    globalLossPercent: normalizePercent(parameters.globalLossPercent, 10),
    materialLossPercents: parameters.materialLossPercents || {}
  };
}

function normalizePercent(value, fallback = 10) {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : fallback;
}

function isValidStockLossParameters(parameters) {
  const values = [
    parameters.globalLossPercent,
    ...Object.values(parameters.materialLossPercents).filter((value) => value !== "")
  ];

  return values.every((value) => Number(value) >= 0 && Number(value) <= 100);
}

function showStockParametersNotice(type, title, message) {
  stockParametersNotice = { type, title, message };
  document.querySelector(".stock-parameters-notice-backdrop")?.remove();

  const backdrop = document.createElement("div");
  backdrop.className = `modal-backdrop open stock-parameters-notice-backdrop ${type === "danger" ? "danger-backdrop" : ""}`;
  backdrop.innerHTML = `
    <div class="modal stock-parameters-notice-modal ${type === "danger" ? "danger-modal" : ""}">
      <div class="delete-alert-icon">${type === "danger" ? "!" : "OK"}</div>
      <div class="modal-header vertical">
        <div>
          <h2>${title}</h2>
          <p>${message}</p>
        </div>
      </div>
      <div class="modal-footer">
        <button class="primary-btn" id="closeStockParametersNoticeBtn" type="button">Fechar</button>
      </div>
    </div>
  `;

  document.getElementById("appContent")?.appendChild(backdrop);
  backdrop.querySelector("#closeStockParametersNoticeBtn")?.addEventListener("click", closeStockParametersNotice);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeStockParametersNotice();
  });
}

function closeStockParametersNotice() {
  stockParametersNotice = null;
  document.querySelector(".stock-parameters-notice-backdrop")?.remove();
}

async function createTechnicalParameter(payload) {
  try {
    const parameter = await apiPost("/api/technical-parameters", payload);
    return normalizeTechnicalParameter(parameter);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponivel, usando parametros locais");
    return normalizeTechnicalParameter(payload);
  }
}

async function updateTechnicalParameter(parameter, payload) {
  if (!parameter.id) {
    alert("Este parametro ainda nao possui ID da API. Recarregue os parametros da API antes de editar.");
    return null;
  }

  try {
    const updatedParameter = await apiPut(`/api/technical-parameters/${parameter.id}`, payload);
    return normalizeTechnicalParameter(updatedParameter);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponivel, usando parametros locais");
    return normalizeTechnicalParameter({
      ...parameter,
      ...payload
    });
  }
}

async function deleteTechnicalParameter(parameter) {
  if (!parameter.id) {
    alert("Este parametro ainda nao possui ID da API. Recarregue os parametros da API antes de inativar.");
    return null;
  }

  try {
    const deletedParameter = await apiDelete(`/api/technical-parameters/${parameter.id}`);
    return normalizeTechnicalParameter(deletedParameter);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponivel, usando parametros locais");
    return normalizeTechnicalParameter({
      ...parameter,
      status: "Inativo"
    });
  }
}

function normalizeTechnicalParameter(parameter) {
  return {
    id: parameter.id,
    code: parameter.code || "",
    name: parameter.name || "",
    materialId: parameter.materialId || null,
    material: parameter.material || getMaterialOptions()[0] || "Nao vincular material",
    unit: parameter.unit || "un",
    baseValue: formatDecimalValue(parameter.baseValue, 3),
    toleranceMode: parameter.toleranceMode || "percentual",
    minTolerancePercent: formatDecimalValue(parameter.minTolerancePercent, 3),
    minToleranceNumber: formatDecimalValue(parameter.minToleranceNumber, 4),
    maxTolerancePercent: formatDecimalValue(parameter.maxTolerancePercent, 3),
    maxToleranceNumber: formatDecimalValue(parameter.maxToleranceNumber, 4),
    notes: parameter.notes || "",
    status: parameter.status || "Ativo",
    createdAt: parameter.createdAt,
    updatedAt: parameter.updatedAt
  };
}

function normalizeMaterial(material) {
  return {
    id: material.id,
    code: material.code || "",
    name: material.name || "",
    status: material.status || "Ativo"
  };
}

function formatDecimalValue(value, digits = null) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(String(value).replace(",", "."));
  if (!Number.isFinite(number) || digits === null) return String(value).replace(".", ",");
  return number.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function shouldUseLocalFallback(error) {
  return !error.status;
}

function isActiveItem(item) {
  return item.status !== "Inativo";
}

function closeEditModal() {
  selectedParameterIndex = null;
  isEditingParameter = false;
  isDeleteWarningOpen = false;

  rerenderParametros();
}

function updateToleranceModeFields(prefix = "") {
  const idPrefix = prefix === "edit" ? "editParameter" : "parameter";

  const minPercentInput = document.getElementById(`${idPrefix}MinTolerancePercentInput`);
  const minNumberInput = document.getElementById(`${idPrefix}MinToleranceNumberInput`);
  const maxPercentInput = document.getElementById(`${idPrefix}MaxTolerancePercentInput`);
  const maxNumberInput = document.getElementById(`${idPrefix}MaxToleranceNumberInput`);

  const percentDisabled = toleranceMode === "numeral";
  const numberDisabled = toleranceMode === "percentual";

  if (minPercentInput) minPercentInput.disabled = percentDisabled;
  if (maxPercentInput) maxPercentInput.disabled = percentDisabled;
  if (minNumberInput) minNumberInput.disabled = numberDisabled;
  if (maxNumberInput) maxNumberInput.disabled = numberDisabled;
}

function rerenderParametros() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${parametrosPage.title}</h1>
      <p>${parametrosPage.subtitle}</p>
    </div>

    ${parametrosPage.render()}
  `;

  setupParametrosEvents();
}
