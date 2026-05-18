import { lineStore } from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";

const operators = lineStore.operators;
const operatorRoles = lineStore.operatorRoles;
const locations = lineStore.locations;

let isRoleModalOpen = false;
let isRoleDeleteWarningOpen = false;
let roleIndexToDelete = null;

let selectedOperatorIndex = null;
let isEditingOperator = false;
let isDeleteWarningOpen = false;
let hasTriedApiLoad = false;
let hasTriedLocationsLoad = false;
let hasTriedRolesLoad = false;

let qrTargetInputId = null;
let qrStream = null;
let qrDetector = null;
let qrScanInterval = null;

export const operadoresPage = {
  title: "👷 Operadores",
  subtitle: "Cadastre operadores, identificadores e vínculos operacionais",
  render: renderOperadores,
  afterRender: setupOperadoresEvents
};

function renderOperadores() {
  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>
      <div class="module-toolbar-actions">
        <button class="primary-btn" id="openOperatorModalBtn">Novo operador</button>
      </div>
    </div>

    <div class="card">
      <div class="table-header">
        <div>
          <h2>Operadores cadastrados</h2>
          <p>Esses operadores serão usados em apontamentos, produção e rastreabilidade.</p>
        </div>
      </div>

      ${operators.length ? renderOperatorsTable() : renderEmptyOperators()}
    </div>

    ${renderOperatorModal()}

    ${
      selectedOperatorIndex !== null
        ? renderEditOperatorModal(operators[selectedOperatorIndex])
        : ""
    }

    ${
      isDeleteWarningOpen && selectedOperatorIndex !== null
        ? renderDeleteWarningModal(operators[selectedOperatorIndex])
        : ""
    }

    ${renderQrModal()}

       ${isRoleModalOpen ? renderRoleModal() : ""}

${
  isRoleDeleteWarningOpen && roleIndexToDelete !== null
    ? renderDeleteRoleWarningModal(operatorRoles[roleIndexToDelete])
    : ""
} 

  `;
}

function renderOperatorsTable() {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Função</th>
            <th>Local padrão</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${operators.map(renderOperatorRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyOperators() {
  return `
    <div class="empty-state">
      <div class="empty-icon">👷</div>
      <h3>Nenhum operador cadastrado</h3>
      <p>Comece cadastrando operadores que participarão dos lançamentos e apontamentos de produção.</p>
      <button class="primary-btn" id="openOperatorModalEmptyBtn">Cadastrar primeiro operador</button>
    </div>
  `;
}

function renderOperatorRow(operator) {
  const statusClass = operator.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-operator-index="${operators.indexOf(operator)}">
      <td><strong>${operator.code}</strong></td>
      <td>${operator.name}</td>
      <td>${operator.role || "-"}</td>
      <td>${operator.defaultLocation}</td>
      <td><span class="badge ${statusClass}">${operator.status}</span></td>
    </tr>
  `;
}

function renderCodeInput(inputId, value = "", disabled = "") {
  return `
    <div class="code-camera-field">
      <input id="${inputId}" type="text" value="${value}" placeholder="Digite ou leia o QR Code" ${disabled} />
      <button class="camera-btn" type="button" data-qr-target="${inputId}" ${disabled}>📷</button>
    </div>
  `;
}

