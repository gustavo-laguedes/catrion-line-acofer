import { lineStore } from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";

const materialTypes = lineStore.materialTypes;

let selectedTypeIndex = null;
let isEditingType = false;
let isDeleteWarningOpen = false;
let hasTriedApiLoad = false;

export const tiposMaterialPage = {
  title: "🏷️ Tipos de material",
  subtitle: "Cadastre classificações livres para organizar os materiais da empresa",
  render: renderTiposMaterial,
  afterRender: setupTiposMaterialEvents
};

function renderTiposMaterial() {
  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>

      <div class="module-toolbar-actions">
        <button class="primary-btn" id="openTypeModalBtn">Novo tipo</button>
      </div>
    </div>

    <div class="card">
      <div class="table-header">
        <div>
          <h2>Tipos cadastrados</h2>
          <p>Esses tipos serão usados para classificar e filtrar os materiais do sistema.</p>
        </div>
      </div>

      ${materialTypes.length ? renderTypesTable() : renderEmptyTypes()}
    </div>

    ${renderTypeModal()}

    ${
      selectedTypeIndex !== null
        ? renderEditTypeModal(materialTypes[selectedTypeIndex])
        : ""
    }

    ${
      isDeleteWarningOpen && selectedTypeIndex !== null
        ? renderDeleteWarningModal(materialTypes[selectedTypeIndex])
        : ""
    }
  `;
}

function renderTypesTable() {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Descrição</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${materialTypes.map(renderTypeRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyTypes() {
  return `
    <div class="empty-state">
      <div class="empty-icon">🏷️</div>
      <h3>Nenhum tipo de material cadastrado</h3>
      <p>Comece criando classificações livres para organizar os materiais conforme a realidade desta empresa.</p>
      <button class="primary-btn" id="openTypeModalEmptyBtn">Cadastrar primeiro tipo</button>
    </div>
  `;
}

function renderTypeRow(type) {
  const statusClass = type.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-type-index="${materialTypes.indexOf(type)}">
      <td><strong>${type.code}</strong></td>
      <td>${type.name}</td>
      <td>${type.description || "-"}</td>
      <td><span class="badge ${statusClass}">${type.status}</span></td>
    </tr>
  `;
}

function renderTypeModal() {
  return `
    <div class="modal-backdrop" id="typeModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>Novo tipo de material</h2>
            <p>Cadastre uma classificação livre para os materiais.</p>
          </div>

          <button class="modal-close" id="closeTypeModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome do tipo
            <input id="typeNameInput" type="text" placeholder="Ex: Matéria-prima, Produto final, Semiacabado" />
          </label>

          <label>
            Código
            <input id="typeCodeInput" type="text" placeholder="Ex: MP, PROD-FINAL, SEMI" />
          </label>
        </div>

        <div class="form-grid single">
          <label>
            Descrição
            <input id="typeDescriptionInput" type="text" placeholder="Descrição opcional para identificação interna" />
          </label>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelTypeModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveTypeBtn">Salvar tipo</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditTypeModal(type) {
  const disabled = isEditingType ? "" : "disabled";
  const readonlyClass = isEditingType ? "" : "readonly-mode";

  return `
    <div class="modal-backdrop open" id="editTypeModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingType ? "Editar tipo de material" : "Visualizar tipo de material"}</h2>
            <p>${isEditingType ? "Altere os dados deste tipo." : "Confira os dados cadastrados para este tipo."}</p>
          </div>

          <button class="modal-close" id="closeEditTypeModalBtn">×</button>
        </div>

        <div class="form-grid ${readonlyClass}">
          <label>
            Nome do tipo
            <input id="editTypeNameInput" type="text" value="${type.name}" ${disabled} />
          </label>

          <label>
            Código
            <input id="editTypeCodeInput" type="text" value="${type.code}" ${disabled} />
          </label>

          <label>
            Status
            <select id="editTypeStatusInput" ${disabled}>
              <option ${type.status === "Ativo" ? "selected" : ""}>Ativo</option>
              <option ${type.status === "Inativo" ? "selected" : ""}>Inativo</option>
            </select>
          </label>
        </div>

        <div class="form-grid single ${readonlyClass}">
          <label>
            Descrição
            <input id="editTypeDescriptionInput" type="text" value="${type.description || ""}" ${disabled} />
          </label>
        </div>

        <div class="modal-footer between">
          ${
            isEditingType
              ? `<button class="danger-btn" id="openDeleteTypeWarningBtn">Excluir tipo</button>`
              : `<button class="secondary-btn" id="enableEditTypeBtn">Editar</button>`
          }

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditTypeBtn">
              ${isEditingType ? "Cancelar" : "Fechar"}
            </button>

            ${
              isEditingType
                ? `<button class="primary-btn" id="saveEditTypeBtn">Salvar alterações</button>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDeleteWarningModal(type) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteTypeWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de tipo</h2>
            <p>
              Você está prestes a excluir o tipo <strong>${type.name}</strong>.
              Essa ação pode afetar materiais, filtros, relatórios e cadastros vinculados.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, essa ação só deve ser permitida se o tipo não tiver materiais vinculados.
            Caso contrário, o recomendado será inativar o tipo.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteTypeAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteTypeWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteTypeBtn" disabled>Confirmar exclusão</button>
        </div>
      </div>
    </div>
  `;
}

function setupTiposMaterialEvents() {
  loadMaterialTypesFromApi();

  const modal = document.getElementById("typeModal");
  const openBtn = document.getElementById("openTypeModalBtn");
  const openEmptyBtn = document.getElementById("openTypeModalEmptyBtn");
  const closeBtn = document.getElementById("closeTypeModalBtn");
  const cancelBtn = document.getElementById("cancelTypeModalBtn");
  const saveBtn = document.getElementById("saveTypeBtn");
  const rows = document.querySelectorAll(".clickable-row");

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
    const name = document.getElementById("typeNameInput").value.trim();
    const code = document.getElementById("typeCodeInput").value.trim().toUpperCase();
    const description = document.getElementById("typeDescriptionInput").value.trim();

    if (!name || !code) {
      alert("Preencha pelo menos o nome e o código do tipo.");
      return;
    }

    const payload = {
      code,
      name,
      description,
      status: "Ativo"
    };

    const savedType = await createMaterialType(payload);

    if (!savedType) return;

    materialTypes.push(savedType);

    modal.classList.remove("open");
    rerenderTiposMaterial();
  });

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedTypeIndex = Number(row.dataset.typeIndex);
      isEditingType = false;
      isDeleteWarningOpen = false;
      rerenderTiposMaterial();
    });
  });

  const closeEditBtn = document.getElementById("closeEditTypeModalBtn");
  const cancelEditBtn = document.getElementById("cancelEditTypeBtn");
  const enableEditBtn = document.getElementById("enableEditTypeBtn");
  const saveEditBtn = document.getElementById("saveEditTypeBtn");
  const openDeleteWarningBtn = document.getElementById("openDeleteTypeWarningBtn");

  closeEditBtn?.addEventListener("click", closeEditModal);
  cancelEditBtn?.addEventListener("click", closeEditModal);

  enableEditBtn?.addEventListener("click", () => {
    isEditingType = true;
    rerenderTiposMaterial();
  });

  saveEditBtn?.addEventListener("click", async () => {
    const type = materialTypes[selectedTypeIndex];
    const payload = {
      code: document.getElementById("editTypeCodeInput").value.trim().toUpperCase(),
      name: document.getElementById("editTypeNameInput").value.trim(),
      description: document.getElementById("editTypeDescriptionInput").value.trim(),
      status: document.getElementById("editTypeStatusInput").value
    };

    const updatedType = await updateMaterialType(type, payload);

    if (!updatedType) return;

    materialTypes[selectedTypeIndex] = updatedType;

    isEditingType = false;
    rerenderTiposMaterial();
  });

  openDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = true;
    rerenderTiposMaterial();
  });

  const cancelDeleteWarningBtn = document.getElementById("cancelDeleteTypeWarningBtn");
  const deleteAwareInput = document.getElementById("deleteTypeAwareInput");
  const confirmDeleteBtn = document.getElementById("confirmDeleteTypeBtn");

  cancelDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = false;
    rerenderTiposMaterial();
  });

  deleteAwareInput?.addEventListener("change", () => {
    confirmDeleteBtn.disabled = !deleteAwareInput.checked;
  });

  confirmDeleteBtn?.addEventListener("click", async () => {
    const type = materialTypes[selectedTypeIndex];
    const deletedType = await deleteMaterialType(type);

    if (!deletedType) return;

    materialTypes.splice(selectedTypeIndex, 1);

    selectedTypeIndex = null;
    isEditingType = false;
    isDeleteWarningOpen = false;

    rerenderTiposMaterial();
  });

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("open");
    }
  });
}

