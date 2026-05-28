import {
  lineStore,
  unitOptions,
  getLocationOptions,
  getMaterialTypeOptions,
  getMachineOptions,
  getConsumedMaterialOptions,
  getMaterialByName
} from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";

const materials = lineStore.materials;

let hasTriedApiLoad = false;
let hasTriedReferenceLoad = false;
let selectedMaterialIndex = null;
let isEditingMaterial = false;
let isDeleteWarningOpen = false;
let isModelDeleteWarningOpen = false;
let modelIndexToDelete = null;
let activeMaterialTab = "geral";
let isProductionModelModalOpen = false;
let selectedProductionModelIndex = null;

let modelDraftForm = {
  name: "",
  outputQuantity: "",
  outputUnit: "un",
  sourceLocation: "Selecione um local"
};

let modelDraftInputs = [];
let modelDraftEditingInputIndex = null;

let modelDraftInputForm = {
  inputMaterial: "Selecione um material",
  inputCode: "",
  consumptionMode: "Fixo",
  inputQuantity: "",
  inputUnit: "un",
  notes: ""
};

export const materiaisPage = {
  title: "🧱 Materiais",
  subtitle: "Cadastre produtos, matérias-primas, semiacabados e itens finais da empresa",
  render: renderMateriais,
  afterRender: setupMateriaisEvents
};

function renderMateriais() {
  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>

      <div class="module-toolbar-actions">
        <button class="primary-btn" id="openMaterialModalBtn">Novo material</button>
      </div>
    </div>

    <div class="card">
      <div class="table-header">
        <div>
          <h2>Materiais cadastrados</h2>
          <p>Esses materiais serão usados em estoque, produção, movimentações e rastreabilidade.</p>
        </div>
      </div>

      ${materials.length ? renderMaterialsTable() : renderEmptyMaterials()}
    </div>

    ${renderMaterialModal()}

    ${
      selectedMaterialIndex !== null
        ? renderEditMaterialModal(materials[selectedMaterialIndex])
        : ""
    }

     ${
  isProductionModelModalOpen && selectedMaterialIndex !== null
    ? renderProductionModelModal()
    : ""
}   

    ${
  isDeleteWarningOpen && selectedMaterialIndex !== null
    ? renderDeleteWarningModal(materials[selectedMaterialIndex])
    : ""
}

${
  isModelDeleteWarningOpen && selectedMaterialIndex !== null && modelIndexToDelete !== null
    ? renderDeleteModelWarningModal(materials[selectedMaterialIndex].productionModels[modelIndexToDelete])
    : ""
}
  `;
}

function renderMaterialsTable() {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Cód. lote</th>
            <th>Un. principal</th>
            <th>Un. secundária</th>
            <th>Regra un. sec.</th>
            <th>Locais permitidos</th>
            <th>Compra</th>
            <th>Produção</th>
            <th>Estoque mín.</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${materials.map(renderMaterialRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyMaterials() {
  return `
    <div class="empty-state">
      <div class="empty-icon">🧱</div>
      <h3>Nenhum material cadastrado</h3>
      <p>Comece criando os materiais da empresa. Eles podem ser comprados, produzidos ou ambos, conforme a realidade do processo.</p>
      <button class="primary-btn" id="openMaterialModalEmptyBtn">Cadastrar primeiro material</button>
    </div>
  `;
}

function renderMaterialRow(material) {
  const statusClass = material.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-material-index="${materials.indexOf(material)}">
      <td><strong>${displayValue(material.code)}</strong></td>
      <td>${displayValue(material.name)}</td>
      <td>${displayValue(material.type)}</td>
      <td>${displayValue(material.lotCode)}</td>
      <td>${displayValue(material.unit)}</td>
      <td>${displayValue(material.secondaryUnit)}</td>
      <td>${renderSecondaryUnitRuleSummary(material)}</td>
      <td>${renderMaterialLocationsSummary(material)}</td>
      <td>${material.canBePurchased ? "Sim" : "Não"}</td>
      <td>${material.canBeProduced ? "Sim" : "Não"}</td>
      <td>${material.controlsMinStock ? displayValue(material.minStock) : "-"}</td>
      <td><span class="badge ${statusClass}">${displayValue(material.status)}</span></td>
    </tr>
  `;
}

function getMaterialAllowedLocations(material) {
  return Array.isArray(material.allowedLocations)
    ? material.allowedLocations
    : [];
}

function renderMaterialLocationsSummary(material) {
  const locations = getMaterialAllowedLocations(material);

  return locations.length ? locations.join(" / ") : "-";
}

function displayValue(value) {
  return value === undefined || value === null || value === "" ? "-" : value;
}

function renderSecondaryUnitRuleSummary(material) {
  if (!material.secondaryUnit) return "-";

  if (material.secondaryUnitMode === "fixed") {
    const fixedPrimaryQuantity = material.fixedPrimaryQuantity || "";
    const fixedSecondaryQuantity = material.fixedSecondaryQuantity || "";

    return fixedPrimaryQuantity && fixedSecondaryQuantity
      ? `${fixedPrimaryQuantity} ${material.unit} = ${fixedSecondaryQuantity} ${material.secondaryUnit}`
      : "Conversão fixa";
  }

  return "Manual";
}

function normalizeMaterialLotCode(value) {
  const clean = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (!clean) return "";
  if (/^\d+$/.test(clean) && clean.length < 3) return clean.padStart(3, "0");

  return clean;
}