function renderOperatorModal() {
  return `
    <div class="modal-backdrop" id="operatorModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>Novo operador</h2>
            <p>Cadastre o operador e seu código de identificação.</p>
          </div>

          <button class="modal-close" id="closeOperatorModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome do operador
            <input id="operatorNameInput" type="text" placeholder="Ex: João Silva" />
          </label>

          <label>
            Código / QR Code
            ${renderCodeInput("operatorCodeInput")}
          </label>

          <label>
  Função / cargo operacional
  ${renderRoleSelectField("operatorRoleInput")}
</label>

          <label>
            Local padrão
            <select id="operatorLocationInput">
              ${renderLocationOptions()}
            </select>
          </label>
        </div>

        <div class="form-grid single">
          <label>
            Observação
            <input id="operatorNotesInput" type="text" placeholder="Observação opcional" />
          </label>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelOperatorModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveOperatorBtn">Salvar operador</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditOperatorModal(operator) {
  const disabled = isEditingOperator ? "" : "disabled";
  const readonlyClass = isEditingOperator ? "" : "readonly-mode";

  return `
    <div class="modal-backdrop open" id="editOperatorModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingOperator ? "Editar operador" : "Visualizar operador"}</h2>
            <p>${isEditingOperator ? "Altere os dados deste operador." : "Confira os dados cadastrados para este operador."}</p>
          </div>

          <button class="modal-close" id="closeEditOperatorModalBtn">×</button>
        </div>

        <div class="form-grid ${readonlyClass}">
          <label>
            Nome do operador
            <input id="editOperatorNameInput" type="text" value="${operator.name}" ${disabled} />
          </label>

          <label>
            Código / QR Code
            ${renderCodeInput("editOperatorCodeInput", operator.code, disabled)}
          </label>

          <label>
  Função / cargo operacional
  ${renderRoleSelectField("editOperatorRoleInput", operator.role || "", disabled)}
</label>

          <label>
            Local padrão
            <select id="editOperatorLocationInput" ${disabled}>
              ${renderLocationOptions(operator.defaultLocationId)}
            </select>
          </label>

          <label>
            Status
            <select id="editOperatorStatusInput" ${disabled}>
              <option ${operator.status === "Ativo" ? "selected" : ""}>Ativo</option>
              <option ${operator.status === "Inativo" ? "selected" : ""}>Inativo</option>
            </select>
          </label>
        </div>

        <div class="form-grid single ${readonlyClass}">
          <label>
            Observação
            <input id="editOperatorNotesInput" type="text" value="${operator.notes || ""}" ${disabled} />
          </label>
        </div>

        <div class="modal-footer between">
          ${
            isEditingOperator
              ? `<button class="danger-btn" id="openDeleteOperatorWarningBtn">Excluir operador</button>`
              : `<button class="secondary-btn" id="enableEditOperatorBtn">Editar</button>`
          }

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditOperatorBtn">
              ${isEditingOperator ? "Cancelar" : "Fechar"}
            </button>

            ${
              isEditingOperator
                ? `<button class="primary-btn" id="saveEditOperatorBtn">Salvar alterações</button>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderRoleSelectField(inputId, selectedValue = "", disabled = "") {
  return `
    <div class="role-select-field">
      <select id="${inputId}" ${disabled}>
        ${renderRoleOptions(selectedValue)}
      </select>

      <button class="add-role-btn" type="button" id="openRoleModalBtn" ${disabled}>+</button>
    </div>
  `;
}

function renderRoleOptions(selectedValue = "") {
  const activeRoles = getActiveOperatorRoles();

  if (!activeRoles.length) {
    return `<option value="">Nenhuma função cadastrada</option>`;
  }

  return [
    `<option value="">Selecione uma função</option>`,
    ...activeRoles.map(role => `
      <option value="${role.name}" ${role.name === selectedValue ? "selected" : ""}>${role.name}</option>
    `)
  ].join("");
}

function renderRoleModal() {
  return `
    <div class="modal-backdrop open role-modal-backdrop" id="roleModal">
      <div class="modal role-modal">
        <div class="modal-header">
          <div>
            <h2>Funções operacionais</h2>
            <p>Cadastre funções/cargos para padronizar o cadastro dos operadores.</p>
          </div>

          <button class="modal-close" id="closeRoleModalBtn">×</button>
        </div>

        <div class="role-create-row">
  <label>
    Nova função
    <input id="newRoleInput" type="text" placeholder="Ex: Operador, Líder, Auxiliar" />
  </label>

  <button class="primary-btn" id="saveRoleBtn">Adicionar função</button>
</div>

        <div class="role-list">
          ${
            getActiveOperatorRoles().length
              ? getActiveOperatorRoles().map((role) => `
                <div class="role-item">
                  <strong>${role.name}</strong>
                  <button class="mini-danger-btn" data-delete-role-id="${role.id || ""}" data-delete-role-name="${role.name}">Excluir</button>
                </div>
              `).join("")
              : `<div class="structure-readonly-note">Nenhuma função cadastrada ainda.</div>`
          }
        </div>
      </div>
    </div>
  `;
}

function renderDeleteRoleWarningModal(role) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteRoleWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de função</h2>
            <p>
              Você está prestes a excluir a função <strong>${getRoleName(role)}</strong>.
              Essa ação pode afetar a padronização dos operadores cadastrados.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, se essa função já estiver vinculada a operadores, o recomendado será inativar ou bloquear a exclusão.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteRoleAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteRoleWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteRoleBtn" disabled>Confirmar exclusão</button>
        </div>
      </div>
    </div>
  `;
}

function renderQrModal() {
  return `
    <div class="modal-backdrop" id="qrOperatorModal">
      <div class="modal qr-operator-modal">
        <div class="modal-header">
          <div>
            <h2>Ler QR Code</h2>
            <p>Aponte a câmera para o QR Code do operador.</p>
          </div>

          <button class="modal-close" id="closeQrOperatorModalBtn">×</button>
        </div>

        <video id="qrOperatorVideo" class="qr-video" autoplay muted playsinline></video>

        <div class="qr-result">
          <strong>Resultado:</strong>
          <span id="qrOperatorResult">Aguardando leitura...</span>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelQrOperatorBtn">Cancelar</button>
        </div>
      </div>
    </div>
  `;
}

function renderDeleteWarningModal(operator) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteOperatorWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de operador</h2>
            <p>
              Você está prestes a excluir o operador <strong>${operator.name}</strong>.
              Essa ação pode afetar apontamentos, histórico de produção e rastreabilidade.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, se este operador já tiver apontamentos vinculados, o recomendado será inativar em vez de excluir.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteOperatorAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteOperatorWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteOperatorBtn" disabled>Confirmar exclusão</button>
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

function renderLocationOptions(selectedLocationId = "") {
  const activeLocations = locations.filter((location) => {
    return location.status !== "Inativo";
  });

  return [
    `<option value="">Selecione um local</option>`,
    ...activeLocations.map((location) => `
      <option value="${location.id || ""}" ${String(location.id || "") === String(selectedLocationId || "") ? "selected" : ""}>
        ${location.name}
      </option>
    `)
  ].join("");
}

function setupOperadoresEvents() {
  loadLocationsFromApi();
  loadOperatorRolesFromApi();
  loadOperatorsFromApi();

  const modal = document.getElementById("operatorModal");
  const openBtn = document.getElementById("openOperatorModalBtn");
  const openEmptyBtn = document.getElementById("openOperatorModalEmptyBtn");
  const closeBtn = document.getElementById("closeOperatorModalBtn");
  const cancelBtn = document.getElementById("cancelOperatorModalBtn");
  const saveBtn = document.getElementById("saveOperatorBtn");
  const rows = document.querySelectorAll(".clickable-row");

  const openRoleModalButtons = document.querySelectorAll("#openRoleModalBtn");
const closeRoleModalBtn = document.getElementById("closeRoleModalBtn");
const saveRoleBtn = document.getElementById("saveRoleBtn");
const deleteRoleButtons = document.querySelectorAll("[data-delete-role-id]");
const cancelDeleteRoleWarningBtn = document.getElementById("cancelDeleteRoleWarningBtn");
const deleteRoleAwareInput = document.getElementById("deleteRoleAwareInput");
const confirmDeleteRoleBtn = document.getElementById("confirmDeleteRoleBtn");

  openBtn?.addEventListener("click", () => modal.classList.add("open"));
  openEmptyBtn?.addEventListener("click", () => modal.classList.add("open"));
  closeBtn?.addEventListener("click", () => modal.classList.remove("open"));
  cancelBtn?.addEventListener("click", () => modal.classList.remove("open"));

  openRoleModalButtons.forEach((button) => {
  button.addEventListener("click", () => {
    isRoleModalOpen = true;
    rerenderOperadores();
  });
});

closeRoleModalBtn?.addEventListener("click", () => {
  isRoleModalOpen = false;
  rerenderOperadores();
});

saveRoleBtn?.addEventListener("click", async () => {
  const role = document.getElementById("newRoleInput").value.trim();

  if (!role) {
    alert("Informe o nome da função.");
    return;
  }

  if (getActiveOperatorRoles().some((item) => item.name.toLowerCase() === role.toLowerCase())) {
    alert("Essa função já está cadastrada.");
    return;
  }

  const savedRole = await createOperatorRole({ name: role, status: "Ativo" });

  if (!savedRole) return;

  operatorRoles.push(savedRole);
  isRoleModalOpen = true;
  rerenderOperadores();
});

deleteRoleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    roleIndexToDelete = operatorRoles.findIndex((role) => {
      return String(getRoleId(role) || "") === String(button.dataset.deleteRoleId || "")
        || getRoleName(role) === button.dataset.deleteRoleName;
    });

    if (roleIndexToDelete < 0) {
      alert("Função operacional não encontrada.");
      return;
    }

    isRoleDeleteWarningOpen = true;
    rerenderOperadores();
  });
});

