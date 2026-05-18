import { lineStore, getLocationOptions } from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";

const machines = lineStore.machines;

let selectedMachineIndex = null;
let isEditingMachine = false;
let isDeleteWarningOpen = false;
let hasTriedApiLoad = false;

export const maquinasPage = {
  title: "⚙️ Máquinas",
  subtitle: "Cadastre máquinas, linhas, equipamentos ou recursos produtivos da empresa",
  render: renderMaquinas,
  afterRender: setupMaquinasEvents
};

function renderMaquinas() {
  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>

      <div class="module-toolbar-actions">
        <button class="primary-btn" id="openMachineModalBtn">Nova máquina</button>
      </div>
    </div>

    <div class="card">
      <div class="table-header">
        <div>
          <h2>Máquinas cadastradas</h2>
          <p>Esses recursos serão usados nos materiais, modelos de produção e apontamentos.</p>
        </div>
      </div>

      ${machines.length ? renderMachinesTable() : renderEmptyMachines()}
    </div>

    ${renderMachineModal()}

    ${
      selectedMachineIndex !== null
        ? renderEditMachineModal(machines[selectedMachineIndex])
        : ""
    }

    ${
      isDeleteWarningOpen && selectedMachineIndex !== null
        ? renderDeleteWarningModal(machines[selectedMachineIndex])
        : ""
    }
  `;
}

function renderMachinesTable() {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Tipo / recurso</th>
            <th>Cód. lote</th>
            <th>Local padrão</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${machines.map(renderMachineRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyMachines() {
  return `
    <div class="empty-state">
      <div class="empty-icon">⚙️</div>
      <h3>Nenhuma máquina cadastrada</h3>
      <p>Comece cadastrando máquinas, linhas, bancadas, equipamentos ou recursos produtivos usados pela empresa.</p>
      <button class="primary-btn" id="openMachineModalEmptyBtn">Cadastrar primeira máquina</button>
    </div>
  `;
}

function renderMachineRow(machine) {
  const statusClass = machine.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-machine-index="${machines.indexOf(machine)}">
      <td><strong>${machine.code}</strong></td>
      <td>${machine.name}</td>
      <td>${machine.resourceType || "-"}</td>
      <td>${machine.lotCode || "-"}</td>
      <td>${machine.defaultLocation}</td>
      <td><span class="badge ${statusClass}">${machine.status}</span></td>
    </tr>
  `;
}