function renderMaterialModal() {
  return `
    <div class="modal-backdrop" id="materialModal">
      <div class="modal large-modal">
        <div class="modal-header">
          <div>
            <h2>Novo material</h2>
            <p>Cadastre um material livremente conforme a estrutura da empresa.</p>
          </div>

          <button class="modal-close" id="closeMaterialModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome do material
            <input id="materialNameInput" type="text" placeholder="Ex: Produto acabado, matéria-prima, item intermediário" />
          </label>

          <label>
            Código
            <input id="materialCodeInput" type="text" placeholder="Ex: MAT-001, PROD-01" />
          </label>

          <label>
            Código para lote
            <input id="materialLotCodeInput" type="text" maxlength="3" placeholder="Ex: 034, 061, 138" />
          </label>

          <label>
            Tipo de material
            <select id="materialTypeInput">
              ${renderSelectOptions(getMaterialTypeOptions())}
            </select>
          </label>

          <label>
  Unidade principal
  <select id="materialUnitInput">
    ${renderSelectOptions(unitOptions)}
  </select>
</label>

<label>
  Unidade secundária
  <select id="materialSecondaryUnitInput">
    ${renderSelectOptions(unitOptions, "kg")}
  </select>
</label>

<label>
  Modo da unidade secundária
  <select id="materialSecondaryUnitModeInput">
    <option value="manual" selected>Manual / informada operacionalmente</option>
    <option value="fixed">Conversão fixa</option>
  </select>
</label>

<div class="secondary-unit-conversion-grid full-field hidden" id="materialFixedConversionFields">
  <label>
    Quantidade da unidade principal base
    <input id="materialFixedPrimaryQuantityInput" type="text" inputmode="decimal" placeholder="Ex: 1" maxlength="12" />
  </label>

  <label>
    Quantidade da unidade secundária equivalente
    <input id="materialFixedSecondaryQuantityInput" type="text" inputmode="decimal" placeholder="Ex: 10" maxlength="12" />
  </label>
</div>

          <label>
            Operadores recomendados
            <input id="materialOperatorsInput" type="number" min="0" step="1" placeholder="Ex: 2" />
          </label>

        </div>

        <div class="machine-picker material-location-picker">
          <div class="machine-picker-header">
            <strong>Locais permitidos para estoque</strong>
            <span>Selecione um ou mais locais onde este material pode existir.</span>
          </div>

          <div class="machine-options">
            ${renderLocationCheckboxes()}
          </div>
        </div>

        <div class="machine-picker hidden" id="materialProductionMachinePicker">
  <div class="machine-picker-header">
    <strong>Máquinas usadas na produção</strong>
    <span>Selecione uma ou mais máquinas</span>
  </div>

  <div class="machine-options">
    ${renderMachineCheckboxes()}
  </div>
</div>

        <div class="checkbox-grid material-checkbox-grid">
          <label><input id="materialPurchasedInput" type="checkbox" /> Provém de compra</label>
          <label><input id="materialProducedInput" type="checkbox" /> Provém de produção</label>
          <label><input id="materialControlsMinStockInput" type="checkbox" /> Controla estoque mínimo</label>
        </div>

        <div class="min-stock-field hidden" id="minStockField">
  <label class="min-stock-label">
    Estoque mínimo
    <input
      id="materialMinStockInput"
      type="text"
      inputmode="decimal"
      placeholder="0,000"
      maxlength="12"
    />
  </label>
</div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelMaterialModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveMaterialBtn">Salvar material</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditMaterialModal(material) {
  const disabled = isEditingMaterial ? "" : "disabled";
  if (!material.canBeProduced && activeMaterialTab === "modelos") {
    activeMaterialTab = "geral";
  }

  return `
    <div class="modal-backdrop open" id="editMaterialModal">
      <div class="modal large-modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingMaterial ? "Editar material" : "Visualizar material"}</h2>
            <p>${isEditingMaterial ? "Altere os dados e a estrutura deste material." : "Confira os dados cadastrados para este material."}</p>
          </div>

          <button class="modal-close" id="closeEditMaterialModalBtn">×</button>
        </div>

        <div class="material-tabs">
          <button class="material-tab ${activeMaterialTab === "geral" ? "active" : ""}" data-material-tab="geral">
            Geral
          </button>

          <button class="material-tab ${activeMaterialTab === "modelos" ? "active" : ""} ${material.canBeProduced ? "" : "hidden"}" data-material-tab="modelos" ${material.canBeProduced ? "" : "disabled"}>
  Modelos de produção
</button>
        </div>

        ${
          activeMaterialTab === "geral"
            ? renderMaterialGeneralTab(material, disabled)
            : renderProductionModelsTab(material)
        }

        <div class="modal-footer between">
          ${
            isEditingMaterial
              ? `<button class="danger-btn" id="openDeleteMaterialWarningBtn">Excluir material</button>`
              : `<button class="secondary-btn" id="enableEditMaterialBtn">Editar</button>`
          }

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditMaterialBtn">
              ${isEditingMaterial ? "Concluir" : "Fechar"}
            </button>

            ${
              isEditingMaterial && activeMaterialTab === "geral"
                ? `<button class="primary-btn" id="saveEditMaterialBtn">Salvar alterações</button>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMaterialGeneralTab(material, disabled) {
  const readonlyClass = isEditingMaterial ? "" : "readonly-mode";
  const secondaryUnitMode = material.secondaryUnitMode || "manual";

  return `
    <div class="form-grid ${readonlyClass}">
      <label>
        Nome do material
        <input id="editMaterialNameInput" type="text" value="${material.name}" ${disabled} />
      </label>

      <label>
        Código
        <input id="editMaterialCodeInput" type="text" value="${material.code}" ${disabled} />
      </label>

      <label>
        Código para lote
        <input id="editMaterialLotCodeInput" type="text" maxlength="3" value="${material.lotCode || ""}" placeholder="Ex: 034" ${disabled} />
      </label>

      <label>
        Tipo de material
        <select id="editMaterialTypeInput" ${disabled}>
          ${renderSelectOptions(getMaterialTypeOptions(), material.type)}
        </select>
      </label>

      <label>
  Unidade principal
  <select id="editMaterialUnitInput" ${disabled}>
    ${renderSelectOptions(unitOptions, material.unit)}
  </select>
</label>

<label>
  Unidade secundária
  <select id="editMaterialSecondaryUnitInput" ${disabled}>
    ${renderSelectOptions(unitOptions, material.secondaryUnit || "")}
  </select>
</label>

<label>
  Modo da unidade secundária
  <select id="editMaterialSecondaryUnitModeInput" ${disabled}>
    <option value="manual" ${secondaryUnitMode === "manual" ? "selected" : ""}>Manual / informada operacionalmente</option>
    <option value="fixed" ${secondaryUnitMode === "fixed" ? "selected" : ""}>Conversão fixa</option>
  </select>
</label>

<div class="secondary-unit-conversion-grid full-field ${readonlyClass} ${secondaryUnitMode === "fixed" ? "" : "hidden"}" id="editMaterialFixedConversionFields">
  <label>
    Quantidade da unidade principal base
    <input
      id="editMaterialFixedPrimaryQuantityInput"
      type="text"
      inputmode="decimal"
      value="${material.fixedPrimaryQuantity || ""}"
      maxlength="12"
      ${disabled}
    />
  </label>

  <label>
    Quantidade da unidade secundária equivalente
    <input
      id="editMaterialFixedSecondaryQuantityInput"
      type="text"
      inputmode="decimal"
      value="${material.fixedSecondaryQuantity || ""}"
      maxlength="12"
      ${disabled}
    />
  </label>
</div>

      <label>
        Status
        <select id="editMaterialStatusInput" ${disabled}>
          <option ${material.status === "Ativo" ? "selected" : ""}>Ativo</option>
          <option ${material.status === "Inativo" ? "selected" : ""}>Inativo</option>
        </select>
      </label>

      <label>
  Operadores recomendados
  <input id="editMaterialOperatorsInput" type="number" min="0" step="1" value="${material.recommendedOperators || ""}" ${disabled} />
</label>

        </div>

    <div class="machine-picker material-location-picker ${readonlyClass}">
      <div class="machine-picker-header">
        <strong>Locais permitidos para estoque</strong>
        <span>Selecione um ou mais locais onde este material pode existir.</span>
      </div>

      <div class="machine-options">
        ${renderLocationCheckboxes(getMaterialAllowedLocations(material), "edit", disabled)}
      </div>
    </div>

    <div class="machine-picker ${readonlyClass} ${material.canBeProduced ? "" : "hidden"}" id="editMaterialProductionMachinePicker">
  <div class="machine-picker-header">
    <strong>Máquinas usadas na produção</strong>
    <span>Selecione uma ou mais máquinas</span>
  </div>

  <div class="machine-options">
    ${renderMachineCheckboxes(material.productionMachines || [], "edit", disabled)}
  </div>
</div>

    <div class="checkbox-grid material-checkbox-grid ${readonlyClass}">
      <label>
        <input id="editMaterialPurchasedInput" type="checkbox" ${material.canBePurchased ? "checked" : ""} ${disabled} />
        Provém de compra
      </label>

      <label>
        <input id="editMaterialProducedInput" type="checkbox" ${material.canBeProduced ? "checked" : ""} ${disabled} />
        Provém de produção
      </label>

      <label>
        <input id="editMaterialControlsMinStockInput" type="checkbox" ${material.controlsMinStock ? "checked" : ""} ${disabled} />
        Controla estoque mínimo
      </label>
    </div>

    <div class="min-stock-field ${readonlyClass} ${material.controlsMinStock ? "" : "hidden"}" id="editMinStockField">
      <label class="min-stock-label">
        Estoque mínimo
        <input
          id="editMaterialMinStockInput"
          type="text"
          inputmode="decimal"
          value="${material.minStock || ""}"
          maxlength="12"
          ${disabled}
        />
      </label>
    </div>
  `;
}

function renderProductionModelsTab(material) {
  const models = material.productionModels || [];

  return `
    <div class="structure-panel">
      <div class="structure-header model-list-header">
        <div>
          <h3>Modelos de produção</h3>
          <p>Cadastre formas possíveis de produzir este material, com consumos fixos ou variáveis.</p>
        </div>

        ${
          isEditingMaterial && models.length
            ? `<button class="primary-btn" id="openProductionModelModalBtn">Novo modelo</button>`
            : ""
        }
      </div>

      ${
        models.length
          ? renderProductionModelsList(models)
          : `
            <div class="empty-state small-empty">
              <div class="empty-icon">🧩</div>
              <h3>Nenhum modelo cadastrado</h3>
              <p>Crie modelos para definir o que este material consome quando for produzido.</p>
              ${
                isEditingMaterial
                  ? `<button class="primary-btn" id="openFirstProductionModelModalBtn">Cadastrar primeiro modelo</button>`
                  : ""
              }
            </div>
          `
      }

      ${
        !isEditingMaterial
          ? `
            <div class="structure-readonly-note">
              Clique em <strong>Editar</strong> para criar, alterar ou remover modelos de produção.
            </div>
          `
          : ""
      }

    </div>
  `;
}

function renderProductionModelsList(models) {
  return `
    <div class="production-models-list">
      ${models.map((model, index) => `
        <div class="production-model-card">
          <div class="production-model-head">
            <div>
              <strong>${model.name}</strong>
              <span>Produz ${model.outputQuantity} ${model.outputUnit}</span>
              <span>Consumo sai de: ${model.sourceLocation}</span>
            </div>

            ${
              isEditingMaterial
                ? `
                  <div class="model-card-actions">
                    <button class="secondary-btn small-action-btn" data-edit-model-index="${index}">Editar modelo</button>
                    <button class="mini-danger-btn" data-open-delete-model-index="${index}">Remover modelo</button>
                  </div>
                `
                : ""
            }
          </div>

          <div class="data-table-wrap structure-table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Material consumido</th>
                  <th>Código</th>
                  <th>Tipo consumo</th>
                  <th>Qtd. consumo</th>
                  <th>Unidade</th>
                  <th>Observação</th>
                </tr>
              </thead>

              <tbody>
                ${model.inputs.map(input => `
                  <tr>
                    <td><strong>${input.inputMaterial}</strong></td>
                    <td>${input.inputCode || "-"}</td>
                    <td>${input.consumptionMode}</td>
                    <td>${input.consumptionMode === "Variável na produção" ? "Informado na produção" : input.inputQuantity}</td>
                    <td>${input.inputUnit}</td>
                    <td>${input.notes || "-"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderProductionModelModal() {
  const isEditingModel = selectedProductionModelIndex !== null;

  return `
    <div class="modal-backdrop open model-modal-backdrop" id="productionModelModal">
      <div class="modal large-modal production-model-modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingModel ? "Editar modelo de produção" : "Novo modelo de produção"}</h2>
            <p>Defina como este material pode ser produzido e quais itens serão consumidos.</p>
          </div>

          <button class="modal-close" id="closeProductionModelModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome do modelo
            <input id="modelNameInput" type="text" value="${modelDraftForm.name}" placeholder="Ex: Modelo padrão, Alternativa 01" />
          </label>

          <label>
            Quantidade produzida base
            <input id="modelOutputQuantityInput" type="text" inputmode="decimal" value="${modelDraftForm.outputQuantity}" placeholder="0,000" />
          </label>

          <label>
            Unidade produzida
            <select id="modelOutputUnitInput">
              ${renderSelectOptions(unitOptions, modelDraftForm.outputUnit)}
            </select>
          </label>

          <label>
            Local/setor de consumo
            <select id="modelSourceLocationInput">
              ${renderSelectOptions(getLocationOptions(), modelDraftForm.sourceLocation)}
            </select>
          </label>
        </div>

        <div class="model-input-box model-input-box-spaced">
          <h4>Itens consumidos pelo modelo</h4>

          ${
            modelDraftInputs.length
              ? renderModelDraftInputs()
              : `<div class="structure-readonly-note model-empty-note">Nenhum item consumido adicionado ainda.</div>`
          }

          <div class="form-grid">
            <label>
              Material consumido
              <select id="modelInputMaterialInput">
                ${renderConsumedMaterialOptions(modelDraftInputForm.inputMaterial)}
              </select>
            </label>

            <label>
              Código do material
              <input id="modelInputCodeInput" type="text" value="${modelDraftInputForm.inputCode}" placeholder="Selecionar material" disabled />
            </label>

            <label>
              Tipo de consumo
              <select id="modelConsumptionModeInput">
                <option ${modelDraftInputForm.consumptionMode === "Fixo" ? "selected" : ""}>Fixo</option>
                <option ${modelDraftInputForm.consumptionMode === "Variável na produção" ? "selected" : ""}>Variável na produção</option>
              </select>
            </label>

            <label>
              Quantidade consumida
              <input
                id="modelInputQuantityInput"
                type="text"
                inputmode="decimal"
                value="${modelDraftInputForm.inputQuantity}"
                placeholder="${modelDraftInputForm.consumptionMode === "Variável na produção" ? "Informado na produção" : "0,000"}"
                ${modelDraftInputForm.consumptionMode === "Variável na produção" ? "disabled" : ""}
              />
            </label>

            <label>
              Unidade consumida
              <select id="modelInputUnitInput">
                ${renderSelectOptions(unitOptions, modelDraftInputForm.inputUnit)}
              </select>
            </label>
          </div>

          <div class="form-grid single">
            <label>
              Observação
              <input id="modelInputNotesInput" type="text" value="${modelDraftInputForm.notes}" placeholder="Observação opcional sobre este consumo" />
            </label>
          </div>

          <div class="structure-actions">
            <button class="secondary-btn" id="addModelInputBtn">
              ${modelDraftEditingInputIndex !== null ? "Salvar item consumido" : "+ Adicionar item consumido"}
            </button>
          </div>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelProductionModelModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveProductionModelBtn">
            ${isEditingModel ? "Salvar alterações do modelo" : "Salvar modelo de produção"}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderModelDraftInputs() {
  return `
    <div class="model-draft-list">
      ${modelDraftInputs.map((input, index) => `
        <div class="model-draft-item">
          <div>
            <strong>${input.inputMaterial}</strong>
            <span>
              Código: ${input.inputCode || "-"} •
              ${input.consumptionMode === "Variável na produção" ? "Consumo variável" : `${input.inputQuantity} ${input.inputUnit}`}
            </span>
          </div>

          <div class="model-card-actions">
            <button class="secondary-btn small-action-btn" data-edit-draft-input-index="${index}">Editar</button>
            <button class="mini-danger-btn" data-remove-draft-input-index="${index}">Remover</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderConsumedMaterialOptions(selectedValue = "") {
  const availableMaterials = getConsumedMaterialOptions(selectedMaterialIndex);

  if (!availableMaterials.length) {
    return `<option>Nenhum material disponível</option>`;
  }

  return [
    `<option ${selectedValue === "Selecione um material" ? "selected" : ""}>Selecione um material</option>`,
    ...availableMaterials.map(material => `<option value="${material.name}" ${material.name === selectedValue ? "selected" : ""}>${material.name}</option>`)
  ].join("");
}

function renderDeleteModelWarningModal(model) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteModelWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de modelo</h2>
            <p>
              Você está prestes a excluir o modelo <strong>${model.name}</strong>.
              Essa ação pode afetar cálculos de produção, simulações, ordens e apontamentos futuros.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, se este modelo já tiver sido usado em produção, o recomendado será inativar ou versionar o modelo, não excluir definitivamente.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteModelAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteModelWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteModelBtn" disabled>Confirmar exclusão</button>
        </div>
      </div>
    </div>
  `;
}

function resetProductionModelDraft() {
  selectedProductionModelIndex = null;
  resetModelDraftInputForm();

  modelDraftForm = {
    name: "",
    outputQuantity: "",
    outputUnit: "un",
    sourceLocation: "Selecione um local"
  };

  modelDraftInputs = [];
}

function resetModelDraftInputForm() {
  modelDraftEditingInputIndex = null;
  modelDraftInputForm = {
    inputMaterial: "Selecione um material",
    inputCode: "",
    consumptionMode: "Fixo",
    inputQuantity: "",
    inputUnit: "un",
    notes: ""
  };
}

function captureProductionModelDraft() {
  modelDraftForm = {
    name: document.getElementById("modelNameInput")?.value.trim() || "",
    outputQuantity: document.getElementById("modelOutputQuantityInput")?.value.trim() || "",
    outputUnit: document.getElementById("modelOutputUnitInput")?.value || "un",
    sourceLocation: document.getElementById("modelSourceLocationInput")?.value || "Selecione um local"
  };
}

function captureModelDraftInputForm() {
  const inputMaterial = document.getElementById("modelInputMaterialInput")?.value || "Selecione um material";
  const selectedInputMaterial = getMaterialByName(inputMaterial);
  const consumptionMode = document.getElementById("modelConsumptionModeInput")?.value || "Fixo";

  modelDraftInputForm = {
    inputMaterial,
    inputCode: selectedInputMaterial?.code || document.getElementById("modelInputCodeInput")?.value || "",
    consumptionMode,
    inputQuantity: consumptionMode === "Fixo" ? document.getElementById("modelInputQuantityInput")?.value.trim() || "" : "",
    inputUnit: document.getElementById("modelInputUnitInput")?.value || "un",
    notes: document.getElementById("modelInputNotesInput")?.value.trim() || ""
  };
}

function openProductionModelModalForCreate() {
  const material = materials[selectedMaterialIndex];
  if (material && !material.canBeProduced) {
    alert("Modelos de produção ficam disponíveis apenas para materiais que provêm de produção.");
    return;
  }

  resetProductionModelDraft();
  isProductionModelModalOpen = true;
  activeMaterialTab = "modelos";
  rerenderMateriais();
}

function openProductionModelModalForEdit(index) {
  const material = materials[selectedMaterialIndex];
  if (!material?.canBeProduced) {
    alert("Modelos de produção ficam disponíveis apenas para materiais que provêm de produção.");
    return;
  }

  const model = material.productionModels[index];

  selectedProductionModelIndex = index;

  modelDraftForm = {
    name: model.name,
    outputQuantity: model.outputQuantity,
    outputUnit: model.outputUnit,
    sourceLocation: model.sourceLocation
  };

  modelDraftInputs = [...model.inputs];
  resetModelDraftInputForm();

  isProductionModelModalOpen = true;
  activeMaterialTab = "modelos";
  rerenderMateriais();
}

function renderMachineCheckboxes(selectedMachines = [], prefix = "new", disabled = "") {
  return getMachineOptions().map((machine, index) => `
    <label>
      <input
        type="checkbox"
        class="material-machine-checkbox"
        data-machine-name="${machine}"
        ${prefix === "edit" ? `id="editMaterialMachine${index}"` : `id="materialMachine${index}"`}
        ${selectedMachines.includes(machine) ? "checked" : ""}
        ${disabled}
      />
      ${machine}
    </label>
  `).join("");
}

function renderLocationCheckboxes(selectedLocations = [], prefix = "new", disabled = "") {
  const locations = getLocationOptions().filter((location) => {
    return location !== "Selecione um local";
  });

  if (!locations.length) {
    return `<span class="structure-readonly-note">Nenhum local cadastrado.</span>`;
  }

  return locations.map((location, index) => `
    <label>
      <input
        type="checkbox"
        class="material-location-checkbox"
        data-location-name="${location}"
        ${prefix === "edit" ? `id="editMaterialLocationAllowed${index}"` : `id="materialLocationAllowed${index}"`}
        ${selectedLocations.includes(location) ? "checked" : ""}
        ${disabled}
      />
      ${location}
    </label>
  `).join("");
}

function getSelectedMaterialLocations() {
  return Array.from(document.querySelectorAll(".material-location-checkbox:checked"))
    .map((input) => input.dataset.locationName)
    .filter(Boolean);
}

function getSelectedMachines() {
  return Array.from(document.querySelectorAll(".material-machine-checkbox:checked"))
    .map(input => input.dataset.machineName);
}

function syncMaterialOriginUi(prefix = "new") {
  const producedInput = document.getElementById(prefix === "edit" ? "editMaterialProducedInput" : "materialProducedInput");
  const machinePicker = document.getElementById(prefix === "edit" ? "editMaterialProductionMachinePicker" : "materialProductionMachinePicker");
  const isProduced = Boolean(producedInput?.checked);

  machinePicker?.classList.toggle("hidden", !isProduced);
  machinePicker?.querySelectorAll("input").forEach((input) => {
    input.disabled = !isProduced || (prefix === "edit" && !isEditingMaterial);
  });
}

function hasMaterialOrigin(canBePurchased, canBeProduced) {
  return canBePurchased || canBeProduced;
}

function renderDeleteWarningModal(material) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteMaterialWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de material</h2>
            <p>
              Você está prestes a excluir o material <strong>${material.name}</strong>.
              Essa ação pode afetar estoque, lotes, produção, movimentações, rastreabilidade e relatórios.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, essa ação só deve ser permitida se o material não tiver lotes,
            movimentações ou produções vinculadas. Caso contrário, o recomendado será inativar o material.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteMaterialAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteMaterialWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteMaterialBtn" disabled>Confirmar exclusão</button>
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

function setupMateriaisEvents() {
  loadMaterialReferencesFromApi();
  loadMaterialsFromApi();

  const modal = document.getElementById("materialModal");
  const openBtn = document.getElementById("openMaterialModalBtn");
  const openEmptyBtn = document.getElementById("openMaterialModalEmptyBtn");
  const closeBtn = document.getElementById("closeMaterialModalBtn");
  const cancelBtn = document.getElementById("cancelMaterialModalBtn");
  const saveBtn = document.getElementById("saveMaterialBtn");
  const rows = document.querySelectorAll(".clickable-row");

  const materialTabs = document.querySelectorAll("[data-material-tab]");
  const openProductionModelModalBtn = document.getElementById("openProductionModelModalBtn");
const openFirstProductionModelModalBtn = document.getElementById("openFirstProductionModelModalBtn");
const closeProductionModelModalBtn = document.getElementById("closeProductionModelModalBtn");
const cancelProductionModelModalBtn = document.getElementById("cancelProductionModelModalBtn");

const addModelInputBtn = document.getElementById("addModelInputBtn");
const saveProductionModelBtn = document.getElementById("saveProductionModelBtn");
const openDeleteModelButtons = document.querySelectorAll("[data-open-delete-model-index]");
const removeDraftInputButtons = document.querySelectorAll("[data-remove-draft-input-index]");
const editDraftInputButtons = document.querySelectorAll("[data-edit-draft-input-index]");
const editModelButtons = document.querySelectorAll("[data-edit-model-index]");
const modelInputMaterialInput = document.getElementById("modelInputMaterialInput");
const modelInputCodeInput = document.getElementById("modelInputCodeInput");
  const modelOutputQuantityInput = document.getElementById("modelOutputQuantityInput");
  const modelInputQuantityInput = document.getElementById("modelInputQuantityInput");
  const modelConsumptionModeInput = document.getElementById("modelConsumptionModeInput");

  const controlsMinStockInput = document.getElementById("materialControlsMinStockInput");
  const minStockField = document.getElementById("minStockField");
  const secondaryUnitModeInput = document.getElementById("materialSecondaryUnitModeInput");
  const fixedConversionFields = document.getElementById("materialFixedConversionFields");
  const materialProducedInput = document.getElementById("materialProducedInput");
  const editMaterialProducedInput = document.getElementById("editMaterialProducedInput");

  const materialMinStockInput = document.getElementById("materialMinStockInput");
  const editMaterialMinStockInput = document.getElementById("editMaterialMinStockInput");
  const materialFixedPrimaryQuantityInput = document.getElementById("materialFixedPrimaryQuantityInput");
  const materialFixedSecondaryQuantityInput = document.getElementById("materialFixedSecondaryQuantityInput");
  const editMaterialFixedPrimaryQuantityInput = document.getElementById("editMaterialFixedPrimaryQuantityInput");
  const editMaterialFixedSecondaryQuantityInput = document.getElementById("editMaterialFixedSecondaryQuantityInput");

  controlsMinStockInput?.addEventListener("change", () => {
    minStockField.classList.toggle("hidden", !controlsMinStockInput.checked);
  });

  secondaryUnitModeInput?.addEventListener("change", () => {
    fixedConversionFields.classList.toggle("hidden", secondaryUnitModeInput.value !== "fixed");
  });

  syncMaterialOriginUi();
  syncMaterialOriginUi("edit");

  materialProducedInput?.addEventListener("change", () => {
    syncMaterialOriginUi();
  });

  editMaterialProducedInput?.addEventListener("change", () => {
    const material = materials[selectedMaterialIndex];
    if (!editMaterialProducedInput.checked && material?.productionModels?.length) {
      alert("Modelos de produção existentes serão preservados, mas ficarão bloqueados enquanto o material não provier de produção.");
    }

    syncMaterialOriginUi("edit");
  });

  applyDecimalMask(materialMinStockInput);
  applyDecimalMask(editMaterialMinStockInput);
  applyDecimalMask(materialFixedPrimaryQuantityInput);
  applyDecimalMask(materialFixedSecondaryQuantityInput);
  applyDecimalMask(editMaterialFixedPrimaryQuantityInput);
  applyDecimalMask(editMaterialFixedSecondaryQuantityInput);

  applyDecimalMask(modelOutputQuantityInput);
  applyDecimalMask(modelInputQuantityInput);

materialTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.materialTab === "modelos" && !materials[selectedMaterialIndex]?.canBeProduced) {
      alert("Modelos de produção ficam disponíveis apenas para materiais que provêm de produção.");
      return;
    }

    activeMaterialTab = tab.dataset.materialTab;
    rerenderMateriais();
  });
});

openProductionModelModalBtn?.addEventListener("click", openProductionModelModalForCreate);
openFirstProductionModelModalBtn?.addEventListener("click", openProductionModelModalForCreate);

closeProductionModelModalBtn?.addEventListener("click", closeProductionModelModal);
cancelProductionModelModalBtn?.addEventListener("click", closeProductionModelModal);

modelInputMaterialInput?.addEventListener("change", () => {
  const selectedMaterial = getMaterialByName(modelInputMaterialInput.value);
  modelInputCodeInput.value = selectedMaterial?.code || "";
  captureModelDraftInputForm();
});

  openBtn?.addEventListener("click", () => {
    modal.classList.add("open");
  });

  openEmptyBtn?.addEventListener("click", () => {
    modal.classList.add("open");
  });

  closeBtn?.addEventListener("click", () => {
    modal.classList.remove("open");
  });

  cancelBtn?.addEventListener("click", () => {
    modal.classList.remove("open");
  });

  saveBtn?.addEventListener("click", async () => {
    const name = document.getElementById("materialNameInput").value.trim();
    const code = document.getElementById("materialCodeInput").value.trim().toUpperCase();
    const lotCode = normalizeMaterialLotCode(document.getElementById("materialLotCodeInput").value);
    const type = document.getElementById("materialTypeInput").value;
    const unit = document.getElementById("materialUnitInput").value;
    const secondaryUnit = document.getElementById("materialSecondaryUnitInput").value;
    const secondaryUnitMode = document.getElementById("materialSecondaryUnitModeInput").value;
    const fixedPrimaryQuantity = document.getElementById("materialFixedPrimaryQuantityInput").value;
    const fixedSecondaryQuantity = document.getElementById("materialFixedSecondaryQuantityInput").value;
    const allowedLocations = getSelectedMaterialLocations();
    const canBePurchased = document.getElementById("materialPurchasedInput").checked;
    const canBeProduced = document.getElementById("materialProducedInput").checked;
    const controlsMinStock = document.getElementById("materialControlsMinStockInput").checked;
    const minStock = document.getElementById("materialMinStockInput").value;

    const recommendedOperators = document.getElementById("materialOperatorsInput").value;
const productionMachines = canBeProduced ? getSelectedMachines() : [];

    if (!name || !code) {
      alert("Preencha pelo menos o nome e o código do material.");
      return;
    }

    if (type === "Selecione um tipo") {
      alert("Selecione o tipo de material.");
      return;
    }

    if (lotCode && lotCode.length !== 3) {
      alert("O Código para lote do material precisa ter 3 caracteres.");
      return;
    }

    if (!allowedLocations.length) {
  alert("Selecione pelo menos um local permitido para estoque.");
  return;
}

    if (!hasMaterialOrigin(canBePurchased, canBeProduced)) {
      alert("Selecione pelo menos uma origem: compra ou produção.");
      return;
    }

    if (controlsMinStock && !minStock) {
      alert("Informe o estoque mínimo.");
      return;
    }

    if (secondaryUnitMode === "fixed" && (!fixedPrimaryQuantity || !fixedSecondaryQuantity)) {
      alert("Informe as quantidades da conversão fixa da unidade secundária.");
      return;
    }

    const savedMaterial = await createMaterial({
      code,
      name,
      type,
      lotCode,
      unit,
      primaryUnit: unit,
      secondaryUnit,
      secondaryUnitMode,
      fixedPrimaryQuantity: secondaryUnitMode === "fixed" ? fixedPrimaryQuantity : "",
      fixedSecondaryQuantity: secondaryUnitMode === "fixed" ? fixedSecondaryQuantity : "",
      allowedLocations,
      canBePurchased,
      purchasable: canBePurchased,
      canBeProduced,
      producible: canBeProduced,
      controlsMinStock,
      controlsMinimumStock: controlsMinStock,
      minStock: controlsMinStock ? minStock : "",
      minimumStockQuantity: controlsMinStock ? minStock : "",
      status: "Ativo",
      productionMachines,
      recommendedOperators,
      productionModels: []
    });

    if (!savedMaterial) return;

    materials.push(savedMaterial);

    modal.classList.remove("open");
    rerenderMateriais();
  });

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedMaterialIndex = Number(row.dataset.materialIndex);
isEditingMaterial = false;
isDeleteWarningOpen = false;
activeMaterialTab = "geral";
modelDraftInputs = [];
rerenderMateriais();
    });
  });

  const closeEditBtn = document.getElementById("closeEditMaterialModalBtn");
  const cancelEditBtn = document.getElementById("cancelEditMaterialBtn");
  const enableEditBtn = document.getElementById("enableEditMaterialBtn");
  const saveEditBtn = document.getElementById("saveEditMaterialBtn");
  const openDeleteWarningBtn = document.getElementById("openDeleteMaterialWarningBtn");
  const editControlsMinStockInput = document.getElementById("editMaterialControlsMinStockInput");
  const editMinStockField = document.getElementById("editMinStockField");
  const editSecondaryUnitModeInput = document.getElementById("editMaterialSecondaryUnitModeInput");
  const editFixedConversionFields = document.getElementById("editMaterialFixedConversionFields");

  editControlsMinStockInput?.addEventListener("change", () => {
    editMinStockField.classList.toggle("hidden", !editControlsMinStockInput.checked);
  });

  editSecondaryUnitModeInput?.addEventListener("change", () => {
    editFixedConversionFields.classList.toggle("hidden", editSecondaryUnitModeInput.value !== "fixed");
  });

  closeEditBtn?.addEventListener("click", closeEditModal);
  cancelEditBtn?.addEventListener("click", closeEditModal);

  enableEditBtn?.addEventListener("click", () => {
    isEditingMaterial = true;
    rerenderMateriais();
  });

  saveEditBtn?.addEventListener("click", async () => {
    const material = materials[selectedMaterialIndex];
    const secondaryUnitMode = document.getElementById("editMaterialSecondaryUnitModeInput").value;
    const fixedPrimaryQuantity = document.getElementById("editMaterialFixedPrimaryQuantityInput").value;
    const fixedSecondaryQuantity = document.getElementById("editMaterialFixedSecondaryQuantityInput").value;

    if (secondaryUnitMode === "fixed" && (!fixedPrimaryQuantity || !fixedSecondaryQuantity)) {
      alert("Informe as quantidades da conversão fixa da unidade secundária.");
      return;
    }

    const name = document.getElementById("editMaterialNameInput").value.trim();
    const code = document.getElementById("editMaterialCodeInput").value.trim().toUpperCase();
    const lotCode = normalizeMaterialLotCode(document.getElementById("editMaterialLotCodeInput").value);

    if (lotCode && lotCode.length !== 3) {
      alert("O Código para lote do material precisa ter 3 caracteres.");
      return;
    }

    const unit = document.getElementById("editMaterialUnitInput").value;
    const controlsMinStock = document.getElementById("editMaterialControlsMinStockInput").checked;
    const minStock = controlsMinStock
      ? document.getElementById("editMaterialMinStockInput").value
      : "";
    const canBePurchased = document.getElementById("editMaterialPurchasedInput").checked;
    const canBeProduced = document.getElementById("editMaterialProducedInput").checked;

    if (!hasMaterialOrigin(canBePurchased, canBeProduced)) {
      alert("Selecione pelo menos uma origem: compra ou produção.");
      return;
    }

    const updatedMaterial = await updateMaterial(material, {
      ...material,
      name,
      code,
      lotCode,
      type: document.getElementById("editMaterialTypeInput").value,
      unit,
      primaryUnit: unit,
      secondaryUnit: document.getElementById("editMaterialSecondaryUnitInput").value,
      secondaryUnitMode,
      fixedPrimaryQuantity: secondaryUnitMode === "fixed" ? fixedPrimaryQuantity : "",
      fixedSecondaryQuantity: secondaryUnitMode === "fixed" ? fixedSecondaryQuantity : "",
      allowedLocations: getSelectedMaterialLocations(),
      status: document.getElementById("editMaterialStatusInput").value,
      canBePurchased,
      purchasable: canBePurchased,
      canBeProduced,
      producible: canBeProduced,
      controlsMinStock,
      controlsMinimumStock: controlsMinStock,
      minStock,
      minimumStockQuantity: minStock,
      productionMachines: canBeProduced ? getSelectedMachines() : (material.productionMachines || []),
      recommendedOperators: document.getElementById("editMaterialOperatorsInput").value
    });

    if (!updatedMaterial) return;

    materials[selectedMaterialIndex] = updatedMaterial;

    isEditingMaterial = false;
    rerenderMateriais();
  });

  openDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = true;
    rerenderMateriais();
  });

  const cancelDeleteWarningBtn = document.getElementById("cancelDeleteMaterialWarningBtn");
  const deleteAwareInput = document.getElementById("deleteMaterialAwareInput");
  const confirmDeleteBtn = document.getElementById("confirmDeleteMaterialBtn");

  cancelDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = false;
    rerenderMateriais();
  });

  deleteAwareInput?.addEventListener("change", () => {
    confirmDeleteBtn.disabled = !deleteAwareInput.checked;
  });

  confirmDeleteBtn?.addEventListener("click", async () => {
    const deletedMaterial = await deleteMaterial(materials[selectedMaterialIndex]);

    if (!deletedMaterial) return;

    materials.splice(selectedMaterialIndex, 1);

    selectedMaterialIndex = null;
    isEditingMaterial = false;
    isDeleteWarningOpen = false;

    rerenderMateriais();
  });

  modelConsumptionModeInput?.addEventListener("change", () => {
  const quantityInput = document.getElementById("modelInputQuantityInput");
  captureModelDraftInputForm();

  if (modelConsumptionModeInput.value === "Variável na produção") {
    quantityInput.value = "";
    quantityInput.disabled = true;
    quantityInput.placeholder = "Informado na produção";
  } else {
    quantityInput.disabled = false;
    quantityInput.placeholder = "0,000";
  }
});