cancelDeleteRoleWarningBtn?.addEventListener("click", () => {
  isRoleDeleteWarningOpen = false;
  roleIndexToDelete = null;
  rerenderOperadores();
});

deleteRoleAwareInput?.addEventListener("change", () => {
  confirmDeleteRoleBtn.disabled = !deleteRoleAwareInput.checked;
});

confirmDeleteRoleBtn?.addEventListener("click", async () => {
  const role = operatorRoles[roleIndexToDelete];
  const deletedRole = await deleteOperatorRole(role);

  if (!deletedRole) return;

  operatorRoles[roleIndexToDelete] = deletedRole;

  isRoleDeleteWarningOpen = false;
  roleIndexToDelete = null;
  isRoleModalOpen = true;

  rerenderOperadores();
});

  document.querySelectorAll("[data-qr-target]").forEach((button) => {
    button.addEventListener("click", () => {
      qrTargetInputId = button.dataset.qrTarget;
      openQrReader();
    });
  });

  saveBtn?.addEventListener("click", async () => {
    const name = document.getElementById("operatorNameInput").value.trim();
    const code = document.getElementById("operatorCodeInput").value.trim().toUpperCase();
    const role = document.getElementById("operatorRoleInput").value.trim();
    const defaultLocationId = document.getElementById("operatorLocationInput").value;
    const notes = document.getElementById("operatorNotesInput").value.trim();

    if (!name || !code) {
      alert("Preencha pelo menos o nome e o código do operador.");
      return;
    }

    if (!defaultLocationId) {
      alert("Selecione o local padrão.");
      return;
    }

    const payload = {
      code,
      name,
      role,
      defaultLocationId,
      notes,
      status: "Ativo"
    };

    const savedOperator = await createOperator(payload);

    if (!savedOperator) return;

    operators.push(savedOperator);

    modal.classList.remove("open");
    rerenderOperadores();
  });

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedOperatorIndex = Number(row.dataset.operatorIndex);
      isEditingOperator = false;
      isDeleteWarningOpen = false;
      rerenderOperadores();
    });
  });

  const closeEditBtn = document.getElementById("closeEditOperatorModalBtn");
  const cancelEditBtn = document.getElementById("cancelEditOperatorBtn");
  const enableEditBtn = document.getElementById("enableEditOperatorBtn");
  const saveEditBtn = document.getElementById("saveEditOperatorBtn");
  const openDeleteWarningBtn = document.getElementById("openDeleteOperatorWarningBtn");

  closeEditBtn?.addEventListener("click", closeEditModal);
  cancelEditBtn?.addEventListener("click", closeEditModal);

  enableEditBtn?.addEventListener("click", () => {
    isEditingOperator = true;
    rerenderOperadores();
  });

  saveEditBtn?.addEventListener("click", async () => {
    const operator = operators[selectedOperatorIndex];
    const payload = {
      code: document.getElementById("editOperatorCodeInput").value.trim().toUpperCase(),
      name: document.getElementById("editOperatorNameInput").value.trim(),
      role: document.getElementById("editOperatorRoleInput").value.trim(),
      defaultLocationId: document.getElementById("editOperatorLocationInput").value,
      notes: document.getElementById("editOperatorNotesInput").value.trim(),
      status: document.getElementById("editOperatorStatusInput").value
    };

    if (!payload.name || !payload.code) {
      alert("Preencha pelo menos o nome e o código do operador.");
      return;
    }

    if (!payload.defaultLocationId) {
      alert("Selecione o local padrão.");
      return;
    }

    const updatedOperator = await updateOperator(operator, payload);

    if (!updatedOperator) return;

    operators[selectedOperatorIndex] = updatedOperator;

    isEditingOperator = false;
    rerenderOperadores();
  });

  openDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = true;
    rerenderOperadores();
  });

  const cancelDeleteWarningBtn = document.getElementById("cancelDeleteOperatorWarningBtn");
  const deleteAwareInput = document.getElementById("deleteOperatorAwareInput");
  const confirmDeleteBtn = document.getElementById("confirmDeleteOperatorBtn");

  cancelDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = false;
    rerenderOperadores();
  });

  deleteAwareInput?.addEventListener("change", () => {
    confirmDeleteBtn.disabled = !deleteAwareInput.checked;
  });

  confirmDeleteBtn?.addEventListener("click", async () => {
    const operator = operators[selectedOperatorIndex];
    const deletedOperator = await deleteOperator(operator);

    if (!deletedOperator) return;

    operators.splice(selectedOperatorIndex, 1);

    selectedOperatorIndex = null;
    isEditingOperator = false;
    isDeleteWarningOpen = false;

    rerenderOperadores();
  });

  document.getElementById("closeQrOperatorModalBtn")?.addEventListener("click", closeQrReader);
  document.getElementById("cancelQrOperatorBtn")?.addEventListener("click", closeQrReader);

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.remove("open");
  });
}

