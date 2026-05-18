import { lineStore } from "../../shared/data-store.js";
import { apiDelete, apiGet, apiPost, apiPut } from "../../shared/api-client.js";

const suppliers = lineStore.suppliers;

let selectedSupplierIndex = null;
let isEditingSupplier = false;
let isDeleteSupplierWarningOpen = false;
let hasTriedApiLoad = false;

export const fornecedoresPage = {
  title: "🏢 Fornecedores",
  subtitle: "Cadastro de fornecedores usados nas compras de materiais",
  render: renderFornecedores,
  afterRender: setupFornecedoresEvents
};

function renderFornecedores() {
  return `
    <div class="module-toolbar">
      <button class="secondary-btn" data-route="cadastros">← Voltar</button>

      <div class="module-toolbar-actions">
        <button class="primary-btn" id="openSupplierModalBtn">Novo fornecedor</button>
      </div>
    </div>

    <div class="card">
      <div class="table-header">
        <div>
          <h2>Fornecedores cadastrados</h2>
          <p>Esses fornecedores serão usados nas compras e rastreabilidade de entrada.</p>
        </div>
      </div>

      ${suppliers.length ? renderSuppliersTable() : renderEmptySuppliers()}
    </div>

    ${renderSupplierModal()}

    ${
      selectedSupplierIndex !== null
        ? renderEditSupplierModal(suppliers[selectedSupplierIndex])
        : ""
    }

    ${
      isDeleteSupplierWarningOpen && selectedSupplierIndex !== null
        ? renderDeleteSupplierWarningModal(suppliers[selectedSupplierIndex])
        : ""
    }
  `;
}

