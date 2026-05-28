import { lineStore } from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";

const vehicles = lineStore.vehicles;

let selectedVehicleId = null;
let isEditingVehicle = false;
let isDeleteWarningOpen = false;
let hasTriedVehiclesLoad = false;
let vehiclesNotice = null;

export const veiculosPage = {
  title: "Veículos",
  subtitle: "Cadastre caminhões e veículos usados na expedição",
  render: renderVeiculos,
  afterRender: setupVeiculosEvents
};

function renderVeiculos() {
  const selectedVehicle = getSelectedVehicle();

  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>

      <div class="module-toolbar-actions">
        <button class="primary-btn" id="openVehicleModalBtn" type="button">Novo veículo</button>
      </div>
    </div>

    ${vehiclesNotice ? renderNotice() : ""}

    <div class="card">
      <div class="table-header">
        <div>
          <h2>Veículos cadastrados</h2>
          <p>Caminhões, carretas e veículos usados nos carregamentos da expedição.</p>
        </div>
      </div>

      ${vehicles.length ? renderVehiclesTable(vehicles) : renderEmptyVehicles()}
    </div>

    ${renderVehicleModal()}
    ${selectedVehicle ? renderEditVehicleModal(selectedVehicle) : ""}
    ${isDeleteWarningOpen && selectedVehicle ? renderDeleteWarningModal(selectedVehicle) : ""}
  `;
}

function renderNotice() {
  return `
    <div class="movement-system-notice danger">
      <div>
        <strong>${escapeHtml(vehiclesNotice.title)}</strong>
        <p>${escapeHtml(vehiclesNotice.message)}</p>
      </div>
      <button class="secondary-btn" id="closeVehiclesNoticeBtn" type="button">Fechar</button>
    </div>
  `;
}

function renderVehiclesTable(filteredVehicles) {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nome / descrição</th>
            <th>Placa</th>
            <th>Tipo</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${filteredVehicles.map(renderVehicleRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderVehicleRow(vehicle) {
  const statusClass = vehicle.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-vehicle-id="${escapeAttr(vehicle.id)}">
      <td><strong>${escapeHtml(vehicle.name || "-")}</strong></td>
      <td>${escapeHtml(vehicle.plate || "-")}</td>
      <td>${escapeHtml(vehicle.type || "-")}</td>
      <td><span class="badge ${statusClass}">${escapeHtml(vehicle.status || "Ativo")}</span></td>
    </tr>
  `;
}

function renderEmptyVehicles() {
  return `
    <div class="empty-state">
      <div class="empty-icon">&#128666;</div>
      <h3>Nenhum veículo encontrado</h3>
      <p>Cadastre os veículos que poderão ser selecionados nos carregamentos da expedição.</p>
      <button class="primary-btn" id="openVehicleModalEmptyBtn" type="button">Cadastrar primeiro veículo</button>
    </div>
  `;
}