async function loadOperatorsFromApi() {
  if (hasTriedApiLoad) return;

  hasTriedApiLoad = true;

  try {
    const apiOperators = await apiGet("/api/operators");
    operators.splice(0, operators.length, ...apiOperators.map(normalizeOperator).filter(isActiveItem));
    console.log("Operadores carregados da API");
    rerenderOperadores();
  } catch (error) {
    console.log("API indisponível, usando operadores locais");
  }
}

async function loadLocationsFromApi() {
  if (hasTriedLocationsLoad) return;

  hasTriedLocationsLoad = true;

  try {
    const apiLocations = await apiGet("/api/locations");
    locations.splice(0, locations.length, ...apiLocations.map(normalizeLocation).filter(isActiveItem));
    rerenderOperadores();
  } catch (error) {
    console.log("API indisponível, usando locais locais");
  }
}

async function loadOperatorRolesFromApi() {
  if (hasTriedRolesLoad) return;

  hasTriedRolesLoad = true;

  try {
    const apiRoles = await apiGet("/api/operator-roles");
    operatorRoles.splice(0, operatorRoles.length, ...apiRoles.map(normalizeOperatorRole).filter(isActiveItem));
    console.log("Funções operacionais carregadas da API");
    rerenderOperadores();
  } catch (error) {
    console.log("API indisponível, usando funções locais");
  }
}

