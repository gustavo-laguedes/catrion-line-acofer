import { apiGet, apiPost, apiPut } from "../../shared/api-client.js";

let laboratoryLots = [];
let materialTypes = [];
let materials = [];
let technicalParameters = [];
let lotTests = [];
let selectedLot = null;
let selectedTest = null;
let activeModal = null;
let laboratoryNotice = null;
let cancelReason = "";
let selectedCertificateFile = null;
let selectedParameterId = "";
let pendingLaboratoryConfirmation = null;
let hasLoadedLaboratory = false;
let sortState = {
  key: "entryDate",
  direction: "desc"
};
const NOMINAL_UNITS = ["kg/m", "kg", "g/m", "mm", "MPa", "%", "un"];
const TOLERANCE_START_PERCENT = 18;
const TOLERANCE_NOMINAL_PERCENT = 50;
const TOLERANCE_END_PERCENT = 82;

let filters = {
  search: "",
  status: "Todos",
  typeId: "",
  from: "",
  to: ""
};

export const laboratorioPage = {
  title: "🧪 Laboratório",
  subtitle: "Ensaios, certificados e conformidade técnica dos lotes",
  render: renderLaboratorio,
  afterRender: setupLaboratorioEvents
};

function renderLaboratorio() {
  const visibleLots = applySorting(applyFilters(laboratoryLots));
  const summary = buildSummary(laboratoryLots);

  return `
    <div class="laboratory-shell">
      ${renderNotice()}
      ${renderFilters()}
      <div id="laboratorySummaryMount">
        ${renderSummary(summary)}
      </div>

      <div class="card laboratory-list-card">
        <div class="table-header">
          <div>
            <h2>Lotes para laboratório</h2>
            <p>${visibleLots.length} lote(s) encontrado(s) para ensaio técnico.</p>
          </div>
        </div>

        ${renderLotsTable(visibleLots)}
      </div>

      ${renderTestModal()}
      ${renderCancelModal()}
      ${renderSaveConfirmationModal()}
    </div>
  `;
}

function refreshLaboratoryResults() {
  const visibleLots = applySorting(applyFilters(laboratoryLots));
  const summaryMount = document.getElementById("laboratorySummaryMount");
  const listCard = document.querySelector(".laboratory-list-card");

  if (summaryMount) {
    summaryMount.innerHTML = renderSummary(buildSummary(laboratoryLots));
  }

  if (listCard) {
    listCard.innerHTML = `
      <div class="table-header">
        <div>
          <h2>Lotes para laboratório</h2>
          <p>${visibleLots.length} lote(s) encontrado(s) para ensaio técnico.</p>
        </div>
      </div>

      ${renderLotsTable(visibleLots)}
    `;
    bindLaboratoryListEvents();
  }
}

function renderNotice() {
  if (!laboratoryNotice) return "";

  return `
    <div id="laboratoryNotice" class="movement-system-notice ${laboratoryNotice.type}">
      <strong>${escapeHtml(laboratoryNotice.title)}</strong>
      <span>${escapeHtml(laboratoryNotice.message)}</span>
    </div>
  `;
}

function renderFilters() {
  return `
    <div class="card laboratory-filter-card">
      <div class="stock-filters laboratory-filters">
        <label>
          Busca
          <input id="laboratorySearchFilter" type="text" value="${escapeHtml(filters.search)}" placeholder="Lote, material, fornecedor ou certificado" />
        </label>

        <label>
          Status
          <select id="laboratoryStatusFilter">
            ${renderOptions(["Todos", "Não ensaiado", "Aprovado", "Reprovado", "Cancelado"], filters.status)}
          </select>
        </label>

        <label>
          Tipo de material
          <select id="laboratoryTypeFilter">
            <option value="">Todos</option>
            ${materialTypes.map((type) => `
              <option value="${type.id}" ${type.id === filters.typeId ? "selected" : ""}>${escapeHtml(type.name)}</option>
            `).join("")}
          </select>
        </label>

        <label>
          Período inicial
          <input id="laboratoryFromFilter" type="date" value="${filters.from}" />
        </label>

        <label>
          Período final
          <input id="laboratoryToFilter" type="date" value="${filters.to}" />
        </label>
      </div>
    </div>
  `;
}

function renderSummary(summary) {
  return `
    <div class="laboratory-summary-pills">
      <div class="laboratory-summary-pill pending">
        <span>Lotes pendentes</span>
        <strong>${summary.pending}</strong>
      </div>
      <div class="laboratory-summary-pill approved">
        <span>Aprovados</span>
        <strong>${summary.approved}</strong>
      </div>
      <div class="laboratory-summary-pill rejected">
        <span>Reprovados</span>
        <strong>${summary.rejected}</strong>
      </div>
      <div class="laboratory-summary-pill tests">
        <span>Ensaios realizados</span>
        <strong>${summary.tests}</strong>
      </div>
    </div>
  `;
}

