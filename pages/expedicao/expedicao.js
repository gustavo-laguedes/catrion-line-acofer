import { lineStore, getActiveItems } from "../../shared/data-store.js";
import { buildStockSnapshot } from "../../shared/stock-engine.js";
import { apiGet, apiPost } from "../../shared/api-client.js";

const DRAFT_KEY = "line_expedition_draft";

let activeExpeditionTab = "NEW";
let expeditionDraft = createExpeditionDraft();
let apiStockSnapshot = null;
let hasLoadedReferences = false;
let pendingConfirmation = null;
let expeditionNotice = null;
let finalizedExpeditionPackage = null;
let selectedHistoryRecordId = null;
let isHistoryDetailEditing = false;
let historyFilters = {
  search: "",
  date: "",
  status: "Todos"
};
let historySort = {
  field: "dateTime",
  direction: "desc"
};

export const expedicaoPage = {
  title: "Expedição",
  subtitle: "Separação, carregamento e saída rastreável de materiais.",
  render: renderExpedicao,
  afterRender: setupExpedicaoEvents
};

function createExpeditionDraft() {
  return {
    id: crypto.randomUUID(),
    dateTime: getLocalDateValue(),
    summaryDateTime: "",
    responsibleUser: "",
    locationName: "",
    vehicleId: "",
    orders: [createOrderDraft(1)]
  };
}

function createOrderDraft(sequence) {
  return {
    id: crypto.randomUUID(),
    sequence,
    number: "",
    status: "Em edição",
    isOpen: true,
    materials: [createMaterialDraft()]
  };
}

function createMaterialDraft() {
  return {
    id: crypto.randomUUID(),
    materialId: "",
    materialName: "",
    lotSelections: {}
  };
}

function renderExpedicao() {
  restoreDraft();

  return `
    <div class="production-tabs">
      <button class="production-tab ${activeExpeditionTab === "NEW" ? "active" : ""}" data-expedition-tab="NEW" type="button">
        Novo carregamento
      </button>

      <button class="production-tab ${activeExpeditionTab === "HISTORY" ? "active" : ""}" data-expedition-tab="HISTORY" type="button">
        Histórico
      </button>
    </div>

    ${activeExpeditionTab === "NEW" ? renderNewExpedition() : renderExpeditionHistory()}
    ${renderPendingModal()}
    ${renderFinalizedModal()}
    ${renderHistoryDetailModal()}
    ${renderExpeditionNotice()}
  `;
}

function renderNewExpedition() {
  const selectedLotsCount = getSelectedLots(expeditionDraft).length;

  return `
    <div class="card production-card expedition-card">
      <div class="table-header">
        <div>
          <h2>Novo carregamento</h2>
          <p>Estruture pedidos, materiais e lotes antes da confirmação operacional.</p>
        </div>

        <div class="expedition-draft-actions">
          <span class="badge badge-info">Draft salvo automaticamente</span>
          <button id="clearExpeditionDraftBtn" class="danger-btn" type="button">Limpar carregamento</button>
        </div>
      </div>

      <div class="form-grid expedition-header-grid">
        <label>
          Data
          <input id="expeditionDateTime" type="date" value="${escapeAttr(getDraftDateValue(expeditionDraft.dateTime))}" />
        </label>

        <label>
          Local da expedição
          <select id="expeditionLocation">
            ${renderLocationOptions(expeditionDraft.locationName)}
          </select>
        </label>

        <label>
          Caminhão
          <select id="expeditionVehicle">
            ${renderVehicleOptions(expeditionDraft.vehicleId)}
          </select>
        </label>

      </div>

      <div class="production-consumption-box expedition-orders-box">
        <div class="production-model-preview-header">
          <div>
            <h3>Pedidos do carregamento</h3>
            <p>O carregamento já nasce preparado para pedido, materiais e lotes.</p>
          </div>
          <button id="addExpeditionOrderBtn" class="secondary-btn" type="button">Adicionar pedido</button>
        </div>

        <div class="expedition-order-list">
          ${expeditionDraft.orders.map(renderOrderBlock).join("")}
        </div>
      </div>

      <div class="expedition-final-bar">
        <div>
          <strong>${expeditionDraft.orders.length}</strong> pedido(s)
          <span>${selectedLotsCount} lote(s) marcado(s)</span>
        </div>

        <div class="modal-footer-actions">
          <button id="finishExpeditionBtn" class="primary-btn" type="button">Finalizar carregamento</button>
        </div>
      </div>
    </div>
  `;
}