addModelInputBtn?.addEventListener("click", () => {
  captureProductionModelDraft();
  captureModelDraftInputForm();
  const { inputMaterial, inputCode, consumptionMode, inputQuantity, inputUnit, notes } = modelDraftInputForm;

  if (!inputMaterial || inputMaterial === "Selecione um material" || inputMaterial === "Nenhum material disponível") {
    alert("Selecione o material consumido.");
    return;
  }

  if (consumptionMode === "Fixo" && !inputQuantity) {
    alert("Informe a quantidade consumida ou marque como variável na produção.");
    return;
  }

  const nextInput = {
    inputMaterial,
    inputCode,
    consumptionMode,
    inputQuantity: consumptionMode === "Fixo" ? inputQuantity : "",
    inputUnit,
    notes
  };

  if (modelDraftEditingInputIndex !== null) {
    modelDraftInputs[modelDraftEditingInputIndex] = nextInput;
  } else {
    modelDraftInputs.push(nextInput);
  }

  resetModelDraftInputForm();

  activeMaterialTab = "modelos";
  rerenderMateriais();
});

removeDraftInputButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const index = Number(button.dataset.removeDraftInputIndex);
    modelDraftInputs.splice(index, 1);
    if (modelDraftEditingInputIndex === index) {
      resetModelDraftInputForm();
    } else if (modelDraftEditingInputIndex !== null && modelDraftEditingInputIndex > index) {
      modelDraftEditingInputIndex -= 1;
    }

    activeMaterialTab = "modelos";
    rerenderMateriais();
  });
});

