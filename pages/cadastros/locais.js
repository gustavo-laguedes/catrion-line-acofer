import { lineStore } from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";

const locations = lineStore.locations;

let selectedLocationIndex = null;
let isEditingLocation = false;
let isDeleteWarningOpen = false;
let hasTriedApiLoad = false;

export const locaisPage = {
  title: "📍 Locais / Centros",
  subtitle: "Cadastre livremente unidades, estoques, setores, áreas produtivas e locais de venda",
  render: renderLocais,
  afterRender: setupLocaisEvents
};

function renderLocais() {
  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>

      <div class="module-toolbar-actions">
        <button class="primary-btn" id="openLocationModalBtn">Novo local</button>
      </div>
    </div>

    <div class="card">
      <div class="table-header">
        <div>
          <h2>Locais cadastrados</h2>
          <p>Esses locais serão usados em estoque, produção, movimentações e rastreabilidade.</p>
        </div>
      </div>

      ${locations.length ? renderLocationsTable() : renderEmptyLocations()}
    </div>

    ${renderLocationModal()}

    ${
      selectedLocationIndex !== null
        ? renderEditLocationModal(locations[selectedLocationIndex])
        : ""
    }

    ${
      isDeleteWarningOpen && selectedLocationIndex !== null
        ? renderDeleteWarningModal(locations[selectedLocationIndex])
        : ""
    }
  `;
}

function renderLocationsTable() {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nome</th>
            <th>Tipo</th>
            <th>Venda</th>
            <th>Produção</th>
            <th>Estoque</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${locations.map(renderLocationRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyLocations() {
  return `
    <div class="empty-state">
      <div class="empty-icon">📍</div>
      <h3>Nenhum local cadastrado</h3>
      <p>Comece criando os locais que fazem sentido para esta empresa. Pode ser unidade, estoque, setor produtivo, loja, galpão ou qualquer outro centro interno.</p>
      <button class="primary-btn" id="openLocationModalEmptyBtn">Cadastrar primeiro local</button>
    </div>
  `;
}

function renderLocationRow(location) {
  const statusClass = location.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-location-index="${locations.indexOf(location)}">
      <td><strong>${location.code}</strong></td>
      <td>${location.name}</td>
      <td>${location.type}</td>
      <td>${location.sale ? "Sim" : "Não"}</td>
      <td>${location.production ? "Sim" : "Não"}</td>
      <td>${location.storage ? "Sim" : "Não"}</td>
      <td><span class="badge ${statusClass}">${location.status}</span></td>
    </tr>
  `;
}