function renderOrderBlock(order, orderIndex) {
  const isSaved = order.status === "Salvo";
  const isOpen = order.isOpen !== false;
  const statusClass = isSaved ? "badge-success" : "badge-warning";

  return `
    <div class="production-lot-card expedition-order-card ${isOpen ? "is-open" : "is-collapsed"}" data-order-id="${escapeAttr(order.id)}">
      <div class="production-lot-card-header expedition-order-header" data-toggle-order-id="${escapeAttr(order.id)}">
        <button class="expedition-order-toggle" data-toggle-order-id="${escapeAttr(order.id)}" type="button" aria-label="${isOpen ? "Recolher pedido" : "Expandir pedido"}">
          ${isOpen ? "⌃" : "⌄"}
        </button>

        <div class="expedition-order-title">
          <h4>Pedido ${orderIndex + 1}</h4>
          <p>${escapeHtml(order.number || "Número ainda não informado")}</p>
        </div>

        <div class="expedition-order-header-actions">
          <span class="badge ${statusClass}">${escapeHtml(order.status)}</span>
          <button class="secondary-btn save-expedition-order-btn" data-order-id="${escapeAttr(order.id)}" type="button">Salvar pedido</button>
          ${isSaved ? `<button class="secondary-btn edit-expedition-order-btn" data-order-id="${escapeAttr(order.id)}" type="button">Editar pedido</button>` : ""}
          <button class="danger-btn delete-expedition-order-btn" data-order-id="${escapeAttr(order.id)}" type="button">Excluir pedido</button>
        </div>
      </div>

      <div class="expedition-order-body">
        <div class="form-grid expedition-order-form">
          <label class="expedition-order-number-line">
            <span>Número do pedido</span>
            <input class="expedition-order-number" data-order-id="${escapeAttr(order.id)}" type="text" value="${escapeAttr(order.number)}" placeholder="Ex: PED-001" />
            <button class="secondary-btn add-expedition-material-btn" data-order-id="${escapeAttr(order.id)}" type="button">Adicionar material</button>
          </label>
        </div>

        <div class="expedition-material-list">
          ${order.materials.map((materialDraft) => renderMaterialBlock(order, materialDraft)).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderMaterialBlock(order, materialDraft) {
  const lots = getAvailableLotsForMaterial(materialDraft.materialId, materialDraft.materialName, {
    orderId: order.id,
    materialDraftId: materialDraft.id
  });
  const selectedCount = Object.values(materialDraft.lotSelections || {}).filter((selection) => selection.selected).length;

  return `
    <div class="production-consumed-material-card expedition-material-card" data-order-id="${escapeAttr(order.id)}" data-material-draft-id="${escapeAttr(materialDraft.id)}">
      <div class="production-consumed-material-head">
        <div>
          <h4>Material</h4>
          <p>${materialDraft.materialName ? escapeHtml(materialDraft.materialName) : "Selecione um material permitido para expedição."}</p>
        </div>
        <span class="badge badge-info">${selectedCount}/${lots.length} lotes</span>
      </div>

      <div class="form-grid expedition-material-select-grid">
        <label>
          Selecionar material
          <select class="expedition-material-select" data-order-id="${escapeAttr(order.id)}" data-material-draft-id="${escapeAttr(materialDraft.id)}">
            ${renderMaterialOptions(materialDraft.materialId)}
          </select>
        </label>

        ${order.materials.length > 1 ? `<button class="secondary-btn remove-expedition-material-btn" data-order-id="${escapeAttr(order.id)}" data-material-draft-id="${escapeAttr(materialDraft.id)}" type="button">Remover material</button>` : ""}
        <button class="primary-btn save-expedition-material-btn" data-order-id="${escapeAttr(order.id)}" data-material-draft-id="${escapeAttr(materialDraft.id)}" type="button">Salvar material</button>
      </div>

      ${renderLotsArea(order, materialDraft, lots)}
    </div>
  `;
}

function renderLotsArea(order, materialDraft, lots) {
  if (!expeditionDraft.locationName) {
    return `
      <div class="production-preview-empty compact-production-empty">
        Selecione o local da expedição para carregar os lotes disponíveis.
      </div>
    `;
  }

  if (!materialDraft.materialId) {
    return `
      <div class="production-preview-empty compact-production-empty">
        Selecione um material para visualizar a estrutura de lotes.
      </div>
    `;
  }

  if (!lots.length) {
    return `
      <div class="production-preview-empty compact-production-empty">
        Nenhum lote disponível para este material no local selecionado.
      </div>
    `;
  }

  return `
    <div class="production-lot-table expedition-lot-table">
      <div class="production-lot-table-head">
        <span>Lote</span>
        <span>Local</span>
        <span>Qtd. principal</span>
        <span>Qtd. secundária</span>
        <span>Data</span>
        <span>Origem</span>
        <span>Selecionar</span>
      </div>

      ${lots.map((lot) => renderLotRow(order, materialDraft, lot)).join("")}
    </div>
  `;
}

function renderLotRow(order, materialDraft, lot) {
  const key = getLotSelectionKey(lot);
  const selection = materialDraft.lotSelections?.[key] || {};
  const selected = Boolean(selection.selected);
  const loadedQuantity = Number(selection.loadedQuantity || 0);
  const secondaryLoaded = selected && loadedQuantity > 0 ? calculateSecondaryLoaded(lot, loadedQuantity) : null;
  const validation = selected ? validateLotSelection({ ...selection, availableQuantity: lot.availableQuantity, quantity: lot.quantity }) : { valid: true };

  return `
    <label class="production-lot-row expedition-lot-row ${selected ? "selected" : ""} ${validation.valid ? "" : "invalid"}" data-order-id="${escapeAttr(order.id)}" data-material-draft-id="${escapeAttr(materialDraft.id)}" data-lot-key="${escapeAttr(key)}">
      <div>
        <strong>${escapeHtml(lot.lotCode || "-")}</strong>
        <small>${escapeHtml(lot.origin || "Origem não informada")}</small>
      </div>
      <div>${escapeHtml(lot.locationName || "-")}</div>
      <div class="expedition-operational-primary">${formatNumber(lot.availableQuantity ?? lot.quantity)} ${escapeHtml(lot.unit || "")}</div>
      <div class="expedition-operational-secondary">${lot.secondaryUnit ? `${formatNumber(lot.secondaryQuantity)} ${escapeHtml(lot.secondaryUnit)}` : "-"}</div>
      <div>${formatDateOnly(lot.productionDate || lot.createdAt)}</div>
      <div>${escapeHtml(lot.origin || "-")}</div>
      <div class="expedition-lot-selection">
        <input
          class="expedition-lot-checkbox"
          data-order-id="${escapeAttr(order.id)}"
          data-material-draft-id="${escapeAttr(materialDraft.id)}"
          data-lot-key="${escapeAttr(key)}"
          type="checkbox"
          ${selected ? "checked" : ""}
        />
        ${
          selected
            ? `
              <input class="expedition-loaded-quantity ${validation.valid ? "" : "invalid"}" data-order-id="${escapeAttr(order.id)}" data-material-draft-id="${escapeAttr(materialDraft.id)}" data-lot-key="${escapeAttr(key)}" type="number" min="0" step="0.001" value="${escapeAttr(selection.loadedQuantity || "")}" placeholder="Quantidade carregada" />
              <small class="expedition-secondary-loaded">
                Sec.: ${secondaryLoaded !== null && lot.secondaryUnit ? `${formatNumber(secondaryLoaded)} ${escapeHtml(lot.secondaryUnit)}` : "-"}
              </small>
              <small class="expedition-lot-error ${validation.valid ? "hidden" : ""}">${validation.valid ? "" : escapeHtml(validation.message)}</small>
            `
            : ""
        }
      </div>
    </label>
  `;
}

function renderExpeditionHistory() {
  const records = getFilteredHistory();

  return `
    <div class="card production-card">
      <div class="table-header">
        <div>
          <h2>Histórico de expedição</h2>
          <p>Carregamentos confirmados, cancelados e reprocessados no sistema.</p>
        </div>
      </div>

      ${renderHistoryFilters()}
      ${records.length ? renderHistoryTable(records) : renderEmptyHistory()}
    </div>
  `;
}

function renderHistoryFilters() {
  return `
    <div class="stock-filters production-history-filters">
      <label class="stock-search">
        Buscar
        <input id="expeditionHistorySearch" type="text" placeholder="Pedido, lote, material, caminhão ou local..." value="${escapeAttr(historyFilters.search)}" />
      </label>

      <label>
        Data
        <input id="expeditionHistoryDate" type="date" value="${escapeAttr(historyFilters.date)}" />
      </label>

      <label>
        Status
        <select id="expeditionHistoryStatus">
          ${["Todos", "Processado", "Cancelado", "Reprocessado"].map((status) => `
            <option value="${status}" ${status === historyFilters.status ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderHistoryTable(records) {
  return `
    <div class="data-table-wrap">
      <table class="data-table expedition-history-table">
        <thead>
          <tr>
            <th class="sortable-column" data-expedition-sort="dateTime">Data ${renderHistorySortIcon("dateTime")}</th>
            <th class="sortable-column" data-expedition-sort="locationName">Local ${renderHistorySortIcon("locationName")}</th>
            <th class="sortable-column" data-expedition-sort="vehicleName">Caminhão ${renderHistorySortIcon("vehicleName")}</th>
            <th class="sortable-column" data-expedition-sort="responsibleUser">Responsável ${renderHistorySortIcon("responsibleUser")}</th>
            <th class="sortable-column" data-expedition-sort="orders">Pedidos ${renderHistorySortIcon("orders")}</th>
            <th class="sortable-column" data-expedition-sort="materials">Materiais ${renderHistorySortIcon("materials")}</th>
            <th>Certificados</th>
            <th class="sortable-column" data-expedition-sort="status">Status ${renderHistorySortIcon("status")}</th>
            <th>Visualizar</th>
          </tr>
        </thead>
        <tbody>
          ${records.map((record) => `
            <tr class="${record.status === "Cancelado" ? "production-history-row-canceled" : ""}">
              <td>${formatDateTime(record.dateTime)}</td>
              <td>${escapeHtml(record.locationName || "-")}</td>
              <td>${escapeHtml(record.vehicleName || "-")}</td>
              <td>${escapeHtml(record.responsibleUser || getCurrentResponsibleUser() || "-")}</td>
              <td class="expedition-history-list-cell">${escapeHtml(getRecordOrderNumbers(record))}</td>
              <td class="expedition-history-list-cell">${escapeHtml(getRecordMaterialNames(record))}</td>
              <td>${renderHistoryCertificateCell(record)}</td>
              <td><span class="badge ${getHistoryStatusClass(record.status)}">${escapeHtml(record.status || "Processado")}</span></td>
              <td>
                <div class="expedition-history-actions">
                  <button class="secondary-btn view-expedition-history-btn" data-history-id="${escapeAttr(record.id)}" type="button">Visualizar</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderHistorySortIcon(field) {
  if (historySort.field !== field) return `<span class="sort-icon">↕</span>`;
  return historySort.direction === "asc"
    ? `<span class="sort-icon active">▲</span>`
    : `<span class="sort-icon active">▼</span>`;
}
function renderFinalizedModal() {
  if (!finalizedExpeditionPackage) return "";
  const record = finalizedExpeditionPackage.expedition;
  const hasCertificatesToPrint = hasCertificatePackageContent(finalizedExpeditionPackage);

  return `
    <div class="modal-backdrop open">
      <div class="modal expedition-finished-modal">
        <div class="modal-header vertical">
          <div>
            <h2>Carregamento confirmado</h2>
            <p>${formatDateTime(record.dateTime)} · ${escapeHtml(record.locationName || "Local não informado")}</p>
          </div>
        </div>

        <div class="movement-detail-grid">
          <div><small>Pedidos</small><strong>${(record.orders || []).length}</strong></div>
          <div><small>Lotes expedidos</small><strong>${getSelectedLots(record).length}</strong></div>
          <div><small>Certificados</small><strong>${finalizedExpeditionPackage.certificates.length}</strong></div>
        </div>

        ${hasCertificatesToPrint ? `
          <div class="expedition-certificate-note">
            Certificados de qualidade vinculados pela rastreabilidade estão prontos para acompanhar a nota fiscal/pedido.
          </div>
        ` : ""}

        <div class="modal-footer between">
          <button class="secondary-btn" id="closeFinalizedExpeditionBtn" type="button">Fechar</button>
          ${hasCertificatesToPrint ? `<button class="primary-btn" id="printFinalizedCertificatesBtn" type="button">Imprimir certificados de qualidade</button>` : ""}
        </div>
      </div>
    </div>
  `;
}

function renderEmptyHistory() {
  return `
    <div class="empty-state small-empty">
      <div class="empty-icon">&#128666;</div>
      <h3>Nenhum carregamento confirmado</h3>
      <p>Os carregamentos confirmados nesta base aparecerão aqui.</p>
    </div>
  `;
}

function renderPendingModal() {
  if (!pendingConfirmation) return "";

  if (pendingConfirmation.type === "clear") {
    return renderAwareModal({
      title: "Limpar carregamento",
      message: "Você está prestes a apagar o rascunho atual do carregamento.",
      warning: "O draft local será removido e os dados preenchidos não serão restaurados.",
      awareId: "clearExpeditionAwareInput",
      cancelId: "cancelClearExpeditionBtn",
      confirmId: "confirmClearExpeditionBtn",
      confirmLabel: "Limpar carregamento"
    });
  }

  if (pendingConfirmation.type === "deleteOrder") {
    const order = expeditionDraft.orders.find((item) => item.id === pendingConfirmation.orderId);
    return renderAwareModal({
      title: "Excluir pedido",
      message: `Você está prestes a excluir o pedido <strong>${escapeHtml(order?.number || "sem número")}</strong>.`,
      warning: "Os materiais e lotes marcados dentro deste pedido serão removidos do draft.",
      awareId: "deleteOrderAwareInput",
      cancelId: "cancelDeleteOrderBtn",
      confirmId: "confirmDeleteOrderBtn",
      confirmLabel: "Confirmar exclusão"
    });
  }

  if (pendingConfirmation.type === "summary") {
    return renderSummaryModal(expeditionDraft, false);
  }

  if (pendingConfirmation.type === "historyStatus") {
    return renderHistoryStatusModal();
  }

  return "";
}

function renderHistoryStatusModal() {
  const record = getHistoryRecords().find((item) => item.id === pendingConfirmation.recordId);
  const isCancel = pendingConfirmation.nextStatus === "Cancelado";
  const title = isCancel ? "Cancelar carregamento" : "Reprocessar carregamento";
  const confirmLabel = isCancel ? "Cancelar carregamento" : "Reprocessar carregamento";

  return `
    <div class="modal-backdrop open ${isCancel ? "danger-backdrop" : "reprocess-backdrop"}">
      <div class="modal ${isCancel ? "danger-modal" : "reprocess-modal"} expedition-status-modal">
        <div class="${isCancel ? "delete-alert-icon" : "reprocess-alert-icon"}">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>${title}</h2>
            <p>${escapeHtml(record?.vehicleName || "Carregamento")} · ${formatDateTime(record?.dateTime)}</p>
          </div>
        </div>

        <div class="${isCancel ? "danger-warning-box" : "reprocess-warning-box"}">
          <strong>Atenção:</strong>
          <span>${isCancel
            ? "O registro será preservado, os saldos serão devolvidos ao estoque e o evento de estorno será registrado."
            : "A baixa será aplicada novamente nos lotes desta expedição. Se faltar saldo, nada será baixado."}</span>
        </div>

        ${isCancel ? `
          <label class="full-field expedition-status-reason">
            Motivo do cancelamento
            <textarea id="historyStatusReasonInput" placeholder="Informe o motivo obrigatório"></textarea>
          </label>
        ` : ""}

        <label class="aware-check">
          <input id="historyStatusAwareInput" type="checkbox" />
          Estou ciente e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="cancelHistoryStatusBtn" type="button">Fechar</button>
          <button class="${isCancel ? "danger-btn" : "success-btn"}" id="confirmHistoryStatusBtn" type="button" disabled>${confirmLabel}</button>
        </div>
      </div>
    </div>
  `;
}
function renderHistoryDetailModal() {
  if (!selectedHistoryRecordId) return "";
  const record = getHistoryRecords().find((item) => item.id === selectedHistoryRecordId);
  if (!record) return "";

  return renderSummaryModal(record, true, isHistoryDetailEditing);
}

function renderAwareModal({ title, message, warning, awareId, cancelId, confirmId, confirmLabel }) {
  return `
    <div class="modal-backdrop open danger-backdrop">
      <div class="modal danger-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>${title}</h2>
            <p>${message}</p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>${warning}</span>
        </div>

        <label class="aware-check">
          <input id="${awareId}" type="checkbox" />
          Estou ciente e desejo continuar.
        </label>

        <div class="modal-footer">
          <button class="secondary-btn" id="${cancelId}" type="button">Cancelar</button>
          <button class="danger-btn" id="${confirmId}" type="button" disabled>${confirmLabel}</button>
        </div>
      </div>
    </div>
  `;
}

function renderExpeditionNotice() {
  if (!expeditionNotice) return "";

  return `
    <div class="modal-backdrop open danger-backdrop expedition-alert-backdrop">
      <div class="modal danger-modal production-alert-modal">
        <div class="delete-alert-icon">⚠️</div>

        <div class="modal-header vertical">
          <div>
            <h2>${escapeHtml(expeditionNotice.title || "Expedição bloqueada")}</h2>
            <p>${escapeHtml(expeditionNotice.message || "Revise os dados do carregamento.")}</p>
          </div>
        </div>

        <div class="danger-warning-box">
          <strong>Atenção:</strong>
          <span>O rascunho foi preservado e nenhuma baixa parcial foi confirmada.</span>
        </div>

        <div class="modal-footer">
          <button class="primary-btn" id="closeExpeditionNoticeBtn" type="button">Entendi</button>
        </div>
      </div>
    </div>
  `;
}

function renderSummaryModal(record, readonly, editMode = false) {
  const summaryDateTime = formatDateTime(readonly ? record.dateTime : record.summaryDateTime || record.dateTime);
  const responsibleUser = record.responsibleUser || getCurrentResponsibleUser();
  const isHistoryDetail = Boolean(readonly);
  const isCanceled = record.status === "Cancelado";
  const title = isHistoryDetail
    ? (editMode ? "Editar carregamento" : "Visualizar carregamento")
    : "Resumo do carregamento";

  return `
    <div class="modal-backdrop open">
      <div class="modal large-modal expedition-summary-modal">
        <div class="modal-header">
          <div>
            <h2>${title}</h2>
            <p>${escapeHtml(summaryDateTime)} · ${escapeHtml(record.locationName || "Local não informado")}</p>
          </div>
          <button class="modal-close" id="${readonly ? "closeHistoryDetailBtn" : "closeExpeditionSummaryBtn"}" type="button">×</button>
        </div>

        <div class="movement-detail-grid">
          <div><small>Data/hora</small><strong>${escapeHtml(summaryDateTime)}</strong></div>
          <div><small>Local</small><strong>${escapeHtml(record.locationName || "-")}</strong></div>
          <div><small>Caminhão</small><strong>${escapeHtml(record.vehicleName || getVehicleName(record.vehicleId) || "-")}</strong></div>
          <div><small>Pedidos</small><strong>${escapeHtml(getRecordOrderNumbers(record))}</strong></div>
          <div><small>Usuário</small><strong>${escapeHtml(responsibleUser || "-")}</strong></div>
          ${isHistoryDetail ? `<div><small>Status</small><strong>${escapeHtml(record.status || "Processado")}</strong></div>` : ""}
        </div>

        <div class="movement-detail-section">
          <h3>Pedidos, materiais e lotes</h3>
          ${renderSummaryOrders(record)}
        </div>

        ${readonly ? renderLinkedCertificatesSection(record) : ""}

        <div class="modal-footer between">
          <button class="secondary-btn" id="${readonly ? "closeHistoryDetailFooterBtn" : "editExpeditionSummaryBtn"}" type="button">${readonly ? (editMode ? "Cancelar edição" : "Fechar") : "Editar"}</button>
          <div class="modal-footer-actions">
            ${readonly && !editMode ? `<button class="primary-btn" id="editHistoryDetailBtn" type="button">Editar</button>` : ""}
            ${readonly && editMode && !isCanceled ? `<button class="danger-btn" id="cancelHistoryDetailBtn" type="button">Cancelar carregamento</button>` : ""}
            ${readonly && editMode && isCanceled ? `<button class="success-btn" id="reprocessHistoryDetailBtn" type="button">Reprocessar carregamento</button>` : ""}
            ${readonly ? "" : `<button class="primary-btn" id="confirmExpeditionSummaryBtn" type="button">Confirmar carregamento</button>`}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSummaryOrders(record) {
  return (record.orders || []).map((order, orderIndex) => `
    <div class="expedition-summary-order">
      <div class="expedition-summary-order-head">
        <div>
          <h4>Pedido ${orderIndex + 1}</h4>
          <p>${escapeHtml(order.number || "Sem número")}</p>
        </div>
        <span class="badge ${order.status === "Cancelado" ? "badge-danger" : "badge-success"}">${escapeHtml(order.status || "Salvo")}</span>
      </div>
      ${(order.materials || []).map((materialDraft) => {
        const selectedLots = getSelectedLots({ orders: [{ materials: [materialDraft] }] });
        return `
          <div class="expedition-summary-material">
            <div class="expedition-summary-material-head">
              <strong>${escapeHtml(materialDraft.materialName || "-")}</strong>
              <span>${selectedLots.length} lote(s)</span>
            </div>
            ${selectedLots.length ? `
              <div class="data-table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Lote</th>
                      <th>Local</th>
                      <th>Qtd. principal</th>
                      <th>Qtd. secundária</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${selectedLots.map((selection) => `
                      <tr>
                        <td><strong>${escapeHtml(selection.lotCode || "-")}</strong></td>
                        <td>${escapeHtml(selection.locationName || "-")}</td>
                        <td>${formatNumber(selection.loadedQuantity || 0)} ${escapeHtml(selection.unit || "")}</td>
                        <td>${selection.secondaryUnit ? `${formatNumber(getSelectionSecondaryLoaded(selection))} ${escapeHtml(selection.secondaryUnit)}` : "-"}</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              </div>
            ` : `<div class="production-preview-empty compact-production-empty">Nenhum lote marcado.</div>`}
          </div>
        `;
      }).join("")}
    </div>
  `).join("");
}

function renderLinkedCertificatesSection(record) {
  if (!hasRequiredCertificateMaterials(record)) return "";
  const certificatePackage = record.certificatePackage || filterCertificatePackageByParameters({
    expedition: record,
    certificates: [],
    lots: [],
    materials: [],
    relations: []
  }, record);

  return `
    <div class="movement-detail-section">
      <div class="table-header compact-table-header">
        <div>
          <h3>Certificados vinculados</h3>
        </div>
        ${certificatePackage.certificates.length ? `<button class="secondary-btn print-expedition-certificates-btn" data-history-id="${escapeAttr(record.id)}" type="button">Imprimir certificados</button>` : ""}
      </div>
      ${certificatePackage.certificates.length ? `
        <div class="expedition-linked-certificates">
          ${certificatePackage.certificates.map((certificate) => `
            <div class="expedition-linked-certificate">
              <div>
                <strong>${escapeHtml(certificate.certificateCode || "Certificado sem código")}</strong>
                <span>${escapeHtml(certificate.originalMaterialName || "-")} · lote ${escapeHtml(certificate.originalLotCode || "-")}</span>
              </div>
              <span class="badge ${certificate.status === "Aprovado" ? "badge-success" : "badge-warning"}">${escapeHtml(certificate.status || "-")}</span>
              <div class="expedition-linked-lots">
                ${(certificate.linkedLots || []).map((lot) => `<span>${escapeHtml(lot.shippedLotCode || "-")}</span>`).join("")}
              </div>
              ${certificate.certificateFileUrl ? `<a class="secondary-btn" href="${escapeAttr(certificate.certificateFileUrl)}" target="_blank" rel="noopener">PDF</a>` : `<span class="expedition-certificate-missing-url">Arquivo registrado, mas ainda sem URL de armazenamento.</span>`}
            </div>
          `).join("")}
        </div>
      ` : `
        <div class="production-preview-empty compact-production-empty">
          Nenhum certificado encontrado na árvore de rastreabilidade para os materiais com impressão automática.
        </div>
      `}
    </div>
  `;
}

function setupExpedicaoEvents(options = {}) {
  restoreDraft();
  const loadPromise = loadExpeditionReferences(Boolean(options.navigation));

  document.querySelectorAll("[data-expedition-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeExpeditionTab = button.dataset.expeditionTab;
      rerenderExpedicao();
    });
  });

  setupNewExpeditionEvents();
  setupHistoryEvents();
  setupModalEvents();

  return loadPromise;
}

function setupNewExpeditionEvents() {
  document.getElementById("expeditionDateTime")?.addEventListener("change", (event) => {
    expeditionDraft.dateTime = event.target.value;
    persistDraft();
  });

  document.getElementById("expeditionLocation")?.addEventListener("change", (event) => {
    expeditionDraft.locationName = event.target.value;
    clearAllLotSelections();
    persistDraft();
    rerenderExpedicao();
  });

  document.getElementById("expeditionVehicle")?.addEventListener("change", (event) => {
    expeditionDraft.vehicleId = event.target.value;
    persistDraft();
  });

  document.getElementById("addExpeditionOrderBtn")?.addEventListener("click", () => {
    expeditionDraft.orders.push(createOrderDraft(expeditionDraft.orders.length + 1));
    persistDraft();
    rerenderExpedicao();
  });

  document.getElementById("clearExpeditionDraftBtn")?.addEventListener("click", () => {
    pendingConfirmation = { type: "clear" };
    rerenderExpedicao();
  });

  document.getElementById("finishExpeditionBtn")?.addEventListener("click", () => {
    const validation = validateDraft();
    if (!validation.valid) {
      showExpeditionNotice("Carregamento incompleto", validation.message);
      return;
    }

    expeditionDraft.summaryDateTime = getCurrentLocalDateTimeValue();
    expeditionDraft.responsibleUser = getCurrentResponsibleUser();
    persistDraft();
    pendingConfirmation = { type: "summary" };
    rerenderExpedicao();
  });

  document.querySelectorAll(".expedition-order-number").forEach((input) => {
    input.addEventListener("input", () => {
      const order = findOrder(input.dataset.orderId);
      if (!order) return;
      order.number = input.value;
      order.status = "Em edição";
      order.isOpen = true;
      persistDraft();
    });
  });

  document.querySelectorAll(".expedition-order-header[data-toggle-order-id]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target.closest("button") && !event.target.closest(".expedition-order-toggle")) return;
      const order = findOrder(element.dataset.toggleOrderId);
      if (!order) return;
      order.isOpen = order.isOpen === false;
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".save-expedition-order-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const order = findOrder(button.dataset.orderId);
      if (!order) return;
      order.status = "Salvo";
      order.isOpen = false;
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".edit-expedition-order-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const order = findOrder(button.dataset.orderId);
      if (!order) return;
      order.status = "Em edição";
      order.isOpen = true;
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".delete-expedition-order-btn").forEach((button) => {
    button.addEventListener("click", () => {
      pendingConfirmation = { type: "deleteOrder", orderId: button.dataset.orderId };
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".add-expedition-material-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const order = findOrder(button.dataset.orderId);
      if (!order) return;
      order.materials.push(createMaterialDraft());
      order.isOpen = true;
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".remove-expedition-material-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const order = findOrder(button.dataset.orderId);
      if (!order) return;
      order.materials = order.materials.filter((materialDraft) => materialDraft.id !== button.dataset.materialDraftId);
      order.status = "Em edição";
      order.isOpen = true;
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".save-expedition-material-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const order = findOrder(button.dataset.orderId);
      const materialDraft = findMaterialDraft(button.dataset.orderId, button.dataset.materialDraftId);
      if (!order || !materialDraft) return;
      const validation = validateMaterialDraft(materialDraft, {
        orderId: button.dataset.orderId,
        materialDraftId: button.dataset.materialDraftId
      });
      if (!validation.valid) {
        showExpeditionNotice("Material não salvo", validation.message);
        return;
      }
      order.status = "Em edição";
      order.isOpen = true;
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".expedition-material-select").forEach((select) => {
    select.addEventListener("change", () => {
      const materialDraft = findMaterialDraft(select.dataset.orderId, select.dataset.materialDraftId);
      const material = getShippableMaterials().find((item) => getMaterialId(item) === select.value);
      if (!materialDraft) return;

      materialDraft.materialId = select.value;
      materialDraft.materialName = material?.name || "";
      materialDraft.lotSelections = {};
      const order = findOrder(select.dataset.orderId);
      if (order) {
        order.status = "Em edição";
        order.isOpen = true;
      }
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".expedition-lot-checkbox").forEach((input) => {
    input.addEventListener("change", () => {
      const materialDraft = findMaterialDraft(input.dataset.orderId, input.dataset.materialDraftId);
      const lot = getOperationalLotByKey(input.dataset.lotKey, {
        orderId: input.dataset.orderId,
        materialDraftId: input.dataset.materialDraftId
      });
      if (!materialDraft || !lot) return;

      materialDraft.lotSelections[input.dataset.lotKey] = {
        ...lot,
        selected: input.checked,
        loadedQuantity: input.checked ? materialDraft.lotSelections?.[input.dataset.lotKey]?.loadedQuantity || "" : "",
        secondaryQuantityLoaded: input.checked ? materialDraft.lotSelections?.[input.dataset.lotKey]?.secondaryQuantityLoaded ?? null : null
      };

      const order = findOrder(input.dataset.orderId);
      if (order) {
        order.status = "Em edição";
        order.isOpen = true;
      }
      persistDraft();
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".expedition-loaded-quantity").forEach((input) => {
    input.addEventListener("input", () => {
      const materialDraft = findMaterialDraft(input.dataset.orderId, input.dataset.materialDraftId);
      if (!materialDraft?.lotSelections?.[input.dataset.lotKey]) return;
      const selection = materialDraft.lotSelections[input.dataset.lotKey];
      selection.loadedQuantity = input.value;
      selection.secondaryQuantityLoaded = getSelectionSecondaryLoaded(selection);
      const order = findOrder(input.dataset.orderId);
      if (order) {
        order.status = "Em edição";
        order.isOpen = true;
      }
      const secondaryLabel = input.parentElement?.querySelector(".expedition-secondary-loaded");
      const errorLabel = input.parentElement?.querySelector(".expedition-lot-error");
      const operationalLot = getOperationalLotByKey(input.dataset.lotKey, {
        orderId: input.dataset.orderId,
        materialDraftId: input.dataset.materialDraftId
      }) || selection;
      selection.availableQuantity = operationalLot.availableQuantity;
      selection.quantity = operationalLot.quantity;
      selection.secondaryQuantity = operationalLot.secondaryQuantity;
      selection.primaryBalance = operationalLot.primaryBalance;
      selection.secondaryBalance = operationalLot.secondaryBalance;
      const secondaryLoaded = getSelectionSecondaryLoaded(selection);
      const lotValidation = validateLotSelection(selection);

      if (secondaryLabel) {
        secondaryLabel.textContent = `Sec.: ${secondaryLoaded !== null && selection.secondaryUnit ? `${formatNumber(secondaryLoaded)} ${selection.secondaryUnit}` : "-"}`;
      }

      if (errorLabel) {
        errorLabel.textContent = lotValidation.valid ? "" : lotValidation.message;
        errorLabel.classList.toggle("hidden", lotValidation.valid);
      }

      input.closest(".expedition-lot-row")?.classList.toggle("invalid", !lotValidation.valid);
      input.classList.toggle("invalid", !lotValidation.valid);
      persistDraft();
      refreshOperationalLotMirror(input.dataset.lotKey);
    });
  });
}

function setupHistoryEvents() {
  document.getElementById("expeditionHistorySearch")?.addEventListener("input", (event) => {
    historyFilters.search = event.target.value;
    rerenderExpedicao();
  });

  document.getElementById("expeditionHistoryDate")?.addEventListener("change", (event) => {
    historyFilters.date = event.target.value;
    rerenderExpedicao();
  });

  document.getElementById("expeditionHistoryStatus")?.addEventListener("change", (event) => {
    historyFilters.status = event.target.value;
    rerenderExpedicao();
  });

  document.querySelectorAll("[data-expedition-sort]").forEach((header) => {
    header.addEventListener("click", () => {
      const field = header.dataset.expeditionSort;
      historySort = {
        field,
        direction: historySort.field === field && historySort.direction === "asc" ? "desc" : "asc"
      };
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".view-expedition-history-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      await ensureRecordCertificatePackage(button.dataset.historyId);
      selectedHistoryRecordId = button.dataset.historyId;
      isHistoryDetailEditing = false;
      rerenderExpedicao();
    });
  });

  document.querySelectorAll(".print-expedition-certificates-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = await ensureRecordCertificatePackage(button.dataset.historyId);
      if (record?.certificatePackage) openCertificatesPreview(record.certificatePackage);
    });
  });

}

function setupModalEvents() {
  const clearAware = document.getElementById("clearExpeditionAwareInput");
  const clearConfirm = document.getElementById("confirmClearExpeditionBtn");
  clearAware?.addEventListener("change", () => {
    clearConfirm.disabled = !clearAware.checked;
  });
  clearConfirm?.addEventListener("click", () => {
    clearDraft();
    pendingConfirmation = null;
    rerenderExpedicao();
  });
  document.getElementById("cancelClearExpeditionBtn")?.addEventListener("click", closePendingModal);

  const deleteAware = document.getElementById("deleteOrderAwareInput");
  const deleteConfirm = document.getElementById("confirmDeleteOrderBtn");
  deleteAware?.addEventListener("change", () => {
    deleteConfirm.disabled = !deleteAware.checked;
  });
  deleteConfirm?.addEventListener("click", () => {
    expeditionDraft.orders = expeditionDraft.orders.filter((order) => order.id !== pendingConfirmation.orderId);
    if (!expeditionDraft.orders.length) expeditionDraft.orders = [createOrderDraft(1)];
    pendingConfirmation = null;
    persistDraft();
    rerenderExpedicao();
  });
  document.getElementById("cancelDeleteOrderBtn")?.addEventListener("click", closePendingModal);

  document.getElementById("closeExpeditionSummaryBtn")?.addEventListener("click", closePendingModal);
  document.getElementById("editExpeditionSummaryBtn")?.addEventListener("click", closePendingModal);
  document.getElementById("confirmExpeditionSummaryBtn")?.addEventListener("click", confirmExpedition);
  document.getElementById("closeFinalizedExpeditionBtn")?.addEventListener("click", closeFinalizedExpedition);
  document.getElementById("printFinalizedCertificatesBtn")?.addEventListener("click", () => {
    if (finalizedExpeditionPackage) openCertificatesPreview(finalizedExpeditionPackage);
  });

  document.getElementById("closeHistoryDetailBtn")?.addEventListener("click", closeHistoryDetail);
  document.getElementById("closeHistoryDetailFooterBtn")?.addEventListener("click", () => {
    if (!isHistoryDetailEditing) {
      closeHistoryDetail();
      return;
    }

    isHistoryDetailEditing = false;
    rerenderExpedicao();
  });
  document.getElementById("editHistoryDetailBtn")?.addEventListener("click", () => {
    isHistoryDetailEditing = true;
    rerenderExpedicao();
  });
  document.getElementById("cancelHistoryDetailBtn")?.addEventListener("click", () => {
    if (!selectedHistoryRecordId) return;
    pendingConfirmation = {
      type: "historyStatus",
      recordId: selectedHistoryRecordId,
      nextStatus: "Cancelado"
    };
    rerenderExpedicao();
  });
  document.getElementById("reprocessHistoryDetailBtn")?.addEventListener("click", () => {
    if (!selectedHistoryRecordId) return;
    pendingConfirmation = {
      type: "historyStatus",
      recordId: selectedHistoryRecordId,
      nextStatus: "Reprocessado"
    };
    rerenderExpedicao();
  });
  document.getElementById("closeExpeditionNoticeBtn")?.addEventListener("click", closeExpeditionNotice);

  const statusAware = document.getElementById("historyStatusAwareInput");
  const statusConfirm = document.getElementById("confirmHistoryStatusBtn");
  const statusReason = document.getElementById("historyStatusReasonInput");
  const refreshStatusConfirm = () => {
    const needsReason = pendingConfirmation?.nextStatus === "Cancelado";
    statusConfirm.disabled = !statusAware?.checked || (needsReason && !String(statusReason?.value || "").trim());
  };
  statusAware?.addEventListener("change", refreshStatusConfirm);
  statusReason?.addEventListener("input", refreshStatusConfirm);
  statusConfirm?.addEventListener("click", async () => {
    await changeHistoryRecordStatus();
  });
  document.getElementById("cancelHistoryStatusBtn")?.addEventListener("click", closePendingModal);
}

async function changeHistoryRecordStatus() {
  const action = pendingConfirmation?.nextStatus === "Cancelado" ? "cancel" : "reprocess";
  const recordId = pendingConfirmation?.recordId;
  const reason = String(document.getElementById("historyStatusReasonInput")?.value || "").trim();

  if (!recordId) return;
  if (action === "cancel" && !reason) {
    showExpeditionNotice("Motivo obrigatório", "Informe o motivo do cancelamento antes de continuar.");
    return;
  }

  try {
    const updated = await apiPost(`/api/expeditions/${recordId}/${action}`, { reason });
    const normalized = normalizeExpeditionRecord(updated);
    const records = getHistoryRecords().filter((record) => record.id !== recordId);
    records.unshift(normalized);
    persistHistory(records);
    await refreshStockSnapshot();
    pendingConfirmation = null;
    selectedHistoryRecordId = normalized.id;
    rerenderExpedicao();
  } catch (error) {
    showExpeditionNotice(
      action === "cancel" ? "Cancelamento não realizado" : "Reprocessamento bloqueado",
      getExpeditionErrorMessage(error)
    );
  }
}

async function loadExpeditionReferences(force = false) {
  if (hasLoadedReferences && !force) return;
  hasLoadedReferences = true;

  try {
    const [materials, locations, stock, vehicles, expeditionParameters] = await Promise.all([
      apiGet("/api/materials"),
      apiGet("/api/locations"),
      apiGet("/api/stock"),
      apiGet("/api/expedition-vehicles"),
      apiGet("/api/expedition-material-parameters")
    ]);

    lineStore.materials.splice(0, lineStore.materials.length, ...materials.map(normalizeMaterial));
    lineStore.locations.splice(0, lineStore.locations.length, ...locations.map(normalizeLocation));
    lineStore.vehicles.splice(0, lineStore.vehicles.length, ...vehicles.map(normalizeVehicle));
    lineStore.expeditionParameters.splice(0, lineStore.expeditionParameters.length, ...expeditionParameters.map(normalizeExpeditionParameter));
    apiStockSnapshot = normalizeStockSnapshot(stock);
    await loadExpeditionHistoryFromApi();
    ensureExpeditionParameters();
    rerenderExpedicao();
  } catch (error) {
    apiStockSnapshot = null;
    showExpeditionNotice("Referências não carregadas", getExpeditionErrorMessage(error));
  }
}

function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (saved?.id) expeditionDraft = normalizeDraft(saved);
  } catch (error) {
    expeditionDraft = createExpeditionDraft();
  }
}

function normalizeDraft(draft) {
  return {
    ...createExpeditionDraft(),
    ...draft,
    dateTime: getDraftDateValue(draft.dateTime) || getLocalDateValue(),
    orders: Array.isArray(draft.orders) && draft.orders.length
      ? draft.orders.map((order, index) => ({
        ...createOrderDraft(index + 1),
        ...order,
        isOpen: order.isOpen ?? order.status !== "Salvo",
        materials: Array.isArray(order.materials) && order.materials.length ? order.materials.map((materialDraft) => ({ ...createMaterialDraft(), ...materialDraft })) : [createMaterialDraft()]
      }))
      : [createOrderDraft(1)]
  };
}

function persistDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(expeditionDraft));
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  expeditionDraft = createExpeditionDraft();
}

async function confirmExpedition() {
  const validation = validateDraft();
  if (!validation.valid) {
    pendingConfirmation = null;
    showExpeditionNotice("Carregamento incompleto", validation.message);
    return;
  }

  const payload = buildExpeditionPayload();

  try {
    const saved = await apiPost("/api/expeditions", payload);
    const normalizedSaved = normalizeExpeditionRecord(saved);
    const certificatePackage = await loadExpeditionCertificatePackage(normalizedSaved);
    if (certificatePackage) normalizedSaved.certificatePackage = certificatePackage;
    const records = getHistoryRecords().filter((record) => record.id !== saved.id);
    records.unshift(normalizedSaved);
    persistHistory(records);
    await refreshStockSnapshot();
    clearDraft();
    pendingConfirmation = null;
    finalizedExpeditionPackage = certificatePackage ? { ...certificatePackage, expedition: normalizedSaved } : null;
    activeExpeditionTab = "HISTORY";
    rerenderExpedicao();
    if (finalizedExpeditionPackage && shouldAutoPrintCertificates(normalizedSaved)) {
      setTimeout(() => openCertificatesPreview(finalizedExpeditionPackage), 150);
    }
  } catch (error) {
    pendingConfirmation = null;
    showExpeditionNotice("Carregamento não confirmado", getExpeditionErrorMessage(error));
  }
}

function validateDraft() {
  if (!expeditionDraft.dateTime) return { valid: false, message: "Informe a data do carregamento." };
  if (!expeditionDraft.locationName) return { valid: false, message: "Informe o local da expedição." };
  if (!expeditionDraft.vehicleId) return { valid: false, message: "Informe o caminhão do carregamento." };
  if (!expeditionDraft.orders.some((order) => String(order.number || "").trim())) return { valid: false, message: "Informe pelo menos um número de pedido." };
  const selectedLots = getSelectedLots(expeditionDraft);
  if (!selectedLots.length) return { valid: false, message: "Selecione pelo menos um lote para o carregamento." };

  for (const order of expeditionDraft.orders || []) {
    for (const materialDraft of order.materials || []) {
      const validation = validateMaterialDraft(materialDraft, {
        orderId: order.id,
        materialDraftId: materialDraft.id
      });
      if (!validation.valid) return validation;
    }
  }

  const totalsByLot = selectedLots.reduce((map, selection) => {
    const key = getLotSelectionKey(selection);
    const baseLot = findLotByKey(key) || selection;
    const current = map.get(key) || {
      lotCode: selection.lotCode,
      availableQuantity: Number(baseLot.availableQuantity ?? baseLot.quantity ?? selection.availableQuantity ?? selection.quantity ?? 0),
      loadedQuantity: 0
    };

    current.loadedQuantity += Number(selection.loadedQuantity || 0);
    map.set(key, current);
    return map;
  }, new Map());

  for (const total of totalsByLot.values()) {
    if (total.loadedQuantity > total.availableQuantity + 0.0001) {
      return {
        valid: false,
        message: `A soma carregada ultrapassa o saldo disponível do lote ${total.lotCode}.`
      };
    }
  }

  return { valid: true };
}

function validateMaterialDraft(materialDraft, context = {}) {
  const selections = Object.entries(materialDraft.lotSelections || {})
    .filter(([, selection]) => selection.selected);

  for (const [lotKey, selection] of selections) {
    const operationalLot = getOperationalLotByKey(lotKey, context) || selection;
    const validation = validateLotSelection({
      ...selection,
      availableQuantity: operationalLot.availableQuantity,
      quantity: operationalLot.quantity
    });
    if (!validation.valid) {
      return {
        valid: false,
        message: validation.message.includes("ultrapassa")
          ? "Quantidade carregada ultrapassa saldo disponível do lote."
          : validation.message
      };
    }
  }

  return { valid: true };
}

function validateLotSelection(selection) {
  const loadedQuantity = Number(selection.loadedQuantity || 0);
  const availableQuantity = Number(selection.availableQuantity ?? selection.quantity ?? 0);

  if (loadedQuantity <= 0) {
    return {
      valid: false,
      message: `Informe quantidade maior que zero para o lote ${selection.lotCode || "-"}.`
    };
  }

  if (loadedQuantity > availableQuantity + 0.0001) {
    return {
      valid: false,
      message: `Quantidade carregada ultrapassa o saldo disponível do lote ${selection.lotCode || "-"}.`
    };
  }

  return { valid: true };
}

function getSelectedLots(record) {
  return (record.orders || []).flatMap((order) => {
    return (order.materials || []).flatMap((materialDraft) => {
      return Object.values(materialDraft.lotSelections || {})
        .filter((selection) => selection.selected)
        .map((selection) => ({
          ...selection,
          orderNumber: order.number || "",
          materialName: materialDraft.materialName || selection.materialName || ""
        }));
    });
  });
}

function calculateSecondaryLoaded(lot, primaryLoaded) {
  const primaryBalance = Number(lot.primary_balance ?? lot.primaryBalance ?? lot.quantity ?? lot.availableQuantity ?? 0);
  const secondaryBalance = Number(lot.secondary_balance ?? lot.secondaryBalance ?? lot.secondaryQuantity ?? 0);

  if (primaryBalance <= 0 || secondaryBalance <= 0) return null;

  return roundQuantity(Number(primaryLoaded || 0) * (secondaryBalance / primaryBalance));
}

function getSelectionSecondaryLoaded(selection) {
  const calculated = calculateSecondaryLoaded(selection, Number(selection.loadedQuantity || selection.primaryQuantity || 0));
  if (calculated !== null) return calculated;

  if (selection.secondaryQuantityLoaded !== undefined && selection.secondaryQuantityLoaded !== null && selection.secondaryQuantityLoaded !== "") {
    return Number(selection.secondaryQuantityLoaded);
  }

  return null;
}

function getRecordOrderNumbers(record) {
  const numbers = (record.orders || [])
    .map((order) => String(order.number || "").trim())
    .filter(Boolean);
  return numbers.length ? numbers.join(" / ") : "-";
}

function getRecordMaterialNames(record) {
  const names = [];
  const seen = new Set();

  (record.orders || []).forEach((order) => {
    (order.materials || []).forEach((materialDraft) => {
      const hasSelectedLots = getSelectedLots({ orders: [{ materials: [materialDraft] }] }).length > 0;
      const name = String(materialDraft.materialName || "").trim();
      if (!hasSelectedLots || !name || seen.has(name)) return;
      seen.add(name);
      names.push(name);
    });
  });

  return names.length ? names.join(" / ") : "-";
}

function renderHistoryCertificateCell(record) {
  const loadedCertificates = record.certificatePackage?.certificates || [];
  const shouldShowPdf = loadedCertificates.length > 0 || (!record.certificatePackage && hasRequiredCertificateMaterials(record));

  if (!shouldShowPdf) return "-";

  return `
    <button class="expedition-pdf-badge print-expedition-certificates-btn" data-history-id="${escapeAttr(record.id)}" type="button" aria-label="Abrir certificados em PDF">
      <span class="attachment-file-icon">PDF</span>
    </button>
  `;
}

function roundQuantity(value) {
  return Math.round(Number(value || 0) * 1000000) / 1000000;
}

function getFilteredHistory() {
  const search = historyFilters.search.trim().toLowerCase();

  const filtered = getHistoryRecords().filter((record) => {
    const haystack = `
      ${record.locationName || ""}
      ${record.vehicleName || ""}
      ${record.status || ""}
      ${(record.orders || []).map((order) => `${order.number || ""} ${order.notes || ""}`).join(" ")}
      ${getSelectedLots(record).map((lot) => `${lot.materialName || ""} ${lot.lotCode || ""}`).join(" ")}
    `.toLowerCase();

    const matchesSearch = !search || haystack.includes(search);
    const matchesDate = !historyFilters.date || String(record.dateTime || "").slice(0, 10) === historyFilters.date;
    const matchesStatus = historyFilters.status === "Todos" || record.status === historyFilters.status;
    return matchesSearch && matchesDate && matchesStatus;
  });

  return filtered.sort((a, b) => {
    const field = historySort.field;
    let valueA = getHistorySortValue(a, field);
    let valueB = getHistorySortValue(b, field);

    if (typeof valueA === "string") valueA = valueA.toLowerCase();
    if (typeof valueB === "string") valueB = valueB.toLowerCase();

    if (valueA > valueB) return historySort.direction === "asc" ? 1 : -1;
    if (valueA < valueB) return historySort.direction === "asc" ? -1 : 1;
    return 0;
  });
}

function getHistorySortValue(record, field) {
  if (field === "orders") return getRecordOrderNumbers(record);
  if (field === "materials") return getRecordMaterialNames(record);
  if (field === "responsibleUser") return record.responsibleUser || getCurrentResponsibleUser();
  if (field === "dateTime") return record.dateTime ? new Date(record.dateTime).getTime() : 0;
  return record[field] ?? "";
}

function getHistoryRecords() {
  return lineStore.expeditionHistory;
}

function persistHistory(records) {
  lineStore.expeditionHistory.splice(0, lineStore.expeditionHistory.length, ...records);
}

function buildExpeditionPayload() {
  return {
    ...structuredClone(expeditionDraft),
    dateTime: expeditionDraft.summaryDateTime || getConfirmationDateTimeValue(expeditionDraft.dateTime),
    responsibleUser: expeditionDraft.responsibleUser || getCurrentResponsibleUser(),
    vehicleName: getVehicleName(expeditionDraft.vehicleId),
    status: "Processado",
    orders: expeditionDraft.orders.map(({ notes, ...order }) => ({
      ...order,
      materials: order.materials.map((materialDraft) => ({
        ...materialDraft,
        lots: Object.values(materialDraft.lotSelections || {})
          .filter((selection) => selection.selected)
          .map((selection) => ({
            lotId: selection.lotId || selection.sourceLotId || selection.id || "",
            id: selection.lotId || selection.sourceLotId || selection.id || "",
            lotCode: selection.lotCode || "",
            materialId: materialDraft.materialId || selection.materialId || "",
            materialName: materialDraft.materialName || selection.materialName || "",
            locationId: selection.locationId || "",
            locationName: selection.locationName || "",
            primaryQuantity: Number(selection.loadedQuantity || 0),
            loadedQuantity: Number(selection.loadedQuantity || 0),
            secondaryQuantityLoaded: getSelectionSecondaryLoaded(selection),
            unit: selection.unit || "",
            secondaryUnit: selection.secondaryUnit || ""
          }))
      }))
    }))
  };
}

async function refreshStockSnapshot() {
  try {
    apiStockSnapshot = normalizeStockSnapshot(await apiGet("/api/stock"));
  } catch (error) {
    apiStockSnapshot = null;
  }
}

async function loadExpeditionHistoryFromApi() {
  try {
    const expeditions = await apiGet("/api/expeditions");
    lineStore.expeditionHistory.splice(0, lineStore.expeditionHistory.length, ...expeditions.map(normalizeExpeditionRecord));
  } catch (error) {
    lineStore.expeditionHistory.splice(0, lineStore.expeditionHistory.length);
    showExpeditionNotice("Histórico não carregado", getExpeditionErrorMessage(error));
  }
}

function normalizeExpeditionRecord(record) {
  return {
    ...record,
    status: record.status || "Processado",
    vehicleName: record.vehicleName || getVehicleName(record.vehicleId),
    orders: Array.isArray(record.orders) ? record.orders.map((order, index) => ({
      ...createOrderDraft(index + 1),
      ...order,
      status: order.status || "Salvo",
      materials: Array.isArray(order.materials) ? order.materials.map((materialDraft) => ({
        ...createMaterialDraft(),
        ...materialDraft,
        lotSelections: Object.fromEntries(Object.entries(materialDraft.lotSelections || {}).map(([key, selection]) => ([
          key,
          {
            ...selection,
            selected: Boolean(selection.selected),
            loadedQuantity: selection.loadedQuantity ?? selection.primaryQuantity ?? "",
            secondaryQuantityLoaded: selection.secondaryQuantityLoaded ?? selection.secondaryLoaded ?? selection.loadedSecondaryQuantity ?? null
          }
        ])))
      })) : []
    })) : []
  };
}

async function loadExpeditionCertificatePackage(record) {
  if (!record?.id || !hasRequiredCertificateMaterials(record)) {
    return createEmptyCertificatePackage(record);
  }

  try {
    const certificatePackage = await apiGet(`/api/expeditions/${record.id}/certificates`);
    return filterCertificatePackageByParameters(certificatePackage, record);
  } catch (error) {
    return createEmptyCertificatePackage(record);
  }
}

async function ensureRecordCertificatePackage(recordId) {
  const records = getHistoryRecords();
  const record = records.find((item) => item.id === recordId);
  if (!record) return null;

  if (!record.certificatePackage && hasRequiredCertificateMaterials(record)) {
    record.certificatePackage = await loadExpeditionCertificatePackage(record);
    persistHistory(records);
  }

  return record;
}

function createEmptyCertificatePackage(record) {
  return {
    expedition: record,
    orders: record?.orders || [],
    materials: [],
    lots: [],
    certificates: [],
    relations: []
  };
}

function filterCertificatePackageByParameters(certificatePackage, record) {
  const requiredMaterialIds = new Set(getRequiredCertificateMaterialIds(record));
  const requiresLot = (lot) => requiredMaterialIds.has(String(lot.materialId || lot.shippedMaterialId || ""));
  const lots = (certificatePackage.lots || []).filter(requiresLot);
  const relations = (certificatePackage.relations || []).filter(requiresLot);

  const certificates = (certificatePackage.certificates || []).map((certificate) => {
    const linkedLots = (certificate.linkedLots || []).filter(requiresLot);
    const certificateRelations = (certificate.relations || []).filter(requiresLot);
    return {
      ...certificate,
      linkedLots,
      relations: certificateRelations
    };
  }).filter((certificate) => certificate.linkedLots.length || certificate.relations.length);

  return {
    ...certificatePackage,
    expedition: record || certificatePackage.expedition,
    lots,
    materials: (certificatePackage.materials || []).filter((material) => requiredMaterialIds.has(String(material.materialId || ""))),
    certificates,
    relations
  };
}

function hasRequiredCertificateMaterials(record) {
  return getRequiredCertificateMaterialIds(record).length > 0;
}

function getRequiredCertificateMaterialIds(record) {
  const ids = new Set();

  (record?.orders || []).forEach((order) => {
    (order.materials || []).forEach((materialDraft) => {
      const selectedLots = getSelectedLots({ orders: [{ number: order.number, materials: [materialDraft] }] });
      if (!selectedLots.length) return;
      if (materialRequiresCertificate(materialDraft.materialId, materialDraft.materialName)) {
        ids.add(String(materialDraft.materialId || ""));
      }
    });
  });

  return [...ids].filter(Boolean);
}

function materialRequiresCertificate(materialId, materialName) {
  const parameter = findExpeditionParameter(materialId, materialName);
  return Boolean(parameter?.autoPrintCertificate);
}

function materialAutoPrintsCertificate(materialId, materialName) {
  const parameter = findExpeditionParameter(materialId, materialName);
  return Boolean(parameter?.autoPrintCertificate);
}

function findExpeditionParameter(materialId, materialName) {
  const id = String(materialId || "");
  return (lineStore.expeditionParameters || []).find((parameter) => {
    return String(parameter.materialId || "") === id || parameter.materialName === materialName;
  });
}

function hasCertificatePackageContent(certificatePackage) {
  return Boolean(certificatePackage && hasRequiredCertificateMaterials(certificatePackage.expedition));
}

function shouldAutoPrintCertificates(record) {
  return (record?.orders || []).some((order) => {
    return (order.materials || []).some((materialDraft) => {
      const selectedLots = getSelectedLots({ orders: [{ number: order.number, materials: [materialDraft] }] });
      return selectedLots.length && materialAutoPrintsCertificate(materialDraft.materialId, materialDraft.materialName);
    });
  });
}

function closeFinalizedExpedition() {
  finalizedExpeditionPackage = null;
  rerenderExpedicao();
}

function openCertificatesPreview(certificatePackage) {
  const preview = window.open("", "_blank");
  if (!preview) {
    showExpeditionNotice("Preview bloqueado", "Permita pop-ups para abrir a impressão dos certificados.");
    return;
  }

  preview.document.open();
  preview.document.write(buildCertificatesPreviewHtml(certificatePackage));
  preview.document.close();
  preview.focus();
}

function buildCertificatesPreviewHtml(certificatePackage) {
  const record = certificatePackage.expedition || {};
  const lots = certificatePackage.lots?.length ? certificatePackage.lots : getSelectedLots(record);
  const certificates = certificatePackage.certificates || [];

  return `<!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Certificados da expedição</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; color: #172033; font-family: Arial, sans-serif; background: #f4f7fb; }
          main { max-width: 1040px; margin: 0 auto; padding: 28px; }
          section { min-height: 100vh; padding: 28px; background: #fff; border: 1px solid #dfe6ef; border-radius: 8px; page-break-after: always; }
          h1, h2, h3, p { margin: 0; }
          h1 { font-size: 26px; }
          h2 { font-size: 20px; margin-bottom: 14px; }
          h3 { font-size: 15px; margin: 22px 0 8px; }
          .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
          .meta div { border: 1px solid #dfe6ef; border-radius: 6px; padding: 10px; }
          small { display: block; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 10px; }
          strong { display: block; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border: 1px solid #dfe6ef; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #edf3f8; }
          .certificate { display: grid; gap: 14px; }
          .pdf-link { display: inline-block; margin-top: 10px; color: #0f766e; font-weight: 700; }
          .missing-url { margin-top: 10px; padding: 10px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; color: #9a3412; font-weight: 700; }
          .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 28px; background: #172033; }
          button { border: 0; border-radius: 6px; padding: 10px 14px; font-weight: 800; cursor: pointer; }
          @media print {
            body { background: #fff; }
            main { max-width: none; padding: 0; }
            section { border: 0; border-radius: 0; min-height: auto; }
            .toolbar { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="toolbar">
          <button onclick="window.print()">Imprimir</button>
        </div>
        <main>
          <section>
            <h1>Resumo da expedição</h1>
            <div class="meta">
              <div><small>Data/hora</small><strong>${escapeHtml(formatDateTime(record.dateTime))}</strong></div>
              <div><small>Local</small><strong>${escapeHtml(record.locationName || "-")}</strong></div>
              <div><small>Caminhão</small><strong>${escapeHtml(record.vehicleName || getVehicleName(record.vehicleId) || "-")}</strong></div>
              <div><small>Certificados</small><strong>${certificates.length}</strong></div>
            </div>

            <h3>Pedidos</h3>
            <p>${escapeHtml((record.orders || []).map((order) => order.number).filter(Boolean).join(" / ") || "-")}</p>

            <h3>Materiais, lotes e quantidades</h3>
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Material</th>
                  <th>Lote expedido</th>
                  <th>Quantidade</th>
                  <th>Certificado vinculado</th>
                </tr>
              </thead>
              <tbody>
                ${lots.map((lot) => {
                  const linked = certificates.filter((certificate) => (certificate.linkedLots || []).some((linkedLot) => linkedLot.shippedLotId === lot.lotId || linkedLot.shippedLotCode === lot.lotCode));
                  return `
                    <tr>
                      <td>${escapeHtml(lot.orderNumber || "-")}</td>
                      <td>${escapeHtml(lot.materialName || lot.shippedMaterialName || "-")}</td>
                      <td>${escapeHtml(lot.lotCode || lot.shippedLotCode || "-")}</td>
                      <td>${formatNumber(lot.primaryQuantity || lot.loadedQuantity || 0)} ${escapeHtml(lot.primaryUnit || lot.unit || "")}</td>
                      <td>${escapeHtml(linked.map((certificate) => certificate.certificateCode || certificate.certificateFileName || "Sem código").join(" / ") || "Não encontrado")}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </section>

          ${certificates.length ? certificates.map((certificate, index) => `
            <section class="certificate">
              <h2>Certificado ${index + 1}: ${escapeHtml(certificate.certificateCode || "sem código")}</h2>
              <div class="meta">
                <div><small>Material de origem</small><strong>${escapeHtml(certificate.originalMaterialName || "-")}</strong></div>
                <div><small>Lote de origem</small><strong>${escapeHtml(certificate.originalLotCode || "-")}</strong></div>
                <div><small>Status do ensaio</small><strong>${escapeHtml(certificate.status || "-")}</strong></div>
                <div><small>Arquivo</small><strong>${escapeHtml(certificate.certificateFileName || "-")}</strong></div>
              </div>
              <h3>Atende os lotes expedidos</h3>
              <p>${escapeHtml((certificate.linkedLots || []).map((lot) => `${lot.shippedLotCode} (${lot.orderNumber || "sem pedido"})`).join(" / ") || "-")}</p>
              <h3>Rastro da árvore</h3>
              <p>${escapeHtml((certificate.relations || []).map((relation) => (relation.path || []).map((lot) => lot.lotCode).join(" → ")).join(" / ") || "-")}</p>
              ${certificate.certificateFileUrl
                ? `<a class="pdf-link" href="${escapeAttr(certificate.certificateFileUrl)}" target="_blank" rel="noopener">Abrir PDF do certificado</a>`
                : `<div class="missing-url">Arquivo registrado, mas ainda sem URL de armazenamento.</div>`}
            </section>
          `).join("") : `
            <section>
              <h2>Certificados não encontrados</h2>
              <p>Nenhum certificado foi localizado na árvore de rastreabilidade dos materiais com impressão automática.</p>
            </section>
          `}
        </main>
      </body>
    </html>`;
}

function showExpeditionNotice(title, message) {
  expeditionNotice = { title, message };
  rerenderExpedicao();
}

function closeExpeditionNotice() {
  expeditionNotice = null;
  rerenderExpedicao();
}

function getExpeditionErrorMessage(error) {
  const message = error?.data?.error || error?.message || "";
  return message && !/^Erro HTTP/i.test(message) ? message : "Não foi possível confirmar o carregamento.";
}

function ensureExpeditionParameters() {
  const parameters = lineStore.expeditionParameters;
  const activeMaterials = getActiveItems(lineStore.materials || []);

  activeMaterials.forEach((material) => {
    const materialId = getMaterialId(material);
    if (!materialId || parameters.some((item) => item.materialId === materialId)) return;

    parameters.push({
      materialId,
      materialCode: material.code || "",
      materialName: material.name || "",
      canBeShipped: true,
      requiresCertificate: false,
      autoPrintCertificate: false,
      showInExpedition: true
    });
  });

  parameters.forEach((parameter) => {
    parameter.showInExpedition = Boolean(parameter.canBeShipped);
  });
}

function getShippableMaterials() {
  const activeMaterials = getActiveItems(lineStore.materials || []);

  return activeMaterials.filter((material) => {
    const parameter = lineStore.expeditionParameters.find((item) => item.materialId === getMaterialId(material));
    return parameter ? Boolean(parameter.canBeShipped) : true;
  });
}

function getAvailableLotsForMaterial(materialId, materialName, context = {}) {
  if (!materialId || !expeditionDraft.locationName) return [];
  const material = findMaterial(materialId, materialName);
  const materialCode = material?.code || "";

  return getStockLots().map((lot) => getOperationalLot(lot, context)).filter((lot) => {
    const matchesMaterial =
      lot.materialId === materialId ||
      lot.balanceMaterialCode === materialCode ||
      lot.materialCode === materialCode ||
      lot.materialName === materialName;

    const matchesLocation = lot.locationName === expeditionDraft.locationName;
    const quantity = Number(lot.availableQuantity ?? lot.quantity ?? 0);
    const status = String(lot.status || lot.lotStatus || lot.balanceStatus || "Disponível").toLowerCase();
    const isCanceled = status.includes("cancel") || status.includes("sem saldo");
    return matchesMaterial && matchesLocation && quantity > 0 && !isCanceled;
  });
}

function getOperationalLotByKey(key, context = {}) {
  const lot = findLotByKey(key);
  return lot ? getOperationalLot(lot, context) : null;
}

function getOperationalLot(lot, context = {}) {
  const originalPrimary = Number(lot.availableQuantity ?? lot.quantity ?? 0);
  const reservedPrimary = getDraftReservedQuantityForLot(getLotSelectionKey(lot), context);
  const availableQuantity = Math.max(0, roundQuantity(originalPrimary - reservedPrimary));
  const originalSecondary = Number(lot.secondaryQuantity ?? lot.secondaryBalance ?? 0);
  const secondaryQuantity = originalPrimary > 0
    ? roundQuantity(originalSecondary * (availableQuantity / originalPrimary))
    : 0;

  return {
    ...lot,
    quantity: availableQuantity,
    availableQuantity,
    primaryBalance: availableQuantity,
    secondaryBalance: secondaryQuantity,
    secondaryQuantity
  };
}

function getDraftReservedQuantityForLot(lotKey, context = {}) {
  return (expeditionDraft.orders || []).reduce((total, order) => {
    return total + (order.materials || []).reduce((materialTotal, materialDraft) => {
      const isCurrent = order.id === context.orderId && materialDraft.id === context.materialDraftId;
      if (isCurrent) return materialTotal;
      const selection = materialDraft.lotSelections?.[lotKey];
      if (!selection?.selected) return materialTotal;
      return materialTotal + Number(selection.loadedQuantity || 0);
    }, 0);
  }, 0);
}

function refreshOperationalLotMirror(lotKey) {
  if (!lotKey) return;

  document.querySelectorAll(`.expedition-lot-row[data-lot-key="${cssEscape(lotKey)}"]`).forEach((row) => {
    const context = {
      orderId: row.dataset.orderId,
      materialDraftId: row.dataset.materialDraftId
    };
    const operationalLot = getOperationalLotByKey(lotKey, context);
    if (!operationalLot) return;

    const checkbox = row.querySelector(".expedition-lot-checkbox");
    const input = row.querySelector(".expedition-loaded-quantity");
    const primaryCell = row.querySelector(".expedition-operational-primary");
    const secondaryCell = row.querySelector(".expedition-operational-secondary");
    const errorLabel = row.querySelector(".expedition-lot-error");
    const materialDraft = findMaterialDraft(context.orderId, context.materialDraftId);
    const selection = materialDraft?.lotSelections?.[lotKey];

    if (primaryCell) primaryCell.textContent = `${formatNumber(operationalLot.availableQuantity ?? operationalLot.quantity)} ${operationalLot.unit || ""}`.trim();
    if (secondaryCell) {
      secondaryCell.textContent = operationalLot.secondaryUnit
        ? `${formatNumber(operationalLot.secondaryQuantity)} ${operationalLot.secondaryUnit}`
        : "-";
    }

    if (selection) {
      selection.availableQuantity = operationalLot.availableQuantity;
      selection.quantity = operationalLot.quantity;
      selection.secondaryQuantity = operationalLot.secondaryQuantity;
      selection.primaryBalance = operationalLot.primaryBalance;
      selection.secondaryBalance = operationalLot.secondaryBalance;
    }

    if (input && selection?.selected) {
      const validation = validateLotSelection(selection);
      row.classList.toggle("invalid", !validation.valid);
      input.classList.toggle("invalid", !validation.valid);
      if (errorLabel) {
        errorLabel.textContent = validation.valid ? "" : validation.message;
        errorLabel.classList.toggle("hidden", validation.valid);
      }
    }

    if (!checkbox?.checked) {
      row.style.display = Number(operationalLot.availableQuantity ?? operationalLot.quantity ?? 0) > 0 ? "" : "none";
    }
  });
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function getStockLots() {
  if (apiStockSnapshot) return apiStockSnapshot.lots;
  return buildStockSnapshot(lineStore).lots;
}

function findLotByKey(key) {
  return getStockLots().find((lot) => getLotSelectionKey(lot) === key);
}

function getLotSelectionKey(lot) {
  return `${lot.materialId || lot.balanceMaterialCode || lot.materialCode || lot.materialName || ""}__${lot.locationName || ""}__${lot.lotCode || lot.id || ""}`;
}

function renderLocationOptions(selected) {
  const locations = ["", ...getActiveItems(lineStore.locations || []).map((location) => location.name)];
  return locations.map((location) => `
    <option value="${escapeAttr(location)}" ${location === selected ? "selected" : ""}>${location || "Selecione um local"}</option>
  `).join("");
}

function renderVehicleOptions(selected) {
  const activeVehicles = getActiveItems(lineStore.vehicles || []);
  return [
    `<option value="">Selecione um caminhão</option>`,
    ...activeVehicles.map((vehicle) => `
      <option value="${escapeAttr(vehicle.id)}" ${vehicle.id === selected ? "selected" : ""}>${escapeHtml(vehicle.name)} · ${escapeHtml(vehicle.plate)}</option>
    `)
  ].join("");
}

function renderMaterialOptions(selected) {
  const materials = getShippableMaterials();
  return [
    `<option value="">Selecione um material</option>`,
    ...materials.map((material) => {
      const materialId = getMaterialId(material);
      return `<option value="${escapeAttr(materialId)}" ${materialId === selected ? "selected" : ""}>${escapeHtml(material.name || "-")}</option>`;
    })
  ].join("");
}

function findOrder(orderId) {
  return expeditionDraft.orders.find((order) => order.id === orderId);
}

function findMaterialDraft(orderId, materialDraftId) {
  const order = findOrder(orderId);
  return order?.materials?.find((materialDraft) => materialDraft.id === materialDraftId);
}

function findMaterial(materialId, materialName) {
  return (lineStore.materials || []).find((material) => getMaterialId(material) === materialId || material.name === materialName);
}

function getMaterialId(material) {
  return String(material?.id || material?.code || material?.name || "");
}

function getVehicleName(vehicleId) {
  const vehicle = (lineStore.vehicles || []).find((item) => item.id === vehicleId);
  return vehicle ? `${vehicle.name} · ${vehicle.plate}` : "";
}

function clearAllLotSelections() {
  expeditionDraft.orders.forEach((order) => {
    order.materials.forEach((materialDraft) => {
      materialDraft.lotSelections = {};
    });
  });
}

function closePendingModal() {
  pendingConfirmation = null;
  rerenderExpedicao();
}

function closeHistoryDetail() {
  selectedHistoryRecordId = null;
  isHistoryDetailEditing = false;
  rerenderExpedicao();
}

function rerenderExpedicao() {
  document.getElementById("appContent").innerHTML = `
    <div class="page-header">
      <h1>${expedicaoPage.title}</h1>
      <p>${expedicaoPage.subtitle}</p>
    </div>
    ${renderExpedicao()}
  `;
  setupExpedicaoEvents();
}

function normalizeMaterial(material) {
  return {
    ...material,
    id: material.id || "",
    code: material.code || "",
    name: material.name || "",
    status: material.status || "Ativo",
    unit: material.unit || material.primaryUnit || "un",
    secondaryUnit: material.secondaryUnit || material.secondary_unit || ""
  };
}

function normalizeLocation(location) {
  return {
    ...location,
    id: location.id || "",
    name: location.name || "",
    status: location.status || "Ativo"
  };
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

function normalizeExpeditionParameter(parameter) {
  return {
    ...parameter,
    materialId: String(parameter.materialId || ""),
    materialCode: parameter.materialCode || "",
    materialName: parameter.materialName || "",
    materialType: parameter.materialType || "",
    canBeShipped: parameter.canBeShipped !== false,
    requiresCertificate: Boolean(parameter.requiresCertificate),
    autoPrintCertificate: Boolean(parameter.autoPrintCertificate),
    showInExpedition: parameter.canBeShipped !== false,
    status: parameter.status || "Ativo"
  };
}

function normalizeStockSnapshot(snapshot) {
  return {
    groups: Array.isArray(snapshot?.groups) ? snapshot.groups : [],
    lots: Array.isArray(snapshot?.lots) ? snapshot.lots.map(normalizeStockLot) : []
  };
}

function normalizeStockLot(lot) {
  const quantity = Number(lot.quantity || 0);
  const reservedQuantity = Number(lot.reservedQuantity || 0);

  return {
    ...lot,
    id: lot.id || lot.lotId || "",
    lotId: lot.lotId || lot.id || "",
    sourceLotId: lot.sourceLotId || lot.lotId || lot.id || "",
    materialId: String(lot.materialId || ""),
    materialCode: lot.materialCode || "",
    balanceMaterialCode: lot.balanceMaterialCode || lot.materialCode || "",
    materialName: lot.materialName || "",
    locationId: lot.locationId || "",
    locationName: lot.locationName || "",
    lotCode: lot.lotCode || "",
    quantity,
    primaryBalance: Number(lot.primary_balance ?? lot.primaryBalance ?? quantity),
    secondaryBalance: Number(lot.secondary_balance ?? lot.secondaryBalance ?? lot.secondaryQuantity ?? 0),
    secondaryQuantity: Number(lot.secondary_balance ?? lot.secondaryBalance ?? lot.secondaryQuantity ?? 0),
    reservedQuantity,
    availableQuantity: Number(lot.availableQuantity ?? quantity - reservedQuantity),
    unit: lot.unit || "-",
    secondaryUnit: lot.secondaryUnit || "",
    origin: lot.origin || "Origem não informada",
    status: lot.status || lot.lotStatus || lot.balanceStatus || "Disponível"
  };
}

function getHistoryStatusClass(status) {
  if (status === "Cancelado") return "badge-danger";
  if (status === "Reprocessado") return "badge-warning";
  return "badge-success";
}

function getLocalDateValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function getCurrentLocalDateTimeValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 19);
}

function getCurrentResponsibleUser() {
  try {
    const savedUser = JSON.parse(localStorage.getItem("line_current_user") || localStorage.getItem("core_session") || "null");
    const userName = savedUser?.name || savedUser?.user?.name || savedUser?.profile?.name;
    if (userName) return userName;
  } catch (error) {
    // Mantém fallback visual enquanto a autenticação real não está integrada.
  }

  const chipName = document.querySelector(".user-chip strong")?.textContent?.trim();
  return chipName || "Gustavo";
}

function getDraftDateValue(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function getConfirmationDateTimeValue(dateValue) {
  const now = new Date();
  const date = getDraftDateValue(dateValue) || getLocalDateValue();
  const [year, month, day] = date.split("-").map(Number);
  const confirmedAt = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
  confirmedAt.setMinutes(confirmedAt.getMinutes() - confirmedAt.getTimezoneOffset());
  return confirmedAt.toISOString().slice(0, 19);
}

function formatDateOnly(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("pt-BR");
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
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