function renderSuppliersTable() {
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>CNPJ / Documento</th>
            <th>Contato</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>
          ${suppliers.map(renderSupplierRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptySuppliers() {
  return `
    <div class="empty-state">
      <div class="empty-icon">🏢</div>
      <h3>Nenhum fornecedor cadastrado</h3>
      <p>Cadastre fornecedores para utilizá-los nas compras, notas fiscais, rastreabilidade e relatórios de entrada.</p>
      <button class="primary-btn" id="openSupplierModalEmptyBtn">Cadastrar primeiro fornecedor</button>
    </div>
  `;
}

function renderSupplierRow(supplier) {
  const statusClass = supplier.status === "Ativo" ? "badge-success" : "badge-danger";

  return `
    <tr class="clickable-row" data-supplier-index="${suppliers.indexOf(supplier)}">
      <td><strong>${supplier.name}</strong></td>
      <td>${supplier.document || "-"}</td>
      <td>${supplier.contact || "-"}</td>
      <td><span class="badge ${statusClass}">${supplier.status}</span></td>
    </tr>
  `;
}

function renderSupplierModal() {
  return `
    <div class="modal-backdrop" id="supplierModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>Novo fornecedor</h2>
            <p>Cadastre um fornecedor usado nas compras de materiais.</p>
          </div>

          <button class="modal-close" id="closeSupplierModalBtn">×</button>
        </div>

        <div class="form-grid">
          <label>
            Nome do fornecedor
            <input id="supplierNameInput" type="text" placeholder="Ex: Gerdau, ArcelorMittal, Distribuidor..." />
          </label>

          <label>
            CNPJ / Documento
            <input id="supplierDocumentInput" type="text" placeholder="Opcional" />
          </label>

          <label class="full-field">
            Contato / Observação
            <input id="supplierContactInput" type="text" placeholder="Telefone, e-mail, responsável ou observação" />
          </label>
        </div>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelSupplierModalBtn">Cancelar</button>
          <button class="primary-btn" id="saveSupplierBtn">Salvar fornecedor</button>
        </div>
      </div>
    </div>
  `;
}

function renderEditSupplierModal(supplier) {
  const disabled = isEditingSupplier ? "" : "disabled";
  const readonlyClass = isEditingSupplier ? "" : "readonly-mode";

  return `
    <div class="modal-backdrop open" id="editSupplierModal">
      <div class="modal">
        <div class="modal-header">
          <div>
            <h2>${isEditingSupplier ? "Editar fornecedor" : "Visualizar fornecedor"}</h2>
            <p>${isEditingSupplier ? "Altere os dados deste fornecedor." : "Confira os dados cadastrados para este fornecedor."}</p>
          </div>

          <button class="modal-close" id="closeEditSupplierModalBtn">×</button>
        </div>

        <div class="form-grid ${readonlyClass}">
          <label>
            Nome do fornecedor
            <input id="editSupplierNameInput" type="text" value="${supplier.name}" ${disabled} />
          </label>

          <label>
            CNPJ / Documento
            <input id="editSupplierDocumentInput" type="text" value="${supplier.document || ""}" ${disabled} />
          </label>

          <label>
            Status
            <select id="editSupplierStatusInput" ${disabled}>
              <option ${supplier.status === "Ativo" ? "selected" : ""}>Ativo</option>
              <option ${supplier.status === "Inativo" ? "selected" : ""}>Inativo</option>
            </select>
          </label>

          <label class="full-field">
            Contato / Observação
            <input id="editSupplierContactInput" type="text" value="${supplier.contact || ""}" ${disabled} />
          </label>
        </div>

        <div class="modal-footer between">
          ${
            isEditingSupplier
              ? `<button class="danger-btn" id="openDeleteSupplierWarningBtn">Excluir fornecedor</button>`
              : `<button class="secondary-btn" id="enableEditSupplierBtn">Editar</button>`
          }

          <div class="modal-footer-actions">
            <button class="secondary-btn" id="cancelEditSupplierBtn">
              ${isEditingSupplier ? "Cancelar" : "Fechar"}
            </button>

            ${
              isEditingSupplier
                ? `<button class="primary-btn" id="saveEditSupplierBtn">Salvar alterações</button>`
                : ""
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderDeleteSupplierWarningModal(supplier) {
  return `
    <div class="modal-backdrop open danger-backdrop" id="deleteSupplierWarningModal">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>Confirmar exclusão de fornecedor</h2>
            <p>
              Você está prestes a excluir o fornecedor <strong>${supplier.name}</strong>.
              Essa ação pode afetar compras, notas fiscais, rastreabilidade e relatórios vinculados.
            </p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>
            Em ambiente real, essa ação só deve ser permitida se o fornecedor não tiver compras vinculadas.
            Caso contrário, o recomendado será inativar o fornecedor.
          </span>
        </div>

        <label class="aware-check">
          <input id="deleteSupplierAwareInput" type="checkbox" />
          Estou ciente dos impactos e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelDeleteSupplierWarningBtn">Cancelar</button>
          <button class="danger-btn" id="confirmDeleteSupplierBtn" disabled>Confirmar exclusão</button>
        </div>
      </div>
    </div>
  `;
}

function formatSupplierDocument(value) {
  const numbers = value.replace(/\D/g, "").slice(0, 14);

  if (numbers.length <= 11) {
    return numbers;
  }

  return numbers
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

function setupFornecedoresEvents() {
  loadSuppliersFromApi();

  const modal = document.getElementById("supplierModal");
  const openBtn = document.getElementById("openSupplierModalBtn");
  const openEmptyBtn = document.getElementById("openSupplierModalEmptyBtn");
  const closeBtn = document.getElementById("closeSupplierModalBtn");
  const cancelBtn = document.getElementById("cancelSupplierModalBtn");
  const saveBtn = document.getElementById("saveSupplierBtn");
  const supplierRows = document.querySelectorAll(".clickable-row");
  const supplierDocumentInput = document.getElementById("supplierDocumentInput");
const editSupplierDocumentInput = document.getElementById("editSupplierDocumentInput");

supplierDocumentInput?.addEventListener("input", () => {
  supplierDocumentInput.value = formatSupplierDocument(
    supplierDocumentInput.value
  );
});

editSupplierDocumentInput?.addEventListener("input", () => {
  editSupplierDocumentInput.value = formatSupplierDocument(
    editSupplierDocumentInput.value
  );
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
    const name = document.getElementById("supplierNameInput").value.trim();
    const documentValue = document.getElementById("supplierDocumentInput").value.trim();
    const contact = document.getElementById("supplierContactInput").value.trim();

    if (!name) {
      alert("Preencha pelo menos o nome do fornecedor.");
      return;
    }

    const payload = {
      name,
      document: documentValue,
      contact,
      status: "Ativo"
    };

    const savedSupplier = await createSupplier(payload);

    if (!savedSupplier) return;

    suppliers.push(savedSupplier);

    modal.classList.remove("open");
    rerenderFornecedores();
  });

  supplierRows.forEach((row) => {
    row.addEventListener("click", () => {
      selectedSupplierIndex = Number(row.dataset.supplierIndex);
      isEditingSupplier = false;
      isDeleteSupplierWarningOpen = false;
      rerenderFornecedores();
    });
  });

  const closeEditBtn = document.getElementById("closeEditSupplierModalBtn");
  const cancelEditBtn = document.getElementById("cancelEditSupplierBtn");
  const enableEditBtn = document.getElementById("enableEditSupplierBtn");
  const saveEditBtn = document.getElementById("saveEditSupplierBtn");
  const openDeleteWarningBtn = document.getElementById("openDeleteSupplierWarningBtn");

  closeEditBtn?.addEventListener("click", closeEditSupplierModal);
  cancelEditBtn?.addEventListener("click", closeEditSupplierModal);

  enableEditBtn?.addEventListener("click", () => {
    isEditingSupplier = true;
    rerenderFornecedores();
  });

  saveEditBtn?.addEventListener("click", async () => {
    const supplier = suppliers[selectedSupplierIndex];
    const payload = {
      name: document.getElementById("editSupplierNameInput").value.trim(),
      document: document.getElementById("editSupplierDocumentInput").value.trim(),
      contact: document.getElementById("editSupplierContactInput").value.trim(),
      status: document.getElementById("editSupplierStatusInput").value
    };

    if (!payload.name) {
      alert("Preencha pelo menos o nome do fornecedor.");
      return;
    }

    const updatedSupplier = await updateSupplier(supplier, payload);

    if (!updatedSupplier) return;

    suppliers[selectedSupplierIndex] = updatedSupplier;

    isEditingSupplier = false;
    rerenderFornecedores();
  });

  openDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteSupplierWarningOpen = true;
    rerenderFornecedores();
  });

  const cancelDeleteWarningBtn = document.getElementById("cancelDeleteSupplierWarningBtn");
  const deleteAwareInput = document.getElementById("deleteSupplierAwareInput");
  const confirmDeleteSupplierBtn = document.getElementById("confirmDeleteSupplierBtn");

  cancelDeleteWarningBtn?.addEventListener("click", () => {
    isDeleteSupplierWarningOpen = false;
    rerenderFornecedores();
  });

  deleteAwareInput?.addEventListener("change", () => {
    confirmDeleteSupplierBtn.disabled = !deleteAwareInput.checked;
  });

  confirmDeleteSupplierBtn?.addEventListener("click", async () => {
    const supplier = suppliers[selectedSupplierIndex];
    const deletedSupplier = await deleteSupplier(supplier);

    if (!deletedSupplier) return;

    suppliers.splice(selectedSupplierIndex, 1);

    selectedSupplierIndex = null;
    isEditingSupplier = false;
    isDeleteSupplierWarningOpen = false;

    rerenderFornecedores();
  });

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.remove("open");
    }
  });
}

async function loadSuppliersFromApi() {
  if (hasTriedApiLoad) return;

  hasTriedApiLoad = true;

  try {
    const apiSuppliers = await apiGet("/api/suppliers");
    suppliers.splice(0, suppliers.length, ...apiSuppliers.map(normalizeSupplier).filter(isActiveItem));
    console.log("Fornecedores carregados da API");
    rerenderFornecedores();
  } catch (error) {
    console.log("API indisponível, usando fornecedores locais");
  }
}

async function createSupplier(payload) {
  try {
    const supplier = await apiPost("/api/suppliers", payload);
    console.log("Fornecedor salvo na API");
    return normalizeSupplier(supplier);
  } catch (error) {
    if (!(await shouldUseLocalFallback(error))) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando fornecedores locais");
    return normalizeSupplier(payload);
  }
}

async function updateSupplier(supplier, payload) {
  if (!supplier.id) {
    alert("Este fornecedor ainda não possui ID da API. Recarregue os fornecedores da API antes de editar.");
    return null;
  }

  try {
    const updatedSupplier = await apiPut(`/api/suppliers/${supplier.id}`, payload);
    console.log("Fornecedor atualizado na API");
    return normalizeSupplier(updatedSupplier);
  } catch (error) {
    if (!(await shouldUseLocalFallback(error))) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando fornecedores locais");
    return normalizeSupplier({
      ...supplier,
      ...payload
    });
  }
}

async function deleteSupplier(supplier) {
  if (!supplier.id) {
    alert("Este fornecedor ainda não possui ID da API. Recarregue os fornecedores da API antes de inativar.");
    return null;
  }

  try {
    const deletedSupplier = await apiDelete(`/api/suppliers/${supplier.id}`);
    console.log("Fornecedor inativado na API");
    return normalizeSupplier(deletedSupplier);
  } catch (error) {
    if (!(await shouldUseLocalFallback(error))) {
      alert(error.message);
      return null;
    }

    console.log("API indisponível, usando fornecedores locais");
    return normalizeSupplier({
      ...supplier,
      status: "Inativo"
    });
  }
}

function normalizeSupplier(supplier) {
  return {
    id: supplier.id,
    name: supplier.name || "",
    document: supplier.document || "",
    contact: supplier.contact || "",
    status: supplier.status || "Ativo",
    createdAt: supplier.createdAt,
    updatedAt: supplier.updatedAt
  };
}

function isActiveItem(item) {
  return item.status !== "Inativo";
}

async function shouldUseLocalFallback(error) {
  if (error.status) return false;

  try {
    await apiGet("/api/suppliers");
    return false;
  } catch (availabilityError) {
    return !availabilityError.status;
  }
}

function closeEditSupplierModal() {
  selectedSupplierIndex = null;
  isEditingSupplier = false;
  isDeleteSupplierWarningOpen = false;

  rerenderFornecedores();
}

function rerenderFornecedores() {
  const content = document.getElementById("appContent");

  content.innerHTML = `
    <div class="page-header">
      <h1>${fornecedoresPage.title}</h1>
      <p>${fornecedoresPage.subtitle}</p>
    </div>

    ${fornecedoresPage.render()}
  `;

  setupFornecedoresEvents();
}