function renderVehicleModal() {
  return `
    <div class="modal-backdrop" id="vehicleModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>Novo veículo</h2>
            <p>Cadastre o veículo usado na expedição.</p>
          </div>
          <button class="modal-close" id="closeVehicleModalBtn" type="button">×</button>
        </div>

        ${renderVehicleFormFields()}

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelVehicleModalBtn" type="button">Cancelar</button>
          <button class="primary-btn" id="saveVehicleBtn" type="button">Salvar veículo</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditVehicleModal(vehicle) {
  const disabled = isEditingVehicle ? "" : "disabled";
  const readonlyClass = isEditingVehicle ? "" : "readonly-mode";

  return `
    <div class="modal-backdrop open" id="editVehicleModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingVehicle ? "Editar veículo" : "Visualizar veículo"}</h2>
            <p>${isEditingVehicle ? "Altere os dados do veículo." : "Confira os dados cadastrados para este veículo."}</p>
          </div>
          <button class="modal-close" id="closeEditVehicleModalBtn" type="button">×</button>
        </div>

        ${renderVehicleFormFields(vehicle, "edit", disabled, readonlyClass)}

        <div class="modal-footer between">
          ${isEditingVehicle ? `<button class="danger-btn" id="openDeleteVehicleWarningBtn" type="button">Inativar veículo</button>` : `<button class="secondary-btn" id="enableEditVehicleBtn" type="button">Editar</button>`}

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditVehicleBtn" type="button">${isEditingVehicle ? "Cancelar" : "Fechar"}</button>
            ${isEditingVehicle ? `<button class="primary-btn" id="saveEditVehicleBtn" type="button">Salvar alterações</button>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderVehicleFormFields(vehicle = {}, prefix = "", disabled = "", readonlyClass = "") {
  const id = (name) => `${prefix}${name}`;

  return `
    <div class="form-grid ${readonlyClass}">
      <label>
        Nome / descrição
        <input id="${id("VehicleNameInput")}" type="text" value="${escapeAttr(vehicle.name || "")}" placeholder="Ex: Caminhão 01" ${disabled} />
      </label>

      <label>
        Placa
        <input id="${id("VehiclePlateInput")}" type="text" value="${escapeAttr(vehicle.plate || "")}" placeholder="Ex: ABC1D23" ${disabled} />
      </label>

      <label>
        Tipo
        <select id="${id("VehicleTypeInput")}" ${disabled}>
          ${["Caminhão", "Carreta", "Truck", "Utilitário", "Outro"].map((type) => `
            <option value="${type}" ${type === (vehicle.type || "Caminhão") ? "selected" : ""}>${type}</option>
          `).join("")}
        </select>
      </label>

      <label>
        Status
        <select id="${id("VehicleStatusInput")}" ${disabled}>
          <option ${vehicle.status !== "Inativo" ? "selected" : ""}>Ativo</option>
          <option ${vehicle.status === "Inativo" ? "selected" : ""}>Inativo</option>
        </select>
      </label>
    </div>
  `;
}

function renderDeleteWarningModal(vehicle) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteVehicleWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">!</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar inativação de veículo</h2>
            <p>Você está prestes a inativar o veículo <strong>${escapeHtml(vehicle.name)}</strong>.</p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>Veículos com histórico de carregamentos serão preservados como referência nos registros já processados.</span>
        </div>

        <label class="aware-check">
          <input id="deleteVehicleAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteVehicleWarningBtn" type="button">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteVehicleBtn" type="button" disabled>Confirmar inativação</button>
        </div>
      </div>
    </div>
  `;
}

function setupVeiculosEvents() {
  const loadPromise = loadVehiclesFromApi();

  const modal = document.getElementById("vehicleModal");
  document.getElementById("openVehicleModalBtn")?.addEventListener("click", () => modal?.classList.add("open"));
  document.getElementById("openVehicleModalEmptyBtn")?.addEventListener("click", () => modal?.classList.add("open"));
  document.getElementById("closeVehicleModalBtn")?.addEventListener("click", () => modal?.classList.remove("open"));
  document.getElementById("cancelVehicleModalBtn")?.addEventListener("click", () => modal?.classList.remove("open"));
  document.getElementById("closeVehiclesNoticeBtn")?.addEventListener("click", () => {
    vehiclesNotice = null;
    rerenderVeiculos();
  });

  document.getElementById("saveVehicleBtn")?.addEventListener("click", async () => {
    const payload = captureVehicleForm("");
    if (!payload) return;

    try {
      await apiPost("/api/expedition-vehicles", payload);
      await loadVehiclesFromApi(true);
      modal?.classList.remove("open");
      rerenderVeiculos();
    } catch (error) {
      showVehiclesNotice("Veículo não salvo", getApiErrorMessage(error));
    }
  });

  document.querySelectorAll("[data-vehicle-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedVehicleId = row.dataset.vehicleId;
      isEditingVehicle = false;
      isDeleteWarningOpen = false;
      rerenderVeiculos();
    });
  });

  document.getElementById("closeEditVehicleModalBtn")?.addEventListener("click", closeEditModal);
  document.getElementById("cancelEditVehicleBtn")?.addEventListener("click", closeEditModal);
  document.getElementById("enableEditVehicleBtn")?.addEventListener("click", () => {
    isEditingVehicle = true;
    rerenderVeiculos();
  });

  document.getElementById("saveEditVehicleBtn")?.addEventListener("click", async () => {
    const payload = captureVehicleForm("edit");
    if (!payload || !selectedVehicleId) return;

    try {
      await apiPut(`/api/expedition-vehicles/${selectedVehicleId}`, payload);
      await loadVehiclesFromApi(true);
      isEditingVehicle = false;
      rerenderVeiculos();
    } catch (error) {
      showVehiclesNotice("Alterações não salvas", getApiErrorMessage(error));
    }
  });

  document.getElementById("openDeleteVehicleWarningBtn")?.addEventListener("click", () => {
    isDeleteWarningOpen = true;
    rerenderVeiculos();
  });

  const awareInput = document.getElementById("deleteVehicleAwareInput");
  const confirmDeleteBtn = document.getElementById("confirmDeleteVehicleBtn");
  awareInput?.addEventListener("change", () => {
    confirmDeleteBtn.disabled = !awareInput.checked;
  });

  document.getElementById("cancelDeleteVehicleWarningBtn")?.addEventListener("click", () => {
    isDeleteWarningOpen = false;
    rerenderVeiculos();
  });

  confirmDeleteBtn?.addEventListener("click", async () => {
    if (!selectedVehicleId) return;

    try {
      await apiDelete(`/api/expedition-vehicles/${selectedVehicleId}`);
      await loadVehiclesFromApi(true);
      selectedVehicleId = null;
      isEditingVehicle = false;
      isDeleteWarningOpen = false;
      rerenderVeiculos();
    } catch (error) {
      showVehiclesNotice("Veículo não inativado", getApiErrorMessage(error));
    }
  });

  return loadPromise;
}