editDraftInputButtons.forEach((button) => {
  button.addEventListener("click", () => {
    captureProductionModelDraft();
    const index = Number(button.dataset.editDraftInputIndex);
    const input = modelDraftInputs[index];

    if (!input) return;

    modelDraftEditingInputIndex = index;
    modelDraftInputForm = {
      inputMaterial: input.inputMaterial || "Selecione um material",
      inputCode: input.inputCode || "",
      consumptionMode: input.consumptionMode || "Fixo",
      inputQuantity: input.inputQuantity || "",
      inputUnit: input.inputUnit || "un",
      notes: input.notes || ""
    };

    activeMaterialTab = "modelos";
    rerenderMateriais();
  });
});

saveProductionModelBtn?.addEventListener("click", async () => {
  const material = materials[selectedMaterialIndex];

  if (!material?.canBeProduced) {
    alert("Modelos de produção ficam disponíveis apenas para materiais que provêm de produção.");
    return;
  }

  const modelName = document.getElementById("modelNameInput").value.trim();
  const outputQuantity = document.getElementById("modelOutputQuantityInput").value.trim();
  const outputUnit = document.getElementById("modelOutputUnitInput").value;
  const sourceLocation = document.getElementById("modelSourceLocationInput").value;

  if (!material.productionModels) {
    material.productionModels = [];
  }

  if (!modelName) {
    alert("Informe o nome do modelo.");
    return;
  }

  if (!outputQuantity) {
    alert("Informe a quantidade produzida base.");
    return;
  }

  if (sourceLocation === "Selecione um local") {
    alert("Selecione de qual local ou setor o consumo será retirado.");
    return;
  }

  if (!modelDraftInputs.length) {
    alert("Adicione pelo menos um item consumido ao modelo.");
    return;
  }

  const modelPayload = {
  name: modelName,
  outputQuantity,
  outputUnit,
  sourceLocation,
  inputs: [...modelDraftInputs]
};

const nextModels = [...material.productionModels];

if (selectedProductionModelIndex !== null) {
  nextModels[selectedProductionModelIndex] = modelPayload;
} else {
  nextModels.push(modelPayload);
}

const updatedMaterial = await updateMaterial(material, {
  ...material,
  productionModels: nextModels
});

if (!updatedMaterial) return;

materials[selectedMaterialIndex] = updatedMaterial;

  modelDraftInputs = [];
  selectedProductionModelIndex = null;
isProductionModelModalOpen = false;
activeMaterialTab = "modelos";
rerenderMateriais();
});