async function createOperator(payload) {
  try {
    const operator = await apiPost("/api/operators", payload);
    console.log("Operador salvo na API");
    return normalizeOperator(operator);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando operadores locais");
    return normalizeOperator(payload);
  }
}

async function updateOperator(operator, payload) {
  if (!operator.id) {
    alert("Este operador ainda não possui ID da API. Recarregue os operadores da API antes de editar.");
    return null;
  }

  try {
    const updatedOperator = await apiPut(`/api/operators/${operator.id}`, payload);
    console.log("Operador atualizado na API");
    return normalizeOperator(updatedOperator);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando operadores locais");
    return normalizeOperator({
      ...operator,
      ...payload
    });
  }
}

async function deleteOperator(operator) {
  if (!operator.id) {
    alert("Este operador ainda não possui ID da API. Recarregue os operadores da API antes de inativar.");
    return null;
  }

  try {
    const deletedOperator = await apiDelete(`/api/operators/${operator.id}`);
    console.log("Operador inativado na API");
    return normalizeOperator(deletedOperator);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando operadores locais");
    return normalizeOperator({
      ...operator,
      status: "Inativo"
    });
  }
}

async function createOperatorRole(payload) {
  try {
    const role = await apiPost("/api/operator-roles", payload);
    console.log("Função operacional salva na API");
    return normalizeOperatorRole(role);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando funções locais");
    return normalizeOperatorRole(payload);
  }
}