function renderLocationModal() {
  return `
    <div class="modal-backdrop" id="locationModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>Novo local / centro</h2>
            <p>Cadastre um local livremente conforme a estrutura da empresa.</p>
          </div>

          <button class="modal-close" id="closeLocationModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome do local
            <input id="locationNameInput" type="text" placeholder="Ex: Unidade 01, Galpão, Estoque Central" />
          </label>

          <label>
            Código
            <input id="locationCodeInput" type="text" placeholder="Ex: UND-01, GALPAO, EST-CENTRAL" />
          </label>

          <label>
            Tipo
            <select id="locationTypeInput">
              <option>Unidade</option>
              <option>Setor</option>
            </select>
          </label>
        </div>

        <div class="checkbox-grid">
          <label><input id="locationSaleInput" type="checkbox" /> Local de venda</label>
          <label><input id="locationProductionInput" type="checkbox" /> Local de produção</label>
          <label><input id="locationStorageInput" type="checkbox" /> Local de estoque</label>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelLocationModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveLocationBtn">Salvar local</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditLocationModal(location) {
  const disabled = isEditingLocation ? "" : "disabled";
  const readonlyClass = isEditingLocation ? "" : "readonly-mode";

  return `
    <div class="modal-backdrop open" id="editLocationModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingLocation ? "Editar local" : "Visualizar local"}</h2>
            <p>${isEditingLocation ? "Altere os dados deste local." : "Confira os dados cadastrados para este local."}</p>
          </div>

          <button class="modal-close" id="closeEditLocationModalBtn">×</button>
        </div>

        <div class="form-grid ${readonlyClass}">
          <label>
            Nome do local
            <input id="editLocationNameInput" type="text" value="${location.name}" ${disabled} />
          </label>

          <label>
            Código
            <input id="editLocationCodeInput" type="text" value="${location.code}" ${disabled} />
          </label>

          <label>
            Tipo
            <select id="editLocationTypeInput" ${disabled}>
              ${renderEditTypeOptions(location.type)}
            </select>
          </label>

          <label>
            Status
            <select id="editLocationStatusInput" ${disabled}>
              <option ${location.status === "Ativo" ? "selected" : ""}>Ativo</option>
              <option ${location.status === "Inativo" ? "selected" : ""}>Inativo</option>
            </select>
          </label>
        </div>

        <div class="checkbox-grid ${readonlyClass}">
          <label>
            <input id="editLocationSaleInput" type="checkbox" ${location.sale ? "checked" : ""} ${disabled} />
            Local de venda
          </label>

          <label>
            <input id="editLocationProductionInput" type="checkbox" ${location.production ? "checked" : ""} ${disabled} />
            Local de produção
          </label>

          <label>
            <input id="editLocationStorageInput" type="checkbox" ${location.storage ? "checked" : ""} ${disabled} />
            Local de estoque
          </label>
        </div>

        <div class="modal-footer between">
          ${
            isEditingLocation
              ? `<button class="danger-btn" id="openDeleteWarningBtn">Excluir local</button>`
              : `<button class="secondary-btn" id="enableEditLocationBtn">Editar</button>`
          }

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditLocationBtn">
              ${isEditingLocation ? "Cancelar" : "Fechar"}
            </button>

            ${
              isEditingLocation
                ? `<button class="primary-btn" id="saveEditLocationBtn">Salvar alterações</button>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEditTypeOptions(selectedType) {
  const types = ["Unidade", "Setor"];

  return types.map(type => `
    <option ${type === selectedType ? "selected" : ""}>
      ${type}
    </option>
  `).join("");
}

function renderDeleteWarningModal(location) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de local</h2>
            <p>
              Você está prestes a excluir o local <strong>${location.name}</strong>.
              Essa ação pode afetar estoque, movimentações, produções, rastreabilidade e relatórios vinculados.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, essa ação só deve ser permitida se o local não tiver movimentações,
            lotes ou produções vinculadas. Caso contrário, o recomendado será inativar o local.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteLocationBtn" disabled>Confirmar exclusão</button>
        </div>
      </div>
    </div>
  `;
}

function setupLocaisEvents() {
  loadLocationsFromApi();

  const modal = document.getElementById("locationModal");
  const openBtn = document.getElementById("openLocationModalBtn");
  const openEmptyBtn = document.getElementById("openLocationModalEmptyBtn");
  const closeBtn = document.getElementById("closeLocationModalBtn");
  const cancelBtn = document.getElementById("cancelLocationModalBtn");
  const saveBtn = document.getElementById("saveLocationBtn");
  const locationRows = document.querySelectorAll(".clickable-row");

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
    const name = document.getElementById("locationNameInput").value.trim();
    const code = document.getElementById("locationCodeInput").value.trim().toUpperCase();
    const type = document.getElementById("locationTypeInput").value;
    const sale = document.getElementById("locationSaleInput").checked;
    const production = document.getElementById("locationProductionInput").checked;
    const storage = document.getElementById("locationStorageInput").checked;

    if (!name || !code || !type) {
      alert("Preencha pelo menos o nome, o código e o tipo do local.");
      return;
    }

    const payload = {
      code,
      name,
      type,
      sale,
      production,
      storage,
      status: "Ativo"
    };

    const savedLocation = await createLocation(payload);

    if (!savedLocation) return;

    locations.push(savedLocation);

    modal.classList.remove("open");
    rerenderLocais();
  });

  locationRows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedLocationIndex = Number(row.dataset.locationIndex);
      isEditingLocation = false;
      isDeleteWarningOpen = false;
      rerenderLocais();
    });
  });

  const closeEditBtn = document.getElementById("closeEditLocationModalBtn");
  const cancelEditBtn = document.getElementById("cancelEditLocationBtn");
  const enableEditBtn = document.getElementById("enableEditLocationBtn");
  const saveEditBtn = document.getElementById("saveEditLocationBtn");
  const openDeleteWarningBtn = document.getElementById("openDeleteWarningBtn");

  closeEditBtn?.addEventListener("click", closeEditModal);
  cancelEditBtn?.addEventListener("click", closeEditModal);

  enableEditBtn?.addEventListener("click", () => {
    isEditingLocation = true;
    rerenderLocais();
  });

  saveEditBtn?.addEventListener("click", async () => {
    const location = locations[selectedLocationIndex];
    const payload = {
      code: document.getElementById("editLocationCodeInput").value.trim().toUpperCase(),
      name: document.getElementById("editLocationNameInput").value.trim(),
      type: document.getElementById("editLocationTypeInput").value,
      sale: document.getElementById("editLocationSaleInput").checked,
      production: document.getElementById("editLocationProductionInput").checked,
      storage: document.getElementById("editLocationStorageInput").checked,
      status: document.getElementById("editLocationStatusInput").value
    };

    if (!payload.name || !payload.code || !payload.type) {
      alert("Preencha pelo menos o nome, o código e o tipo do local.");
      return;
    }

    const updatedLocation = await updateLocation(location, payload);

    if (!updatedLocation) return;

    locations[selectedLocationIndex] = updatedLocation;

    isEditingLocation = false;
    rerenderLocais();
  });

  openDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = true;
    rerenderLocais();
  });

  const cancelDeleteWarningBtn = document.getElementById("cancelDeleteWarningBtn");
  const deleteAwareInput = document.getElementById("deleteAwareInput");
  const confirmDeleteLocationBtn = document.getElementById("confirmDeleteLocationBtn");

  cancelDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteWarningOpen = false;
    rerenderLocais();
  });

  deleteAwareInput?.addEventListener("change", () => {
    confirmDeleteLocationBtn.disabled = !deleteAwareInput.checked;
  });

  confirmDeleteLocationBtn?.addEventListener("click", async () => {
    const location = locations[selectedLocationIndex];
    const deletedLocation = await deleteLocation(location);

    if (!deletedLocation) return;

    locations.splice(selectedLocationIndex, 1);

    selectedLocationIndex = null;
    isEditingLocation = false;
    isDeleteWarningOpen = false;

    rerenderLocais();
  });

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("open");
    }
  });
}