openDeleteModelButtons.forEach((button) => {
  button.addEventListener("click", () => {
    modelIndexToDelete = Number(button.dataset.openDeleteModelIndex);
    isModelDeleteWarningOpen = true;
    activeMaterialTab = "modelos";
    rerenderMateriais();
  });
});

editModelButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const index = Number(button.dataset.editModelIndex);
    openProductionModelModalForEdit(index);
  });
});

const cancelDeleteModelWarningBtn = document.getElementById("cancelDeleteModelWarningBtn");
const deleteModelAwareInput = document.getElementById("deleteModelAwareInput");
const confirmDeleteModelBtn = document.getElementById("confirmDeleteModelBtn");

cancelDeleteModelWarningBtn?.addEventListener("click", () => {
  isModelDeleteWarningOpen = false;
  modelIndexToDelete = null;
  activeMaterialTab = "modelos";
  rerenderMateriais();
});

deleteModelAwareInput?.addEventListener("change", () => {
  confirmDeleteModelBtn.disabled = !deleteModelAwareInput.checked;
});

confirmDeleteModelBtn?.addEventListener("click", async () => {
  const material = materials[selectedMaterialIndex];

  const nextModels = [...(material.productionModels || [])];
  nextModels.splice(modelIndexToDelete, 1);
  const updatedMaterial = await updateMaterial(material, {
    ...material,
    productionModels: nextModels
  });

  if (!updatedMaterial) return;

  materials[selectedMaterialIndex] = updatedMaterial;

  isModelDeleteWarningOpen = false;
  modelIndexToDelete = null;
  activeMaterialTab = "modelos";

  rerenderMateriais();
});

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("open");
    }
  });
}