async function deleteOperatorRole(role) {
  if (getRoleId(role)) {
    try {
      const deletedRole = await apiDelete(`/api/operator-roles/${getRoleId(role)}`);
      console.log("Função operacional inativada na API");
      return normalizeOperatorRole(deletedRole);
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        alert(error.message);
        return null;
      }

      console.log("API indisponível, usando funções locais");
      return normalizeOperatorRole({
        ...normalizeOperatorRole(role),
        status: "Inativo"
      });
    }
  }

  alert("Esta função ainda não possui ID da API. Recarregue as funções da API antes de inativar.");
  return null;
}

function normalizeOperator(operator) {
  const defaultLocationId = operator.defaultLocationId || operator.default_location_id || null;

  return {
    id: operator.id,
    code: operator.code || "",
    name: operator.name || "",
    role: operator.role || "",
    defaultLocationId,
    defaultLocation: operator.defaultLocation || getLocationNameById(defaultLocationId) || "",
    notes: operator.notes || "",
    status: operator.status || "Ativo",
    createdAt: operator.createdAt,
    updatedAt: operator.updatedAt
  };
}

function normalizeOperatorRole(role) {
  if (typeof role === "string") {
    return {
      id: null,
      name: role,
      status: "Ativo"
    };
  }

  return {
    id: role.id,
    name: role.name || "",
    status: role.status || "Ativo",
    createdAt: role.createdAt,
    updatedAt: role.updatedAt
  };
}

function getLocationNameById(id) {
  if (!id) return "";

  const location = (lineStore.locations || []).find((item) => String(item.id) === String(id));
  return location?.name || "";
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
    status: location.status || "Ativo",
    createdAt: location.createdAt,
    updatedAt: location.updatedAt
  };
}

function getActiveOperatorRoles() {
  return operatorRoles
    .map(normalizeOperatorRole)
    .filter((role) => role.status !== "Inativo");
}

function getRoleId(role) {
  return typeof role === "string" ? null : role?.id;
}

function getRoleName(role) {
  return typeof role === "string" ? role : role?.name || "";
}

function shouldUseLocalFallback(error) {
  return !error.status;
}

function isActiveItem(item) {
  return item.status !== "Inativo";
}

async function openQrReader() {
  const modal = document.getElementById("qrOperatorModal");
  const video = document.getElementById("qrOperatorVideo");
  const resultText = document.getElementById("qrOperatorResult");

  modal.classList.add("open");
  resultText.textContent = "Aguardando leitura...";

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    video.srcObject = qrStream;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    qrScanInterval = setInterval(() => {
      if (!video.videoWidth || !video.videoHeight) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code?.data) {
        const value = code.data;

        resultText.textContent = value;

        const targetInput = document.getElementById(qrTargetInputId);
        if (targetInput) targetInput.value = value;

        closeQrReader();
      }
    }, 300);
  } catch (error) {
    resultText.textContent = "Não foi possível abrir a câmera. Verifique a permissão do navegador ou teste em localhost/HTTPS.";
    console.error(error);
  }
}

function closeQrReader() {
  const modal = document.getElementById("qrOperatorModal");
  const video = document.getElementById("qrOperatorVideo");

  if (qrScanInterval) {
    clearInterval(qrScanInterval);
    qrScanInterval = null;
  }

  if (qrStream) {
    qrStream.getTracks().forEach(track => track.stop());
    qrStream = null;
  }

  if (video) video.srcObject = null;
  if (modal) modal.classList.remove("open");
}

function closeEditModal() {
  selectedOperatorIndex = null;
  isEditingOperator = false;
  isDeleteWarningOpen = false;
  closeQrReader();

  rerenderOperadores();
}

function rerenderOperadores() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${operadoresPage.title}</h1>
      <p>${operadoresPage.subtitle}</p>
    </div>

    ${operadoresPage.render()}
  `;

  setupOperadoresEvents();
}