async function loadLocationsFromApi() {
  if (hasTriedApiLoad) return;

  try {
    const apiLocations = await apiGet("/api/locations");
    locations.splice(0, locations.length, ...apiLocations.map(normalizeLocation).filter(isActiveLocation));
    hasTriedApiLoad = true;
    console.log("Locais carregados da API");
    rerenderLocais();
  } catch (error) {
    console.error("Falha ao carregar locais da API:", error);
  }
}

async function createLocation(payload) {
  try {
    const location = await apiPost("/api/locations", payload);
    console.log("Local salvo na API");
    return normalizeLocation(location);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando locais locais");
    return normalizeLocation(payload);
  }
}

async function updateLocation(location, payload) {
  if (!location.id) {
    alert("Este local ainda não possui ID da API. Recarregue os locais da API antes de editar.");
    return null;
  }

  try {
    const updatedLocation = await apiPut(`/api/locations/${location.id}`, payload);
    console.log("Local atualizado na API");
    return normalizeLocation(updatedLocation);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando locais locais");
    return normalizeLocation({
      ...location,
      ...payload
    });
  }
}

async function deleteLocation(location) {
  if (!location.id) {
    alert("Este local ainda não possui ID da API. Recarregue os locais da API antes de excluir.");
    return null;
  }

  try {
    const deletedLocation = await apiDelete(`/api/locations/${location.id}`);
    console.log("Local excluído da API");
    return normalizeLocation(deletedLocation);
  } catch (error) {
    if (!shouldUseLocalFallback(error)) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando locais locais");
    return normalizeLocation(location);
  }
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

function isActiveLocation(location) {
  return location.status !== "Inativo";
}

function shouldUseLocalFallback(error) {
  return !error.status;
}

function closeEditModal() {
  selectedLocationIndex = null;
  isEditingLocation = false;
  isDeleteWarningOpen = false;

  rerenderLocais();
}

function rerenderLocais() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${locaisPage.title}</h1>
      <p>${locaisPage.subtitle}</p>
    </div>

    ${locaisPage.render()}
  `;

  setupLocaisEvents();
}