async function loadMaterialReferencesFromApi() {
  if (hasTriedReferenceLoad) return;

  hasTriedReferenceLoad = true;

  try {
    const [apiTypes, apiLocations, apiMachines] = await Promise.all([
      apiGet("/api/material-types"),
      apiGet("/api/locations"),
      apiGet("/api/machines")
    ]);

    lineStore.materialTypes.splice(0, lineStore.materialTypes.length, ...apiTypes.map(normalizeMaterialType));
    lineStore.locations.splice(0, lineStore.locations.length, ...apiLocations.map(normalizeLocation));
    lineStore.machines.splice(0, lineStore.machines.length, ...apiMachines.map(normalizeMachine));
    rerenderMateriais();
  } catch (error) {
    console.log("API indisponível, usando referências locais");
  }
}

async function loadMaterialsFromApi() {
  if (hasTriedApiLoad) return;

  hasTriedApiLoad = true;

  try {
    const apiMaterials = await apiGet("/api/materials");
    materials.splice(0, materials.length, ...apiMaterials.map(normalizeMaterial).filter(isActiveItem));
    rerenderMateriais();
  } catch (error) {
    console.log("API indisponível, usando materiais locais");
  }
}

async function createMaterial(payload) {
  try {
    const material = await apiPost("/api/materials", payload);
    return normalizeMaterial(material);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando materiais locais");
    return normalizeMaterial(payload);
  }
}