function normalizeMachineLotCode(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function renderMachineModal() {
  return `
    <div class="modal-backdrop" id="machineModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>Nova máquina</h2>
            <p>Cadastre um recurso produtivo de forma livre.</p>
          </div>

          <button class="modal-close" id="closeMachineModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome da máquina
            <input id="machineNameInput" type="text" placeholder="Ex: Máquina 01, Linha A, Bancada de montagem" />
          </label>

          <label>
            Código
            <input id="machineCodeInput" type="text" placeholder="Ex: MAQ-001, LINHA-A" />
          </label>

          <label>
            Código para lote
            <input id="machineLotCodeInput" type="text" maxlength="5" placeholder="Ex: EC125, MT100, TRFLA" />
          </label>

          <label>
            Tipo / recurso
            <input id="machineResourceInput" type="text" placeholder="Ex: Corte, Dobra, Solda, Manual, Embalagem" />
          </label>

          <label>
            Local padrão
            <select id="machineLocationInput">
              ${renderSelectOptions(getLocationOptions())}
            </select>
          </label>
        </div>

        <div class="form-grid single">
          <label>
            Observação técnica
            <input id="machineNotesInput" type="text" placeholder="Informação opcional sobre uso, limite, setup ou característica da máquina" />
          </label>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelMachineModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveMachineBtn">Salvar máquina</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditMachineModal(machine) {
  const disabled = isEditingMachine ? "" : "disabled";
  const readonlyClass = isEditingMachine ? "" : "readonly-mode";

  return `
    <div class="modal-backdrop open" id="editMachineModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingMachine ? "Editar máquina" : "Visualizar máquina"}</h2>
            <p>${isEditingMachine ? "Altere os dados deste recurso produtivo." : "Confira os dados cadastrados para esta máquina."}</p>
          </div>

          <button class="modal-close" id="closeEditMachineModalBtn">×</button>
        </div>

        <div class="form-grid ${readonlyClass}">
          <label>
            Nome da máquina
            <input id="editMachineNameInput" type="text" value="${machine.name}" ${disabled} />
          </label>

          <label>
            Código
            <input id="editMachineCodeInput" type="text" value="${machine.code}" ${disabled} />
          </label>

          <label>
            Código para lote
            <input id="editMachineLotCodeInput" type="text" maxlength="5" value="${machine.lotCode || ""}" placeholder="Ex: EC125" ${disabled} />
          </label>

          <label>
            Tipo / recurso
            <input id="editMachineResourceInput" type="text" value="${machine.resourceType || ""}" ${disabled} />
          </label>

          <label>
            Local padrão
            <select id="editMachineLocationInput" ${disabled}>
              ${renderSelectOptions(getLocationOptions(), machine.defaultLocation)}
            </select>
          </label>

          <label>
            Status
            <select id="editMachineStatusInput" ${disabled}>
              <option ${machine.status === "Ativo" ? "selected" : ""}>Ativo</option>
              <option ${machine.status === "Inativo" ? "selected" : ""}>Inativo</option>
            </select>
          </label>
        </div>

        <div class="form-grid single ${readonlyClass}">
          <label>
            Observação técnica
            <input id="editMachineNotesInput" type="text" value="${machine.notes || ""}" ${disabled} />
          </label>
        </div>

        <div class="modal-footer between">
          ${
            isEditingMachine
              ? `<button class="danger-btn" id="openDeleteMachineWarningBtn">Excluir máquina</button>`
              : `<button class="secondary-btn" id="enableEditMachineBtn">Editar</button>`
          }

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditMachineBtn">
              ${isEditingMachine ? "Cancelar" : "Fechar"}
            </button>

            ${
              isEditingMachine
                ? `<button class="primary-btn" id="saveEditMachineBtn">Salvar alterações</button>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDeleteWarningModal(machine) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteMachineWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de máquina</h2>
            <p>
              Você está prestes a excluir a máquina <strong>${machine.name}</strong>.
              Essa ação pode afetar materiais, modelos de produção, apontamentos e relatórios vinculados.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, se esta máquina já tiver sido usada em produção, o recomendado será inativar em vez de excluir.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteMachineAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteMachineWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteMachineBtn" disabled>Confirmar exclusão</button>
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

function setupMaquinasEvents() {
  loadMachinesFromApi();

  const modal = document.getElementById("machineModal");
  const openBtn = document.getElementById("openMachineModalBtn");
  const openEmptyBtn = document.getElementById("openMachineModalEmptyBtn");
  const closeBtn = document.getElementById("closeMachineModalBtn");
  const cancelBtn = document.getElementById("cancelMachineModalBtn");
  const saveBtn = document.getElementById("saveMachineBtn");
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
    const name = document.getElementById("machineNameInput").value.trim();
    const code = document.getElementById("machineCodeInput").value.trim().toUpperCase();
    const lotCode = normalizeMachineLotCode(document.getElementById("machineLotCodeInput").value);
    const resourceType = document.getElementById("machineResourceInput").value.trim();
    const defaultLocation = document.getElementById("machineLocationInput").value;
    const notes = document.getElementById("machineNotesInput").value.trim();

    if (!name || !code) {
      alert("Preencha pelo menos o nome e o código da máquina.");
      return;
    }

    if (defaultLocation === "Selecione um local") {
      alert("Selecione o local padrão.");
      return;
    }

    if (lotCode && lotCode.length !== 5) {
      alert("O Código para lote da máquina precisa ter 5 caracteres.");
      return;
    }

    const payload = {
      code,
      name,
      lotCode,
      resourceType,
      defaultLocationId: getLocationIdByName(defaultLocation),
      notes,
      status: "Ativo"
    };

    const savedMachine = await createMachine(payload);

    if (!savedMachine) return;

    machines.push(savedMachine);

    modal.classList.remove("open");
    rerenderMaquinas();
  });

  rows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedMachineIndex = Number(row.dataset.machineIndex);
      isEditingMachine = false;
      isDeleteWarningOpen = false;
      rerenderMaquinas();
    });
  });

  const closeEditBtn = document.getElementById("closeEditMachineModalBtn");
  const cancelEditBtn = document.getElementById("cancelEditMachineBtn");
  const enableEditBtn = document.getElementById("enableEditMachineBtn");
  const saveEditBtn = document.getElementById("saveEditMachineBtn");
  const openDeleteWarningBtn = document.getElementById("openDeleteMachineWarningBtn");

  closeEditBtn?.addEventListener("click", closeEditModal);
  cancelEditBtn?.addEventListener("click", closeEditModal);

  enableEditBtn?.addEventListener("click", () => {
    isEditingMachine = true;
    rerenderMaquinas();
  });

  saveEditBtn?.addEventListener("click", async () => {
    const machine = machines[selectedMachineIndex];

    const lotCode = normalizeMachineLotCode(document.getElementById("editMachineLotCodeInput").value);
    const defaultLocation = document.getElementById("editMachineLocationInput").value;

    if (lotCode && lotCode.length !== 5) {
      alert("O Código para lote da máquina precisa ter 5 caracteres.");
      return;
    }

    const payload = {
      code: document.getElementById("editMachineCodeInput").value.trim().toUpperCase(),
      name: document.getElementById("editMachineNameInput").value.trim(),
      lotCode,
      resourceType: document.getElementById("editMachineResourceInput").value.trim(),
      defaultLocationId: getLocationIdByName(defaultLocation),
      notes: document.getElementById("editMachineNotesInput").value.trim(),
      status: document.getElementById("editMachineStatusInput").value
    };

    if (!payload.name || !payload.code) {
      alert("Preencha pelo menos o nome e o código da máquina.");
      return;
    }

    const updatedMachine = await updateMachine(machine, payload);

    if (!updatedMachine) return;

    machines[selectedMachineIndex] = updatedMachine;

    isEditingMachine = false;
    rerenderMaquinas();
  });

  openDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = true;
    rerenderMaquinas();
  });

  const cancelDeleteWarningBtn = document.getElementById("cancelDeleteMachineWarningBtn");
  const deleteAwareInput = document.getElementById("deleteMachineAwareInput");
  const confirmDeleteBtn = document.getElementById("confirmDeleteMachineBtn");

  cancelDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = false;
    rerenderMaquinas();
  });

  deleteAwareInput?.addEventListener("change", () => {
    confirmDeleteBtn.disabled = !deleteAwareInput.checked;
  });

  confirmDeleteBtn?.addEventListener("click", async () => {
    const machine = machines[selectedMachineIndex];
    const deletedMachine = await deleteMachine(machine);

    if (!deletedMachine) return;

    machines.splice(selectedMachineIndex, 1);

    selectedMachineIndex = null;
    isEditingMachine = false;
    isDeleteWarningOpen = false;

    rerenderMaquinas();
  });

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("open");
    }
  });
}

async function loadMachinesFromApi() {
  if (hasTriedApiLoad) return;

  hasTriedApiLoad = true;

  try {
    const apiMachines = await apiGet("/api/machines");
    machines.splice(0, machines.length, ...apiMachines.map(normalizeMachine).filter(isActiveItem));
    console.log("Máquinas carregadas da API");
    rerenderMaquinas();
  } catch (error) {
    console.log("API indisponível, usando máquinas locais");
  }
}

async function createMachine(payload) {
  try {
    const machine = await apiPost("/api/machines", payload);
    console.log("Máquina salva na API");
    return normalizeMachine(machine);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando máquinas locais");
    return normalizeMachine(payload);
  }
}

async function updateMachine(machine, payload) {
  if (!machine.id) {
    alert("Esta máquina ainda não possui ID da API. Recarregue as máquinas da API antes de editar.");
    return null;
  }

  try {
    const updatedMachine = await apiPut(`/api/machines/${machine.id}`, payload);
    console.log("Máquina atualizada na API");
    return normalizeMachine(updatedMachine);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando máquinas locais");
    return normalizeMachine({
      ...machine,
      ...payload
    });
  }
}

async function deleteMachine(machine) {
  if (!machine.id) {
    alert("Esta máquina ainda não possui ID da API. Recarregue as máquinas da API antes de inativar.");
    return null;
  }

  try {
    const deletedMachine = await apiDelete(`/api/machines/${machine.id}`);
    console.log("Máquina inativada na API");
    return normalizeMachine(deletedMachine);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando máquinas locais");
    return normalizeMachine({
      ...machine,
      status: "Inativo"
    });
  }
}

function normalizeMachine(machine) {
  return {
    id: machine.id,
    code: machine.code || "",
    name: machine.name || "",
    lotCode: machine.lotCode || machine.lot_code || "",
    resourceType: machine.resourceType || machine.resource_type || "",
    defaultLocationId: machine.defaultLocationId || machine.default_location_id || null,
    defaultLocation: machine.defaultLocation || getLocationNameById(machine.defaultLocationId || machine.default_location_id) || "",
    notes: machine.notes || "",
    status: machine.status || "Ativo",
    createdAt: machine.createdAt,
    updatedAt: machine.updatedAt
  };
}

function getLocationIdByName(name) {
  const location = (lineStore.locations || []).find((item) => item.name === name);
  return location?.id || null;
}

function getLocationNameById(id) {
  if (!id) return "";

  const location = (lineStore.locations || []).find((item) => String(item.id) === String(id));
  return location?.name || "";
}

function shouldUseLocalFallback(error) {
  return !error.status;
}

function isActiveItem(item) {
  return item.status !== "Inativo";
}

function closeEditModal() {
  selectedMachineIndex = null;
  isEditingMachine = false;
  isDeleteWarningOpen = false;

  rerenderMaquinas();
}

function rerenderMaquinas() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${maquinasPage.title}</h1>
      <p>${maquinasPage.subtitle}</p>
    </div>

    ${maquinasPage.render()}
  `;

  setupMaquinasEvents();
}