async function loadMaterialTypesFromApi() {
  if (hasTriedApiLoad) return;

  try {
    const types = await apiGet("/api/material-types");
    materialTypes.splice(0, materialTypes.length, ...types.map(normalizeMaterialType).filter(isActiveItem));
    hasTriedApiLoad = true;
    console.log("Tipos de material carregados da API");
    rerenderTiposMaterial();
  } catch (error) {
    console.error("Falha ao carregar tipos de material da API:", error);
  }
}

async function createMaterialType(payload) {
  try {
    const type = await apiPost("/api/material-types", payload);
    return normalizeMaterialType(type);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando dados locais");
    return normalizeMaterialType(payload);
  }
}

async function updateMaterialType(type, payload) {
  if (!type.id) {
    alert("Este tipo de material ainda não possui ID da API. Recarregue os tipos da API antes de editar.");
    return null;
  }

  try {
    const updatedType = await apiPut(`/api/material-types/${type.id}`, payload);
    return normalizeMaterialType(updatedType);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando dados locais");
    return normalizeMaterialType({
      ...type,
      ...payload
    });
  }
}

async function deleteMaterialType(type) {
  if (!type.id) {
    alert("Este tipo de material ainda não possui ID da API. Recarregue os tipos da API antes de inativar.");
    return null;
  }

  try {
    const deletedType = await apiDelete(`/api/material-types/${type.id}`);
    return normalizeMaterialType(deletedType);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando dados locais");
    return normalizeMaterialType({
      ...type,
      status: "Inativo"
    });
  }
}

function normalizeMaterialType(type) {
  return {
    id: type.id,
    code: type.code || "",
    name: type.name || "",
    description: type.description || "",
    status: type.status || "Ativo",
    createdAt: type.createdAt,
    updatedAt: type.updatedAt
  };
}

function shouldUseLocalFallback(error) {
  return !error.status;
}

function isActiveItem(item) {
  return item.status !== "Inativo";
}

function closeEditModal() {
  selectedTypeIndex = null;
  isEditingType = false;
  isDeleteWarningOpen = false;

  rerenderTiposMaterial();
}

function rerenderTiposMaterial() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${tiposMaterialPage.title}</h1>
      <p>${tiposMaterialPage.subtitle}</p>
    </div>

    ${tiposMaterialPage.render()}
  `;

  setupTiposMaterialEvents();
}