async function updateMaterial(material, payload) {
  if (!material.id) {
    alert("Este material ainda não possui ID da API. Recarregue os materiais da API antes de editar.");
    return null;
  }

  try {
    const updatedMaterial = await apiPut(`/api/materials/${material.id}`, payload);
    return normalizeMaterial(updatedMaterial);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando materiais locais");
    return normalizeMaterial({
      ...material,
      ...payload
    });
  }
}

async function deleteMaterial(material) {
  if (!material.id) {
    alert("Este material ainda não possui ID da API. Recarregue os materiais da API antes de inativar.");
    return null;
  }

  try {
    const deletedMaterial = await apiDelete(`/api/materials/${material.id}`);
    return normalizeMaterial(deletedMaterial);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando materiais locais");
    return normalizeMaterial({
      ...material,
      status: "Inativo"
    });
  }
}

function normalizeMaterial(material) {
  return {
    id: material.id,
    code: material.code || "",
    name: material.name || "",
    type: material.type || material.materialType || "",
    materialTypeId: material.materialTypeId || material.material_type_id || null,
    lotCode: material.lotCode || material.lot_code || "",
    unit: material.unit || material.primaryUnit || material.primary_unit || "un",
    primaryUnit: material.primaryUnit || material.primary_unit || material.unit || "un",
    secondaryUnit: material.secondaryUnit || material.secondary_unit || "",
    secondaryUnitMode: material.secondaryUnitMode || material.secondary_unit_mode || "manual",
    fixedPrimaryQuantity: formatDecimalValue(material.fixedPrimaryQuantity ?? material.fixed_primary_quantity),
    fixedSecondaryQuantity: formatDecimalValue(material.fixedSecondaryQuantity ?? material.fixed_secondary_quantity),
    allowedLocations: Array.isArray(material.allowedLocations) ? material.allowedLocations : [],
    canBePurchased: Boolean(material.canBePurchased ?? material.purchasable ?? material.can_be_purchased),
    canBeProduced: Boolean(material.canBeProduced ?? material.producible ?? material.can_be_produced),
    controlsMinStock: Boolean(material.controlsMinStock ?? material.controlsMinimumStock ?? material.controls_min_stock),
    minStock: formatDecimalValue(material.minStock ?? material.minimumStockQuantity ?? material.min_stock),
    traceable: material.traceable === undefined ? true : Boolean(material.traceable),
    notes: material.notes || "",
    status: material.status || "Ativo",
    productionMachines: Array.isArray(material.productionMachines) ? material.productionMachines : [],
    recommendedOperators: material.recommendedOperators || "",
    productionModels: Array.isArray(material.productionModels)
      ? material.productionModels.map(normalizeProductionModel)
      : [],
    createdAt: material.createdAt,
    updatedAt: material.updatedAt
  };
}