function renderLotsTable(lots) {
  if (!lots.length) {
    return `
      <div class="empty-state small-empty">
        <div class="empty-icon">L</div>
        <h3>Nenhum lote encontrado</h3>
        <p>Ajuste os filtros ou confira se há lotes comprados com saldo.</p>
      </div>
    `;
  }

  return `
    <div class="data-table-wrap">
      <table class="data-table laboratory-table">
        <thead>
          <tr>
            ${renderSortableHeader("lotCode", "Lote")}
            ${renderSortableHeader("materialName", "Material")}
            ${renderSortableHeader("materialType", "Tipo")}
            ${renderSortableHeader("supplierName", "Fornecedor")}
            ${renderSortableHeader("entryDate", "Entrada")}
            ${renderSortableHeader("currentLocationName", "Local atual")}
            ${renderSortableHeader("laboratoryStatus", "Status laboratório")}
            ${renderSortableHeader("laboratoryCertificateCodes", "Certificados laboratório")}
            ${renderSortableHeader("supplierCertificateNumber", "Certificado fornecedor")}
            ${renderSortableHeader("totalTests", "Ensaios")}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${lots.map((lot) => `
            <tr class="${lot.laboratoryStatus === "Cancelado" ? "is-canceled" : ""}">
              <td><strong>${escapeHtml(lot.lotCode || "-")}</strong></td>
              <td>${escapeHtml(lot.materialName || "-")}</td>
              <td>${escapeHtml(lot.materialType || "Sem tipo")}</td>
              <td>${escapeHtml(lot.supplierName || "-")}</td>
              <td>${formatDate(lot.entryDate)}</td>
              <td>${escapeHtml(lot.currentLocationName || "-")}</td>
              <td><span class="badge ${getStatusBadgeClass(lot.laboratoryStatus)}">${escapeHtml(lot.laboratoryStatus || "Não ensaiado")}</span></td>
              <td>${escapeHtml(lot.laboratoryCertificateCodes || "-")}</td>
              <td>${escapeHtml(lot.supplierCertificateNumber || "-")}</td>
              <td>${Number(lot.totalTests || 0)}</td>
              <td class="laboratory-row-actions">
                ${hasCertificate(lot) ? `
                  <button class="laboratory-pdf-btn laboratory-table-pdf-btn" data-file-url="${escapeAttr(lot.certificateFileUrl || lot.certificate_file_url || "")}" data-file-name="${escapeAttr(lot.certificateFileName || lot.certificate_file_name || "")}" type="button">PDF</button>
                ` : ""}
                <button class="${Number(lot.totalTests || 0) ? "secondary-btn" : "primary-btn"} laboratory-open-btn" data-lot-id="${lot.id}" type="button">
                  ${Number(lot.totalTests || 0) ? "Ver ensaios" : "Realizar ensaio"}
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSortableHeader(key, label) {
  const isActive = sortState.key === key;
  const directionLabel = sortState.direction === "asc" ? "crescente" : "decrescente";
  const arrow = isActive ? (sortState.direction === "asc" ? "↑" : "↓") : "↕";

  return `
    <th>
      <button class="laboratory-sort-btn ${isActive ? "active" : ""}" data-sort-key="${key}" type="button" aria-label="Ordenar ${escapeAttr(label)} ${directionLabel}">
        <span>${escapeHtml(label)}</span>
        <strong>${arrow}</strong>
      </button>
    </th>
  `;
}

function renderTestModal() {
  if (!activeModal || !selectedLot) return "";

  const isHistory = activeModal === "history" || activeModal === "cancel";
  const isEditing = activeModal === "edit";
  const isViewing = activeModal === "view";
  const isReadOnly = isViewing;
  const readOnlyAttr = isReadOnly ? "disabled" : "";
  if (isHistory) {
    return `
      <div class="modal-backdrop open laboratory-modal-backdrop">
        <div class="modal large-modal laboratory-modal">
          <div class="modal-header">
            <div>
              <h2>Histórico de ensaios</h2>
              <p>Lote ${escapeHtml(selectedLot.lotCode)} · ${escapeHtml(selectedLot.materialName || "-")}</p>
            </div>
            <button id="closeLaboratoryModalBtn" class="modal-close" type="button">×</button>
          </div>

          ${renderHistory()}

          <div class="modal-footer between">
            <button id="cancelLaboratoryModalBtn" class="secondary-btn" type="button">Fechar</button>
            <button id="newLaboratoryTestBtn" class="primary-btn" type="button">Novo ensaio</button>
          </div>
        </div>
      </div>
    `;
  }

  const form = selectedTest || makeEmptyTest(selectedLot);
  const selectedTypeId = getSelectedMaterialTypeId(form);
  const filteredMaterials = getMaterialsForSelectedType(form);
  const selectedMaterialId = getCompatibleMaterialId(form);
  const parametersForMaterial = getParametersForSelectedMaterial({ ...form, materialId: selectedMaterialId });
  const parameter = parametersForMaterial.find((item) => item.id === (selectedParameterId || form.technicalParameterId));
  const preview = buildTolerancePreview(form, parameter);

  return `
    <div class="modal-backdrop open laboratory-modal-backdrop">
      <div class="modal large-modal laboratory-modal">
        <div class="modal-header">
          <div>
            <h2>${isViewing ? "Visualizar ensaio" : isEditing ? "Editar ensaio" : "Novo ensaio"}</h2>
            <p>Lote ${escapeHtml(selectedLot.lotCode)} · ${escapeHtml(selectedLot.materialName || "-")}</p>
          </div>
          <label class="laboratory-certificate-code-top">
            <span>Código do certificado de qualidade</span>
            <input id="laboratoryCertificateCodeInput" type="text" value="${escapeAttr(form.certificateCode || "")}" placeholder="Informe o código" required ${readOnlyAttr} />
          </label>
          <button id="closeLaboratoryModalBtn" class="modal-close" type="button">×</button>
        </div>

        <div class="laboratory-form-title">
          <h3>${isViewing ? "Dados completos do ensaio" : isEditing ? "Dados do ensaio selecionado" : "Novo registro de ensaio"}</h3>
        </div>

        <div class="laboratory-form-sections">
          <section class="laboratory-form-section">
            <h4>Dados do lote</h4>
            <div class="form-grid readonly-mode">
              <label>
                Lote
                <input type="text" value="${escapeAttr(selectedLot.lotCode || "")}" disabled />
              </label>
              <label>
                Fornecedor
                <input type="text" value="${escapeAttr(selectedLot.supplierName || "-")}" disabled />
              </label>
              <label>
                Data
                <input id="laboratoryTestDate" type="date" value="${form.testDate || getToday()}" ${readOnlyAttr} />
              </label>
              <label>
                Certificado fornecedor
                <input id="laboratorySupplierCertificate" type="text" value="${escapeAttr(form.supplierCertificateNumber || selectedLot.supplierCertificateNumber || "")}" disabled />
              </label>
            </div>
          </section>

          <section class="laboratory-form-section">
            <h4>Material e parâmetro</h4>
            <div class="form-grid">
              <label>
                Tipo de material
                <select id="laboratoryMaterialTypeInput" ${readOnlyAttr}>
                  <option value="">Selecione</option>
                  ${materialTypes.map((type) => `
                    <option value="${type.id}" ${type.id === selectedTypeId ? "selected" : ""}>${escapeHtml(type.name)}</option>
                  `).join("")}
                </select>
              </label>

              <label>
                Material ensaiado
                <select id="laboratoryMaterialInput" ${isReadOnly || !filteredMaterials.length ? "disabled" : ""}>
                  <option value="">${escapeHtml(getMaterialPlaceholder(selectedTypeId, filteredMaterials.length))}</option>
                  ${filteredMaterials.map((material) => `
                    <option value="${material.id}" ${material.id === selectedMaterialId ? "selected" : ""}>
                      ${escapeHtml(material.code ? `${material.code} - ${material.name}` : material.name)}
                    </option>
                  `).join("")}
                </select>
              </label>

              <label>
                Parâmetro técnico
                <select id="laboratoryParameterInput" ${isReadOnly || !selectedMaterialId ? "disabled" : ""}>
                  <option value="">${selectedMaterialId ? "Selecione um parâmetro" : "Selecione o material primeiro"}</option>
                  ${parametersForMaterial.map((item) => `
                    <option value="${item.id}" ${item.id === (selectedParameterId || form.technicalParameterId) ? "selected" : ""}>${escapeHtml(item.name)}</option>
                  `).join("")}
                </select>
              </label>
            </div>
          </section>

          <section class="laboratory-form-section">
            <h4>Medições técnicas</h4>
            <div class="form-grid">
              <label>
                Peso específico medido
                <input id="laboratoryMeasuredWeightInput" type="number" step="0.0001" value="${formatInputNumber(form.measuredSpecificWeight)}" ${readOnlyAttr} />
              </label>

              <label>
                Unidade nominal
                <select id="laboratoryNominalUnitInput" ${isReadOnly || parameter ? "disabled" : ""}>
                  <option value="">Selecione</option>
                  ${renderOptions(NOMINAL_UNITS, form.nominalUnit || parameter?.unit || "")}
                </select>
              </label>

              <label>
                Peso nominal / valor base
                <input id="laboratoryNominalValueInput" type="number" step="0.0001" value="${formatNominalInputNumber(form.nominalValue ?? parameter?.baseValue)}" disabled />
              </label>

              <label>
                Bitola aparente
                <input id="laboratoryDiameterInput" type="number" step="0.001" value="${formatInputNumber(form.apparentDiameter)}" ${readOnlyAttr} />
              </label>

              <label>
                LE
                <input id="laboratoryLeInput" type="number" step="0.001" value="${formatInputNumber(form.yieldStrengthLe)}" ${readOnlyAttr} />
              </label>

              <label>
                LR
                <input id="laboratoryLrInput" type="number" step="0.001" value="${formatInputNumber(form.tensileStrengthLr)}" ${readOnlyAttr} />
              </label>

              <label>
                Alongamento (%)
                <input id="laboratoryElongationInput" type="number" step="0.001" value="${formatInputNumber(form.elongationPercent)}" ${readOnlyAttr} />
              </label>

              <label>
                LR/LE automático
                <input id="laboratoryRatioPreview" type="text" value="${formatNumber(preview.ratio)}" disabled />
              </label>
            </div>
          </section>

          <section class="laboratory-form-section">
            <h4>Resultado e certificado</h4>
            <div class="laboratory-warning ${parameter ? "hidden" : ""}">Nenhum parâmetro técnico selecionado para este material. Selecione um parâmetro para calcular tolerância automaticamente.</div>
            ${renderToleranceBar(preview)}

            <div class="laboratory-result-box">
              <div>
                <strong>Resultado do ensaio</strong>
                <span id="laboratoryResultHint">${preview.hasRange ? `Calculado pela faixa de tolerância: ${preview.rangeLabel}.` : "Selecione o resultado para concluir o ensaio."}</span>
              </div>
              <label>
                Status
                <select id="laboratoryStatusInput" ${readOnlyAttr}>
                  ${renderOptions(["Aprovado", "Reprovado", "Reprocessado"], form.status === "Cancelado" ? "Reprovado" : form.status || preview.status)}
                </select>
              </label>
            </div>

            <div class="form-grid">
              <label>
                Anexo obrigatório
                <input id="laboratoryCertificateFileInput" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" ${readOnlyAttr} />
              </label>
              <label>
                Observações
                <input id="laboratoryNotesInput" type="text" value="${escapeAttr(form.notes || "")}" placeholder="Observações do ensaio" ${readOnlyAttr} />
              </label>
            </div>

            <div id="laboratoryFileNote" class="laboratory-file-note">
              Arquivo atual: ${escapeHtml(selectedCertificateFile?.name || form.certificateFileName || "nenhum arquivo selecionado")}
            </div>
          </section>
        </div>

        <div class="modal-footer between">
          <button id="cancelLaboratoryModalBtn" class="secondary-btn" type="button">${isViewing ? "Fechar" : "Cancelar"}</button>
          <div class="laboratory-edit-footer-actions">
            ${isViewing ? `<button id="viewEditLaboratoryTestBtn" class="primary-btn" type="button">Editar</button>` : ""}
            ${isEditing ? renderEditTestActionButton(form) : ""}
            ${!isViewing ? `<button id="saveLaboratoryTestBtn" class="primary-btn" type="button">${isEditing ? "Salvar alterações" : "Salvar ensaio"}</button>` : ""}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderEditTestActionButton(test) {
  if (test.status === "Cancelado") {
    return `<button id="editReprocessLaboratoryTestBtn" class="secondary-btn" type="button">Reprocessar ensaio</button>`;
  }

  return `<button id="editCancelLaboratoryTestBtn" class="danger-btn" type="button">Cancelar ensaio</button>`;
}

function renderHistory() {
  return `
    <div class="laboratory-history">
      <div class="laboratory-history-header">
        <h3>Histórico de ensaios</h3>
      </div>
      <div class="laboratory-history-list">
        ${lotTests.map((test) => `
          <div class="laboratory-history-item ${test.status === "Cancelado" ? "is-canceled" : ""}">
            <div>
              <strong>${escapeHtml(test.certificateCode || "-")}</strong>
              <span>${formatDate(test.testDate)} · ${escapeHtml(test.certificateFileName || "-")} · Alongamento ${formatPercentValue(test.elongationPercent)}</span>
            </div>
            ${hasCertificate(test) ? `
              <button class="laboratory-pdf-btn laboratory-history-pdf-btn" data-file-url="${escapeAttr(test.certificateFileUrl || test.certificate_file_url || "")}" data-file-name="${escapeAttr(test.certificateFileName || test.certificate_file_name || "")}" type="button">PDF</button>
            ` : `<span></span>`}
            <span class="badge ${getStatusBadgeClass(test.status)}">${escapeHtml(test.status)}</span>
            <button class="secondary-btn view-laboratory-test-btn" data-test-id="${test.id}" type="button">Visualizar</button>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderCancelModal() {
  if (activeModal !== "cancel" || !selectedTest) return "";

  return `
    <div class="modal-backdrop open danger-backdrop">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">!</div>
        <div class="modal-header vertical">
          <div>
            <h2>Cancelar ensaio</h2>
            <p>O registro será preservado no histórico com status Cancelado. Informe o motivo para auditoria.</p>
          </div>
        </div>

        <label class="full-field laboratory-cancel-reason">
          Motivo do cancelamento
          <input id="laboratoryCancelReasonInput" type="text" value="${escapeAttr(cancelReason)}" placeholder="Descreva o motivo" />
        </label>

        <div class="modal-footer between">
          <button id="closeCancelLaboratoryTestBtn" class="secondary-btn" type="button">Voltar</button>
          <button id="confirmCancelLaboratoryTestBtn" class="danger-btn" type="button">Confirmar cancelamento</button>
        </div>
      </div>
    </div>
  `;
}

function renderSaveConfirmationModal() {
  if (!pendingLaboratoryConfirmation) return "";

  const action = pendingLaboratoryConfirmation.action || "save";
  const summary = pendingLaboratoryConfirmation.summary;
  const summaryItems = pendingLaboratoryConfirmation.summaryItems || [
    ["Lote", summary.lotCode],
    ["Material ensaiado", summary.materialName],
    ["Fornecedor", summary.supplierName],
    ["Data do ensaio", summary.testDate],
    ["Peso nominal", summary.nominalValue],
    ["Peso específico medido", summary.measuredSpecificWeight],
    ["Variação %", summary.variation],
    ["LE", summary.yieldStrengthLe],
    ["LR", summary.tensileStrengthLr],
    ["LR/LE", summary.ratioLrLe],
    ["Alongamento (%)", summary.elongationPercent],
    ["Arquivo anexado", summary.certificateFileName]
  ];

  return `
    <div class="modal-backdrop open laboratory-confirm-backdrop">
      <div class="modal laboratory-confirm-modal ${action === "cancel" ? "laboratory-confirm-danger" : ""}">
        <div class="modal-header">
          <div>
            <h2>${escapeHtml(pendingLaboratoryConfirmation.title || "Confirmar registro do ensaio")}</h2>
            <p>${escapeHtml(pendingLaboratoryConfirmation.message || "Confira os dados antes de salvar o registro laboratorial.")}</p>
          </div>
        </div>

        <div class="laboratory-confirm-status">
          <span>Status final</span>
          <strong class="badge ${getStatusBadgeClass(summary.status)}">${escapeHtml(summary.status)}</strong>
        </div>

        ${summary.certificateCode ? `<div class="laboratory-confirm-certificate">
          <span>Código do certificado de qualidade</span>
          <strong>${escapeHtml(summary.certificateCode)}</strong>
        </div>` : ""}

        <div class="laboratory-confirm-grid">
          ${summaryItems.map(([label, value]) => `
            <div>
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value)}</strong>
            </div>
          `).join("")}
        </div>

        <div class="modal-footer between">
          <button id="cancelLaboratoryConfirmationBtn" class="secondary-btn" type="button">Cancelar</button>
          <button id="confirmLaboratorySaveBtn" class="${action === "cancel" ? "danger-btn" : "primary-btn"}" type="button">${escapeHtml(pendingLaboratoryConfirmation.confirmLabel || "Confirmar ensaio")}</button>
        </div>
      </div>
    </div>
  `;
}

function renderToleranceBar(preview) {
  return `
    <div class="laboratory-tolerance-card ${preview.zoneClass}">
      <div class="laboratory-tolerance-head">
        <div>
          <strong>Faixa de tolerância</strong>
          <span id="laboratoryToleranceRange">${preview.hasRange ? `${formatToleranceNumber(preview.min)} → ${formatNominalNumber(preview.nominal)} → ${formatToleranceNumber(preview.max)}` : "Selecione parâmetro e informe medição"}</span>
        </div>
        <strong id="laboratoryToleranceStatus" class="${preview.inTolerance ? "laboratory-ok" : "laboratory-out"}">${preview.rangeLabel}</strong>
      </div>
      <div class="laboratory-tolerance-bar">
        <span class="min"></span>
        <span class="nominal"></span>
        <span class="max"></span>
        <i id="laboratoryToleranceMarker" style="left: ${preview.marker}%"></i>
      </div>
      <div class="laboratory-tolerance-meta">
        <span id="laboratoryToleranceMin">Mínimo ${formatToleranceNumber(preview.min)}</span>
        <span id="laboratoryToleranceNominal">Nominal ${formatNominalNumber(preview.nominal)}</span>
        <span id="laboratoryToleranceMeasured">Medido ${formatNumber(preview.measured)}</span>
        <span id="laboratoryToleranceVariation">Variação ${formatSignedPercent(preview.variation)}</span>
        <span id="laboratoryToleranceMax">Máximo ${formatToleranceNumber(preview.max)}</span>
      </div>
    </div>
  `;
}

function setupLaboratorioEvents() {
  loadLaboratoryData();

  document.getElementById("laboratorySearchFilter")?.addEventListener("input", (event) => {
    filters.search = event.target.value;
    refreshLaboratoryResults();
  });
  document.getElementById("laboratoryStatusFilter")?.addEventListener("change", (event) => {
    filters.status = event.target.value;
    rerenderLaboratorio();
  });
  document.getElementById("laboratoryTypeFilter")?.addEventListener("change", (event) => {
    filters.typeId = event.target.value;
    rerenderLaboratorio();
  });
  document.getElementById("laboratoryFromFilter")?.addEventListener("change", (event) => {
    filters.from = event.target.value;
    rerenderLaboratorio();
  });
  document.getElementById("laboratoryToFilter")?.addEventListener("change", (event) => {
    filters.to = event.target.value;
    rerenderLaboratorio();
  });

  bindLaboratoryListEvents();

  document.getElementById("closeLaboratoryModalBtn")?.addEventListener("click", closeModal);
  document.getElementById("cancelLaboratoryModalBtn")?.addEventListener("click", closeModal);
  document.getElementById("newLaboratoryTestBtn")?.addEventListener("click", () => {
    selectedTest = makeEmptyTest(selectedLot);
    selectedCertificateFile = null;
    selectedParameterId = "";
    activeModal = "new";
    rerenderLaboratorio();
  });

  document.querySelectorAll(".view-laboratory-test-btn").forEach((button) => {
    button.addEventListener("click", () => {
      selectedTest = hydrateSelectedTest(lotTests.find((test) => test.id === button.dataset.testId));
      selectedParameterId = selectedTest?.technicalParameterId || "";
      selectedCertificateFile = null;
      activeModal = "view";
      rerenderLaboratorio();
    });
  });

  document.getElementById("viewEditLaboratoryTestBtn")?.addEventListener("click", () => {
    activeModal = "edit";
    rerenderLaboratorio();
  });

  document.getElementById("editCancelLaboratoryTestBtn")?.addEventListener("click", () => {
    cancelReason = "";
    activeModal = "cancel";
    rerenderLaboratorio();
  });

  document.getElementById("editReprocessLaboratoryTestBtn")?.addEventListener("click", () => {
    prepareLaboratoryReprocessConfirmation();
  });

  document.getElementById("closeCancelLaboratoryTestBtn")?.addEventListener("click", () => {
    activeModal = "edit";
    rerenderLaboratorio();
  });
  document.getElementById("confirmCancelLaboratoryTestBtn")?.addEventListener("click", prepareLaboratoryCancelConfirmation);
  document.getElementById("cancelLaboratoryConfirmationBtn")?.addEventListener("click", cancelLaboratoryConfirmation);
  document.getElementById("confirmLaboratorySaveBtn")?.addEventListener("click", confirmLaboratorySave);

  document.getElementById("laboratoryParameterInput")?.addEventListener("change", (event) => {
    selectedParameterId = event.target.value;
    const selectedParameter = technicalParameters.find((item) => item.id === selectedParameterId);
    captureFormIntoSelectedTest();
    selectedTest.parameterWasChanged = true;
    applyParameterToSelectedTest(selectedParameter);
    updateParameterDependentFields(selectedParameter);
    updateLaboratoryLivePreview();
  });

  document.getElementById("laboratoryMaterialTypeInput")?.addEventListener("change", (event) => {
    captureFormIntoSelectedTest();
    selectedTest.materialTypeId = event.target.value;
    selectedTest.materialId = "";
    selectedTest.technicalParameterId = "";
    selectedParameterId = "";
    clearParameterFromSelectedTest();
    updateMaterialSelectOptions();
    updateParameterSelectOptions();
    updateParameterDependentFields(null);
    updateLaboratoryLivePreview();
  });

  document.getElementById("laboratoryMaterialInput")?.addEventListener("change", (event) => {
    captureFormIntoSelectedTest();
    selectedTest.materialId = event.target.value;
    selectedTest.technicalParameterId = "";
    selectedParameterId = "";
    clearParameterFromSelectedTest();
    updateParameterSelectOptions();
    updateParameterDependentFields(null);
    updateLaboratoryLivePreview();
  });

  document.querySelectorAll("#laboratoryNominalUnitInput, #laboratoryMeasuredWeightInput, #laboratoryDiameterInput, #laboratoryLeInput, #laboratoryLrInput, #laboratoryElongationInput, #laboratoryStatusInput, #laboratoryNotesInput, #laboratoryTestDate, #laboratoryCertificateCodeInput").forEach((input) => {
    input.addEventListener(input.tagName === "SELECT" || input.type === "date" ? "change" : "input", () => {
      captureFormIntoSelectedTest();
      updateLaboratoryLivePreview();
    });
  });

  document.getElementById("laboratoryCertificateFileInput")?.addEventListener("change", (event) => {
    selectedCertificateFile = event.target.files?.[0] || null;
    captureFormIntoSelectedTest();
    updateLaboratoryFileNote();
  });

  document.getElementById("saveLaboratoryTestBtn")?.addEventListener("click", prepareLaboratorySaveConfirmation);
}

function bindLaboratoryListEvents() {
  document.querySelectorAll(".laboratory-sort-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey;
      if (sortState.key === key) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState = { key, direction: "asc" };
      }
      refreshLaboratoryResults();
    });
  });

  document.querySelectorAll(".laboratory-pdf-btn").forEach((button) => {
    button.addEventListener("click", () => openLaboratoryCertificate(button.dataset.fileUrl, button.dataset.fileName));
  });

  document.querySelectorAll(".laboratory-open-btn").forEach((button) => {
    button.addEventListener("click", () => openLotLaboratory(button.dataset.lotId));
  });
}

async function loadLaboratoryData(force = false) {
  if (hasLoadedLaboratory && !force) return;
  hasLoadedLaboratory = true;

  try {
    const [lots, apiMaterialTypes, apiMaterials, apiParameters] = await Promise.all([
      apiGet("/api/laboratory/lots"),
      apiGet("/api/material-types"),
      apiGet("/api/materials"),
      apiGet("/api/technical-parameters")
    ]);

    laboratoryLots = lots;
    materialTypes = apiMaterialTypes.filter((item) => item.status !== "Inativo");
    materials = apiMaterials.filter((item) => item.status !== "Inativo").map(normalizeMaterial);
    technicalParameters = apiParameters.filter((item) => item.status !== "Inativo").map(normalizeParameter);
    rerenderLaboratorio();
  } catch (error) {
    laboratoryNotice = {
      type: "danger",
      title: "Laboratório indisponível",
      message: error.message || "Não foi possível carregar os lotes."
    };
    rerenderLaboratorio();
  }
}

async function openLotLaboratory(lotId) {
  selectedLot = laboratoryLots.find((lot) => lot.id === lotId);
  selectedTest = makeEmptyTest(selectedLot);
  selectedParameterId = "";
  selectedCertificateFile = null;
  pendingLaboratoryConfirmation = null;

  try {
    lotTests = await apiGet(`/api/laboratory/lots/${lotId}/tests`);
    activeModal = lotTests.length ? "history" : "new";
    rerenderLaboratorio();
  } catch (error) {
    laboratoryNotice = { type: "danger", title: "Histórico indisponível", message: error.message };
    rerenderLaboratorio();
  }
}

function prepareLaboratorySaveConfirmation() {
  captureFormIntoSelectedTest();
  const isEditing = activeModal === "edit";
  const compatibleMaterialId = getCompatibleMaterialId(selectedTest);

  if (!selectedTest.materialTypeId || !compatibleMaterialId) {
    laboratoryNotice = { type: "danger", title: "Material incompatível", message: "Selecione um material cadastrado para o tipo de material escolhido." };
    rerenderLaboratorio();
    return;
  }

  selectedTest.materialId = compatibleMaterialId;

  if (!selectedTest.certificateCode || !selectedTest.certificateCode.trim()) {
    laboratoryNotice = { type: "danger", title: "Código obrigatório", message: "Informe o código do certificado de qualidade antes de salvar." };
    rerenderLaboratorio();
    return;
  }

  if (!selectedCertificateFile && !selectedTest?.certificateFileName && !selectedTest?.certificateFileUrl) {
    laboratoryNotice = { type: "danger", title: "Anexo obrigatório", message: "Selecione o arquivo do certificado do ensaio antes de salvar." };
    rerenderLaboratorio();
    return;
  }

  pendingLaboratoryConfirmation = buildLaboratoryConfirmation(isEditing);
  rerenderLaboratorio();
}

function cancelLaboratoryConfirmation() {
  pendingLaboratoryConfirmation = null;
  rerenderLaboratorio();
}

async function confirmLaboratorySave() {
  const confirmation = pendingLaboratoryConfirmation;
  if (!confirmation) return;
  pendingLaboratoryConfirmation = null;

  if (confirmation.action === "cancel") {
    await cancelSelectedTest(confirmation.reason);
    return;
  }

  if (confirmation.action === "reprocess") {
    await reprocessSelectedTest();
    return;
  }

  const payload = { ...confirmation.payload };

  try {
    if (confirmation.isEditing) {
      await apiPut(`/api/laboratory/tests/${selectedTest.id}`, payload);
    } else {
      await apiPost("/api/laboratory/tests", payload);
    }

    laboratoryNotice = { type: "success", title: "Ensaio salvo", message: "O histórico laboratorial foi atualizado." };
    await refreshAfterChange();
  } catch (error) {
    laboratoryNotice = { type: "danger", title: "Ensaio não salvo", message: error.message };
    rerenderLaboratorio();
  }
}

function buildLaboratoryConfirmation(isEditing) {
  const certificateCode = selectedTest.certificateCode.trim();
  const parameter = technicalParameters.find((item) => item.id === selectedTest.technicalParameterId);
  const preview = buildTolerancePreview(selectedTest, parameter);
  const material = materials.find((item) => item.id === selectedTest.materialId);
  const nominalUnit = selectedTest.nominalUnit || parameter?.unit || "";
  const certificateFileName = selectedCertificateFile?.name || selectedTest.certificateFileName || "";
  const payload = {
    ...selectedTest,
    lotId: selectedLot.id,
    certificateCode,
    certificateFileName,
    certificateFileUrl: selectedTest.certificateFileUrl || ""
  };

  return {
    action: "save",
    isEditing,
    title: isEditing ? "Confirmar edição do ensaio" : "Confirmar novo ensaio",
    message: isEditing ? "Confira os dados antes de salvar as alterações." : "Confira os dados antes de salvar o registro laboratorial.",
    confirmLabel: isEditing ? "Salvar edição" : "Salvar ensaio",
    payload,
    summary: {
      lotCode: selectedLot.lotCode || "-",
      materialName: material?.name || selectedLot.materialName || "-",
      supplierName: selectedLot.supplierName || "-",
      testDate: formatDate(selectedTest.testDate),
      nominalValue: `${formatNominalNumber(preview.nominal)}${nominalUnit ? ` ${nominalUnit}` : ""}`,
      measuredSpecificWeight: `${formatNumber(preview.measured)}${nominalUnit ? ` ${nominalUnit}` : ""}`,
      variation: formatSignedPercent(preview.variation),
      status: selectedTest.status || preview.status,
      yieldStrengthLe: formatNumber(selectedTest.yieldStrengthLe),
      tensileStrengthLr: formatNumber(selectedTest.tensileStrengthLr),
      ratioLrLe: formatNumber(preview.ratio),
      elongationPercent: formatPercentValue(selectedTest.elongationPercent),
      certificateFileName: certificateFileName || "-",
      certificateCode
    }
  };
}

async function prepareLaboratoryCancelConfirmation() {
  cancelReason = document.getElementById("laboratoryCancelReasonInput")?.value.trim() || "";
  if (!cancelReason) {
    laboratoryNotice = { type: "danger", title: "Motivo obrigatório", message: "Informe o motivo do cancelamento." };
    rerenderLaboratorio();
    return;
  }

  pendingLaboratoryConfirmation = null;
  await cancelSelectedTest(cancelReason);
}

function prepareLaboratoryReprocessConfirmation() {
  if (!selectedTest) return;
  pendingLaboratoryConfirmation = buildLaboratoryActionConfirmation({
    action: "reprocess",
    title: "Confirmar reprocessamento do ensaio",
    message: "O ensaio será marcado como reprocessado sem voltar para Aprovado.",
    confirmLabel: "Reprocessar ensaio",
    status: "Reprocessado"
  });
  rerenderLaboratorio();
}

function buildLaboratoryActionConfirmation({ action, title, message, confirmLabel, status, reason = "" }) {
  return {
    action,
    title,
    message,
    confirmLabel,
    reason,
    summary: {
      status,
      certificateCode: selectedTest?.certificateCode || "",
      lotCode: selectedLot?.lotCode || selectedTest?.lotCode || "-"
    },
    summaryItems: [
      ["Lote", selectedLot?.lotCode || selectedTest?.lotCode || "-"],
      ["Certificado", selectedTest?.certificateCode || "-"],
      ["Data do ensaio", formatDate(selectedTest?.testDate)],
      ["Arquivo", selectedTest?.certificateFileName || "-"],
      ["Status atual", selectedTest?.status || "-"],
      ["Status após ação", status || "-"],
      ...(reason ? [["Motivo", reason]] : [])
    ]
  };
}

async function cancelSelectedTest(reason) {
  try {
    await apiPost(`/api/laboratory/tests/${selectedTest.id}/cancel`, { reason });
    laboratoryNotice = { type: "success", title: "Ensaio cancelado", message: "O registro foi preservado no histórico." };
    await refreshAfterChange();
  } catch (error) {
    laboratoryNotice = { type: "danger", title: "Cancelamento não realizado", message: error.message };
    rerenderLaboratorio();
  }
}

async function reprocessSelectedTest() {
  try {
    await apiPost(`/api/laboratory/tests/${selectedTest.id}/reprocess`, {});
    laboratoryNotice = { type: "success", title: "Ensaio reprocessado", message: "O registro foi marcado como reprocessado." };
    await refreshAfterChange();
  } catch (error) {
    laboratoryNotice = { type: "danger", title: "Reprocessamento não realizado", message: error.message };
    rerenderLaboratorio();
  }
}

async function refreshAfterChange() {
  hasLoadedLaboratory = false;
  const lotId = selectedLot?.id;
  await loadLaboratoryData(true);
  if (lotId) {
    selectedLot = laboratoryLots.find((lot) => lot.id === lotId);
    lotTests = await apiGet(`/api/laboratory/lots/${lotId}/tests`);
  }
  selectedTest = makeEmptyTest(selectedLot);
  selectedCertificateFile = null;
  selectedParameterId = "";
  pendingLaboratoryConfirmation = null;
  activeModal = "history";
  rerenderLaboratorio();
}

function captureFormIntoSelectedTest() {
  if (!selectedTest) selectedTest = makeEmptyTest(selectedLot);

  selectedTest.testDate = document.getElementById("laboratoryTestDate")?.value || selectedTest.testDate || getToday();
  selectedTest.materialTypeId = document.getElementById("laboratoryMaterialTypeInput")?.value || selectedTest.materialTypeId || selectedLot?.materialTypeId || "";
  selectedTest.materialId = document.getElementById("laboratoryMaterialInput")?.value || selectedTest.materialId || "";
  selectedTest.materialId = getCompatibleMaterialId(selectedTest);
  selectedTest.technicalParameterId = document.getElementById("laboratoryParameterInput")?.value || selectedTest.technicalParameterId || "";
  selectedTest.nominalValue = readNumber("laboratoryNominalValueInput", selectedTest.nominalValue);
  selectedTest.nominalUnit = document.getElementById("laboratoryNominalUnitInput")?.value || selectedTest.nominalUnit || "";
  selectedTest.measuredSpecificWeight = readNumber("laboratoryMeasuredWeightInput", selectedTest.measuredSpecificWeight);
  selectedTest.apparentDiameter = readNumber("laboratoryDiameterInput", selectedTest.apparentDiameter);
  selectedTest.yieldStrengthLe = readNumber("laboratoryLeInput", selectedTest.yieldStrengthLe);
  selectedTest.tensileStrengthLr = readNumber("laboratoryLrInput", selectedTest.tensileStrengthLr);
  selectedTest.elongationPercent = readNumber("laboratoryElongationInput", selectedTest.elongationPercent);
  const certificateCodeInput = document.getElementById("laboratoryCertificateCodeInput");
  selectedTest.certificateCode = certificateCodeInput ? certificateCodeInput.value : selectedTest.certificateCode || "";
  selectedTest.supplierCertificateNumber = document.getElementById("laboratorySupplierCertificate")?.value || selectedTest.supplierCertificateNumber || "";
  selectedTest.notes = document.getElementById("laboratoryNotesInput")?.value || selectedTest.notes || "";
  selectedTest.status = document.getElementById("laboratoryStatusInput")?.value || selectedTest.status || "Aprovado";

  const parameter = technicalParameters.find((item) => item.id === selectedTest.technicalParameterId);
  if (parameter) {
    if (activeModal !== "edit" || selectedTest.parameterWasChanged) {
      selectedTest.nominalValue = parameter.baseValue;
      selectedTest.nominalUnit = parameter.unit;
      selectedTest.toleranceMode = parameter.toleranceMode;
      selectedTest.toleranceMinPercent = parameter.minTolerancePercent;
      selectedTest.toleranceMaxPercent = parameter.maxTolerancePercent;
      selectedTest.toleranceMinNumber = parameter.minToleranceNumber;
      selectedTest.toleranceMaxNumber = parameter.maxToleranceNumber;
    }
    if (activeModal !== "edit" || selectedTest.parameterWasChanged) {
      selectedTest.status = buildTolerancePreview(selectedTest, parameter).status;
    }
  }
}

function makeEmptyTest(lot) {
  return {
    lotId: lot?.id || "",
    materialId: lot?.materialId || "",
    materialTypeId: lot?.materialTypeId || "",
    supplierId: lot?.supplierId || "",
    testDate: getToday(),
    certificateCode: "",
    elongationPercent: "",
    supplierCertificateNumber: lot?.supplierCertificateNumber || "",
    status: "Aprovado"
  };
}

function hydrateSelectedTest(test) {
  if (!test) return null;
  const parameter = technicalParameters.find((item) => item.id === test.technicalParameterId);
  return {
    ...test,
    materialId: test.materialId || selectedLot?.materialId || "",
    materialTypeId: test.materialTypeId || selectedLot?.materialTypeId || "",
    supplierId: test.supplierId || selectedLot?.supplierId || "",
    nominalValue: coalesceNumber(test.nominalValue) ?? parameter?.baseValue ?? "",
    nominalUnit: test.nominalUnit || parameter?.unit || "",
    toleranceMode: test.toleranceMode || parameter?.toleranceMode || "percentual",
    toleranceMinPercent: coalesceNumber(test.toleranceMinPercent) ?? parameter?.minTolerancePercent ?? "",
    toleranceMaxPercent: coalesceNumber(test.toleranceMaxPercent) ?? parameter?.maxTolerancePercent ?? "",
    toleranceMinNumber: coalesceNumber(test.toleranceMinNumber) ?? parameter?.minToleranceNumber ?? "",
    toleranceMaxNumber: coalesceNumber(test.toleranceMaxNumber) ?? parameter?.maxToleranceNumber ?? "",
    certificateCode: test.certificateCode || "",
    elongationPercent: coalesceNumber(test.elongationPercent) ?? "",
    parameterWasChanged: false
  };
}

function calculateSavedTestStatus(test) {
  const parameter = technicalParameters.find((item) => item.id === test?.technicalParameterId);
  const hydrated = hydrateSelectedTest(test);
  if (!hydrated) return "Aprovado";
  return buildTolerancePreview(hydrated, parameter).status;
}

function buildTolerancePreview(form, parameter) {
  const nominal = coalesceNumber(form.nominalValue, parameter?.baseValue);
  const measured = coalesceNumber(form.measuredSpecificWeight);
  const range = buildToleranceRange(form, parameter, nominal);
  const hasMeasured = Number.isFinite(measured);
  const hasRange = Number.isFinite(nominal) && Number.isFinite(range.min) && Number.isFinite(range.max) && Boolean(parameter);
  const variation = Number.isFinite(nominal) && nominal !== 0 && hasMeasured ? ((measured - nominal) / nominal) * 100 : 0;
  const inTolerance = hasRange && hasMeasured ? measured >= range.min && measured <= range.max : true;
  const ratio = Number(form.yieldStrengthLe) && Number(form.tensileStrengthLr)
    ? Number(form.tensileStrengthLr) / Number(form.yieldStrengthLe)
    : 0;
  const marker = hasRange && hasMeasured ? calculateToleranceMarker(measured, range.min, nominal, range.max) : TOLERANCE_NOMINAL_PERCENT;
  const zoneClass = getToleranceZoneClass(measured, range.min, nominal, range.max, hasRange && hasMeasured);

  return {
    nominal: Number.isFinite(nominal) ? nominal : "",
    measured: hasMeasured ? measured : "",
    min: range.min,
    max: range.max,
    variation,
    ratio,
    marker,
    inTolerance,
    hasRange,
    zoneClass,
    status: inTolerance ? "Aprovado" : "Reprovado",
    rangeLabel: inTolerance ? "Dentro da tolerância" : "Fora da tolerância"
  };
}

function buildToleranceRange(form, parameter, nominal) {
  const mode = form.toleranceMode || parameter?.toleranceMode || "percentual";
  const numericMin = coalesceNumber(
    parameter?.minToleranceNumber,
    parameter?.minToleranceValue,
    parameter?.toleranceMinNumber,
    parameter?.toleranceMinValue,
    parameter?.tolerance_min_number,
    parameter?.tolerance_min_value,
    form.toleranceMinNumber,
    form.minToleranceNumber,
    form.minToleranceValue,
    form.toleranceMinValue,
    form.tolerance_min_number,
    form.tolerance_min_value
  );
  const numericMax = coalesceNumber(
    parameter?.maxToleranceNumber,
    parameter?.maxToleranceValue,
    parameter?.toleranceMaxNumber,
    parameter?.toleranceMaxValue,
    parameter?.tolerance_max_number,
    parameter?.tolerance_max_value,
    form.toleranceMaxNumber,
    form.maxToleranceNumber,
    form.maxToleranceValue,
    form.toleranceMaxValue,
    form.tolerance_max_number,
    form.tolerance_max_value
  );

  if (Number.isFinite(numericMin) && Number.isFinite(numericMax)) {
    return {
      min: numericMin,
      max: numericMax
    };
  }

  if (isNumericToleranceMode(mode)) {
    return {
      min: numericMin,
      max: numericMax
    };
  }

  const minPercent = coalesceNumber(form.toleranceMinPercent, parameter?.minTolerancePercent) || 0;
  const maxPercent = coalesceNumber(form.toleranceMaxPercent, parameter?.maxTolerancePercent) || 0;

  return {
    min: nominal ? nominal + (nominal * minPercent / 100) : 0,
    max: nominal ? nominal + (nominal * maxPercent / 100) : 0
  };
}

function calculateToleranceMarker(measured, min, nominal, max) {
  if (![measured, min, nominal, max].every(Number.isFinite)) return TOLERANCE_NOMINAL_PERCENT;
  if (max <= min || nominal <= min || nominal >= max) return TOLERANCE_NOMINAL_PERCENT;
  if (measured === nominal) return TOLERANCE_NOMINAL_PERCENT;

  if (measured >= min && measured <= nominal) {
    return clampPercent(
      TOLERANCE_START_PERCENT +
        ((measured - min) / (nominal - min)) * (TOLERANCE_NOMINAL_PERCENT - TOLERANCE_START_PERCENT)
    );
  }

  if (measured > nominal && measured <= max) {
    return clampPercent(
      TOLERANCE_NOMINAL_PERCENT +
        ((measured - nominal) / (max - nominal)) * (TOLERANCE_END_PERCENT - TOLERANCE_NOMINAL_PERCENT)
    );
  }

  const toleranceSpan = Math.max(max - min, Number.EPSILON);

  if (measured < min) {
    const visualMin = min - toleranceSpan * 0.35;
    return clampPercent(((measured - visualMin) / (min - visualMin)) * TOLERANCE_START_PERCENT);
  }

  const visualMax = max + toleranceSpan * 0.35;
  return clampPercent(
    TOLERANCE_END_PERCENT +
      ((measured - max) / (visualMax - max)) * (100 - TOLERANCE_END_PERCENT)
  );
}

function getToleranceZoneClass(measured, min, nominal, max, canEvaluate) {
  if (!canEvaluate) return "laboratory-tolerance-neutral";
  if (measured < min || measured > max) return "laboratory-tolerance-rejected";
  if (measured <= nominal) return "laboratory-tolerance-good";
  return "laboratory-tolerance-attention";
}

function isNumericToleranceMode(mode = "") {
  return ["numeral", "numerica", "numérica", "numeric", "number"].includes(String(mode).toLowerCase());
}

function coalesceNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = toNumber(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return TOLERANCE_NOMINAL_PERCENT;
  return Math.max(0, Math.min(100, value));
}

function updateLaboratoryLivePreview() {
  if (!selectedTest) return;
  const parameter = technicalParameters.find((item) => item.id === selectedTest.technicalParameterId);
  const preview = buildTolerancePreview(selectedTest, parameter);
  const card = document.querySelector(".laboratory-tolerance-card");
  const range = document.getElementById("laboratoryToleranceRange");
  const status = document.getElementById("laboratoryToleranceStatus");
  const marker = document.getElementById("laboratoryToleranceMarker");
  const min = document.getElementById("laboratoryToleranceMin");
  const nominal = document.getElementById("laboratoryToleranceNominal");
  const measured = document.getElementById("laboratoryToleranceMeasured");
  const variation = document.getElementById("laboratoryToleranceVariation");
  const max = document.getElementById("laboratoryToleranceMax");
  const ratio = document.getElementById("laboratoryRatioPreview");
  const statusInput = document.getElementById("laboratoryStatusInput");
  const resultHint = document.getElementById("laboratoryResultHint");

  if (range) {
    range.textContent = preview.hasRange
      ? `${formatToleranceNumber(preview.min)} → ${formatNominalNumber(preview.nominal)} → ${formatToleranceNumber(preview.max)}`
      : "Selecione parâmetro e informe medição";
  }
  if (status) {
    status.textContent = preview.rangeLabel;
    status.className = preview.inTolerance ? "laboratory-ok" : "laboratory-out";
  }
  if (card) {
    card.classList.remove("laboratory-tolerance-neutral", "laboratory-tolerance-good", "laboratory-tolerance-attention", "laboratory-tolerance-rejected");
    card.classList.add(preview.zoneClass);
  }
  if (marker) marker.style.left = `${preview.marker}%`;
  if (min) min.textContent = `Mínimo ${formatToleranceNumber(preview.min)}`;
  if (nominal) nominal.textContent = `Nominal ${formatNominalNumber(preview.nominal)}`;
  if (measured) measured.textContent = `Medido ${formatNumber(preview.measured)}`;
  if (variation) variation.textContent = `Variação ${formatSignedPercent(preview.variation)}`;
  if (max) max.textContent = `Máximo ${formatToleranceNumber(preview.max)}`;
  if (ratio) ratio.value = formatNumber(preview.ratio);
  if (resultHint) {
    resultHint.textContent = preview.hasRange
      ? `Calculado pela faixa de tolerância: ${preview.rangeLabel}.`
      : "Selecione o resultado para concluir o ensaio.";
  }
  if (parameter && statusInput && (activeModal !== "edit" || selectedTest.parameterWasChanged)) {
    statusInput.value = preview.status;
    selectedTest.status = preview.status;
  }
}

function updateLaboratoryFileNote() {
  const note = document.getElementById("laboratoryFileNote");
  if (!note) return;
  note.textContent = `Arquivo atual: ${selectedCertificateFile?.name || selectedTest?.certificateFileName || "nenhum arquivo selecionado"}`;
}

function applyParameterToSelectedTest(parameter) {
  if (!selectedTest || !parameter) return;
  selectedTest.nominalValue = parameter.baseValue;
  selectedTest.nominalUnit = parameter.unit;
  selectedTest.toleranceMode = parameter.toleranceMode;
  selectedTest.toleranceMinPercent = parameter.minTolerancePercent;
  selectedTest.toleranceMaxPercent = parameter.maxTolerancePercent;
  selectedTest.toleranceMinNumber = parameter.minToleranceNumber;
  selectedTest.toleranceMaxNumber = parameter.maxToleranceNumber;
  selectedTest.technicalParameterId = parameter.id;
}

function clearParameterFromSelectedTest() {
  if (!selectedTest) return;
  selectedTest.nominalValue = "";
  selectedTest.nominalUnit = "";
  selectedTest.toleranceMode = "";
  selectedTest.toleranceMinPercent = "";
  selectedTest.toleranceMaxPercent = "";
  selectedTest.toleranceMinNumber = "";
  selectedTest.toleranceMaxNumber = "";
}

function updateMaterialSelectOptions() {
  const materialSelect = document.getElementById("laboratoryMaterialInput");
  if (!materialSelect || !selectedTest) return;

  const filteredMaterials = getMaterialsForSelectedType(selectedTest);
  materialSelect.disabled = !filteredMaterials.length;
  materialSelect.innerHTML = `
    <option value="">${escapeHtml(getMaterialPlaceholder(selectedTest.materialTypeId, filteredMaterials.length))}</option>
    ${filteredMaterials.map((material) => `
      <option value="${material.id}">
        ${escapeHtml(material.code ? `${material.code} - ${material.name}` : material.name)}
      </option>
    `).join("")}
  `;
  materialSelect.value = selectedTest.materialId || "";
}

function updateParameterSelectOptions() {
  const parameterSelect = document.getElementById("laboratoryParameterInput");
  if (!parameterSelect || !selectedTest) return;

  const selectedMaterialId = selectedTest.materialId || getCompatibleMaterialId(selectedTest);
  const parametersForMaterial = getParametersForSelectedMaterial({ ...selectedTest, materialId: selectedMaterialId });
  parameterSelect.disabled = !selectedMaterialId;
  parameterSelect.innerHTML = `
    <option value="">${selectedMaterialId ? "Selecione um parâmetro" : "Selecione o material primeiro"}</option>
    ${parametersForMaterial.map((item) => `
      <option value="${item.id}">${escapeHtml(item.name)}</option>
    `).join("")}
  `;
  parameterSelect.value = selectedParameterId || selectedTest.technicalParameterId || "";
}

function updateParameterDependentFields(parameter) {
  const nominalInput = document.getElementById("laboratoryNominalValueInput");
  const unitInput = document.getElementById("laboratoryNominalUnitInput");
  const warning = document.querySelector(".laboratory-warning");

  if (nominalInput) nominalInput.value = formatNominalInputNumber(parameter?.baseValue ?? "");
  if (unitInput) {
    unitInput.value = parameter?.unit || selectedTest?.nominalUnit || "";
    unitInput.disabled = Boolean(parameter);
  }
  if (warning) warning.classList.toggle("hidden", Boolean(parameter));
}

function getParametersForSelectedMaterial(form) {
  const materialId = form.materialId || getCompatibleMaterialId(form);
  const material = materials.find((item) => item.id === materialId);
  return technicalParameters.filter((parameter) => {
    return parameter.materialId === materialId || parameter.material === material?.name || !parameter.materialId;
  });
}

function getSelectedMaterialTypeId(form) {
  return document.getElementById("laboratoryMaterialTypeInput")?.value || form.materialTypeId || selectedLot?.materialTypeId || "";
}

function getMaterialsForSelectedType(form) {
  const typeId = getSelectedMaterialTypeId(form);
  if (!typeId) return [];
  return materials.filter((material) => material.materialTypeId === typeId);
}

function getCompatibleMaterialId(form) {
  const typeId = getSelectedMaterialTypeId(form);
  const materialId = document.getElementById("laboratoryMaterialInput")?.value || form.materialId || selectedLot?.materialId || "";
  const material = materials.find((item) => item.id === materialId);
  return material && material.materialTypeId === typeId ? material.id : "";
}

function getMaterialPlaceholder(typeId, materialCount) {
  if (!typeId) return "Selecione o tipo primeiro";
  if (!materialCount) return "Nenhum material cadastrado para este tipo";
  return "Selecione o material";
}

function applySorting(lots) {
  const direction = sortState.direction === "asc" ? 1 : -1;
  return [...lots].sort((a, b) => {
    const left = getSortValue(a, sortState.key);
    const right = getSortValue(b, sortState.key);
    if (left < right) return -1 * direction;
    if (left > right) return 1 * direction;
    return String(a.lotCode || "").localeCompare(String(b.lotCode || ""), "pt-BR", { numeric: true });
  });
}

function getSortValue(lot, key) {
  if (key === "totalTests") return Number(lot.totalTests || 0);
  if (key === "entryDate") return String(lot.entryDate || "");
  return String(lot[key] || "").toLocaleLowerCase("pt-BR");
}

function hasCertificate(item) {
  return Boolean(item?.certificateFileUrl || item?.certificate_file_url || item?.certificateFileName || item?.certificate_file_name);
}

function openLaboratoryCertificate(fileUrl, fileName) {
  const url = String(fileUrl || "").trim();
  if (url) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return;
  }

  if (fileName) {
    showLaboratoryNotice("warning", "PDF sem URL", "Arquivo registrado, mas ainda sem URL de armazenamento.");
  }
}

function showLaboratoryNotice(type, title, message) {
  laboratoryNotice = { type, title, message };
  const currentNotice = document.getElementById("laboratoryNotice");
  const modalHeader = document.querySelector(".laboratory-modal .modal-header");
  const shell = document.querySelector(".laboratory-shell");
  const html = renderNotice();

  if (currentNotice) {
    currentNotice.outerHTML = html;
  } else if (modalHeader) {
    modalHeader.insertAdjacentHTML("afterend", html);
  } else if (shell) {
    shell.insertAdjacentHTML("afterbegin", html);
  }
}

function applyFilters(lots) {
  const search = filters.search.trim().toLowerCase();
  return lots.filter((lot) => {
    const haystack = [
      lot.lotCode,
      lot.materialName,
      lot.supplierName,
      lot.supplierCertificateNumber,
      lot.laboratoryCertificateCodes,
      lot.laboratoryStatus
    ].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (filters.status !== "Todos" && lot.laboratoryStatus !== filters.status) return false;
    if (filters.typeId && lot.materialTypeId !== filters.typeId) return false;
    if (filters.from && String(lot.entryDate || "") < filters.from) return false;
    if (filters.to && String(lot.entryDate || "") > filters.to) return false;
    return true;
  });
}

function buildSummary(lots) {
  return lots.reduce((summary, lot) => {
    const status = lot.laboratoryStatus || "Não ensaiado";
    if (status === "Não ensaiado") summary.pending += 1;
    if (status === "Aprovado") summary.approved += 1;
    if (status === "Reprovado") summary.rejected += 1;
    summary.tests += Number(lot.totalTests || 0);
    return summary;
  }, { pending: 0, approved: 0, rejected: 0, tests: 0 });
}

function normalizeMaterial(material) {
  return {
    id: material.id,
    code: material.code || "",
    name: material.name || "",
    materialTypeId: material.materialTypeId || "",
    type: material.type || "",
    status: material.status || "Ativo"
  };
}

function normalizeParameter(parameter) {
  return {
    id: parameter.id,
    name: parameter.name || "",
    materialId: parameter.materialId || "",
    material: parameter.material || "",
    unit: parameter.unit || "",
    baseValue: toNumber(parameter.baseValue),
    toleranceMode: parameter.toleranceMode || "percentual",
    minTolerancePercent: toNumber(parameter.minTolerancePercent),
    maxTolerancePercent: toNumber(parameter.maxTolerancePercent),
    minToleranceNumber: coalesceNumber(
      parameter.minToleranceNumber,
      parameter.minToleranceValue,
      parameter.toleranceMinNumber,
      parameter.toleranceMinValue,
      parameter.tolerance_min_number,
      parameter.tolerance_min_value
    ),
    maxToleranceNumber: coalesceNumber(
      parameter.maxToleranceNumber,
      parameter.maxToleranceValue,
      parameter.toleranceMaxNumber,
      parameter.toleranceMaxValue,
      parameter.tolerance_max_number,
      parameter.tolerance_max_value
    )
  };
}

function getStatusBadgeClass(status = "") {
  if (status === "Aprovado" || status === "Dentro da tolerância") return "badge-success";
  if (status === "Reprovado" || status === "Fora da tolerância") return "badge-danger";
  if (status === "Cancelado") return "badge-danger";
  if (status === "Reprocessado") return "badge-info";
  return "badge-warning";
}

function closeModal() {
  activeModal = null;
  selectedLot = null;
  selectedTest = null;
  lotTests = [];
  selectedCertificateFile = null;
  selectedParameterId = "";
  pendingLaboratoryConfirmation = null;
  rerenderLaboratorio();
}

function rerenderLaboratorio() {
  const content = document.getElementById("appContent");
  if (!content) return;
  content.innerHTML = `
    <div class="page-header">
      <h1>${laboratorioPage.title}</h1>
      <p>${laboratorioPage.subtitle}</p>
    </div>
    ${laboratorioPage.render()}
  `;
  setupLaboratorioEvents();
}

function readNumber(id, fallback = "") {
  const value = document.getElementById(id)?.value;
  if (value === "" || value === undefined) return fallback ?? "";
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : "";
}

function formatNumber(value) {
  if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatNominalNumber(value) {
  return formatFixedDecimal(value, 3);
}

function formatToleranceNumber(value) {
  return formatFixedDecimal(value, 4);
}

function formatFixedDecimal(value, digits) {
  if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function formatSignedPercent(value) {
  if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("pt-BR", {
    maximumFractionDigits: 2,
    signDisplay: "exceptZero"
  })}%`;
}

function formatPercentValue(value) {
  if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
}

function formatInputNumber(value) {
  if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return String(value);
}

function formatNominalInputNumber(value) {
  if (value === "" || value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return Number(value).toFixed(3);
}

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function renderOptions(options, selected) {
  return options.map((option) => `<option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${escapeHtml(option)}</option>`).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