async function loadVehiclesFromApi(force = false) {
  if (hasTriedVehiclesLoad && !force) return;
  hasTriedVehiclesLoad = true;

  try {
    const apiVehicles = await apiGet("/api/expedition-vehicles?includeInactive=true");
    vehicles.splice(0, vehicles.length, ...apiVehicles.map(normalizeVehicle));
    if (!getSelectedVehicle()) {
      selectedVehicleId = null;
      isEditingVehicle = false;
      isDeleteWarningOpen = false;
    }
    if (!force) rerenderVeiculos();
  } catch (error) {
    showVehiclesNotice("Não foi possível carregar veículos", getApiErrorMessage(error));
  }
}

function captureVehicleForm(prefix) {
  const name = document.getElementById(`${prefix}VehicleNameInput`)?.value.trim();
  const plate = document.getElementById(`${prefix}VehiclePlateInput`)?.value.trim().toUpperCase();
  const type = document.getElementById(`${prefix}VehicleTypeInput`)?.value;
  const status = document.getElementById(`${prefix}VehicleStatusInput`)?.value || "Ativo";

  if (!name || !plate || !type) {
    alert("Preencha nome, placa e tipo do veículo.");
    return null;
  }

  return {
    name,
    plate,
    type,
    status
  };
}

function getSelectedVehicle() {
  return vehicles.find((vehicle) => vehicle.id === selectedVehicleId) || null;
}

function normalizeVehicle(vehicle) {
  return {
    ...vehicle,
    id: vehicle.id || "",
    name: vehicle.name || "",
    plate: vehicle.plate || "",
    type: vehicle.type || "",
    status: vehicle.status || "Ativo"
  };
}

function showVehiclesNotice(title, message) {
  vehiclesNotice = { title, message };
  rerenderVeiculos();
}

function getApiErrorMessage(error) {
  const message = error?.data?.error || error?.message || "";
  return message && !/^Erro HTTP/i.test(message) ? message : "Não foi possível concluir a operação.";
}

function closeEditModal() {
  selectedVehicleId = null;
  isEditingVehicle = false;
  isDeleteWarningOpen = false;
  rerenderVeiculos();
}

function rerenderVeiculos() {
  document.getElementById("appContent").innerHTML = `
    <div class="page-header">
      <h1>${veiculosPage.title}</h1>
      <p>${veiculosPage.subtitle}</p>
    </div>
    ${renderVeiculos()}
  `;
  setupVeiculosEvents();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