function normalizeProductionModel(model) {
  return {
    id: model.id,
    name: model.name || "",
    description: model.description || "",
    outputQuantity: formatDecimalValue(model.outputQuantity),
    outputUnit: model.outputUnit || "un",
    sourceLocation: model.sourceLocation || "Selecione um local",
    status: model.status || "Ativo",
    inputs: Array.isArray(model.inputs) ? model.inputs.map(normalizeProductionModelInput) : []
  };
}

function normalizeProductionModelInput(input) {
  return {
    id: input.id,
    inputMaterial: input.inputMaterial || "",
    inputCode: input.inputCode || "",
    consumptionMode: input.consumptionMode || "Fixo",
    inputQuantity: formatDecimalValue(input.inputQuantity ?? input.quantity),
    inputUnit: input.inputUnit || input.unit || "un",
    notes: input.notes || ""
  };
}

function normalizeMaterialType(type) {
  return {
    id: type.id,
    code: type.code || "",
    name: type.name || "",
    description: type.description || "",
    status: type.status || "Ativo"
  };
}

function normalizeLocation(location) {
  return {
    id: location.id,
    code: location.code || "",
    name: location.name || "",
    type: location.type || "",
    sale: Boolean(location.sale),
    production: Boolean(location.production),
    storage: Boolean(location.storage),
    status: location.status || "Ativo"
  };
}

function normalizeMachine(machine) {
  return {
    id: machine.id,
    code: machine.code || "",
    name: machine.name || "",
    lotCode: machine.lotCode || "",
    resourceType: machine.resourceType || "",
    defaultLocationId: machine.defaultLocationId || null,
    notes: machine.notes || "",
    status: machine.status || "Ativo"
  };
}

function formatDecimalValue(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).replace(".", ",");
}

function shouldUseLocalFallback(error) {
  return !error.status;
}

function isActiveItem(item) {
  return item.status !== "Inativo";
}

function closeEditModal() {
  selectedMaterialIndex = null;
isEditingMaterial = false;
isDeleteWarningOpen = false;
activeMaterialTab = "geral";
modelDraftInputs = [];
isProductionModelModalOpen = false;
isModelDeleteWarningOpen = false;
modelIndexToDelete = null;
selectedProductionModelIndex = null;
resetProductionModelDraft();
rerenderMateriais();
}

function rerenderMateriais() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${materiaisPage.title}</h1>
      <p>${materiaisPage.subtitle}</p>
    </div>

    ${materiaisPage.render()}
  `;

  setupMateriaisEvents();
}

function closeProductionModelModal() {
  isProductionModelModalOpen = false;
resetProductionModelDraft();
activeMaterialTab = "modelos";

rerenderMateriais();
}

function applyDecimalMask(input) {
  if (!input) return;

  input.addEventListener("input", () => {
    let value = input.value.replace(/\D/g, "");

    if (!value) {
      input.value = "";
      return;
    }

    value = (Number(value) / 1000).toFixed(3);

    input.value = value.replace(".", ",");
  });
}
