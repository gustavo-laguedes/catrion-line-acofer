import { lineStore, getActiveItems } from "../../shared/data-store.js";
import { apiGet, apiPut } from "../../shared/api-client.js";

const parameters = lineStore.expeditionParameters;

let hasTriedMaterialsLoad = false;
let hasTriedParametersLoad = false;
let parametersNotice = null;
let parametersNoticeTimer = null;

export const parametrosExpedicaoPage = {
  title: "Parâmetros de expedição",
  subtitle: "Defina o comportamento dos materiais na Expedição",
  render: renderParametrosExpedicao,
  afterRender: setupParametrosExpedicaoEvents
};

export function renderParametrosExpedicao(options = {}) {
  ensureMaterialParameters();

  const filteredParameters = getFilteredParameters();

  return `
    ${options.embedded ? "" : `
      <div class="module-toolbar">
        <button class="secondary-btn" data-route="cadastros-parametros">← Voltar</button>

        <div class="module-toolbar-actions">
          <button class="primary-btn" id="saveExpeditionParametersBtn" type="button">Salvar parâmetros</button>
        </div>
      </div>
    `}

    ${parametersNotice ? renderNotice() : ""}

    <div class="card stock-parameters-card">
      <div class="table-header">
        <div>
          <h2>Parâmetros de expedição</h2>
          <p>Controle quais materiais aparecem na Expedição e quais certificados entram automaticamente no pacote final de impressão.</p>
        </div>
        ${options.embedded ? `<button class="primary-btn" id="saveExpeditionParametersBtn" type="button">Salvar parâmetros</button>` : ""}
      </div>

      ${filteredParameters.length ? renderParametersTable(filteredParameters) : renderEmptyParameters()}
    </div>
  `;
}

function renderNotice() {
  return `
    <div class="expedition-parameters-toast ${parametersNotice.type || "danger"}" role="status" aria-live="polite">
      <div>
        <strong>${escapeHtml(parametersNotice.title)}</strong>
        ${parametersNotice.message ? `<p>${escapeHtml(parametersNotice.message)}</p>` : ""}
      </div>
      <button class="modal-close" id="closeExpeditionParametersNoticeBtn" type="button" aria-label="Fechar aviso">&times;</button>
    </div>
  `;
}

function renderParametersTable(filteredParameters) {
  return `
    <div class="data-table-wrap">
      <table class="data-table expedition-parameters-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Tipo do material</th>
            <th>Material</th>
            <th>Pode ser expedido?</th>
            <th>Imprimir certificado automaticamente?</th>
          </tr>
        </thead>
        <tbody>
          ${filteredParameters.map(renderParameterRow).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderParameterRow(parameter) {
  const material = findMaterial(parameter.materialId, parameter.materialName) || {};

  return `
    <tr>
      <td><strong>${escapeHtml(material.code || parameter.materialCode || "-")}</strong></td>
      <td>${escapeHtml(material.type || parameter.materialType || "-")}</td>
      <td>${escapeHtml(material.name || parameter.materialName || "-")}</td>
      <td>
        <label class="line-toggle-cell">
          <input class="expedition-parameter-toggle" data-parameter-field="canBeShipped" data-material-id="${escapeAttr(parameter.materialId)}" type="checkbox" ${parameter.canBeShipped ? "checked" : ""} />
          <span>${parameter.canBeShipped ? "Sim" : "Não"}</span>
        </label>
      </td>
      <td>
        <label class="line-toggle-cell">
          <input class="expedition-parameter-toggle" data-parameter-field="autoPrintCertificate" data-material-id="${escapeAttr(parameter.materialId)}" type="checkbox" ${parameter.autoPrintCertificate ? "checked" : ""} />
          <span>${parameter.autoPrintCertificate ? "Sim" : "Não"}</span>
        </label>
      </td>
    </tr>
  `;
}

function renderEmptyParameters() {
  return `
    <div class="empty-state">
      <div class="empty-icon">&#128230;</div>
      <h3>Nenhum material disponível</h3>
      <p>Cadastre materiais ativos para definir os parâmetros de expedição.</p>
    </div>
  `;
}

export function setupParametrosExpedicaoEvents(options = {}) {
  const loadPromise = loadExpeditionParameterReferences(Boolean(options.navigation), options);

  document.getElementById("closeExpeditionParametersNoticeBtn")?.addEventListener("click", () => {
    clearParametersNotice();
    rerenderParametrosExpedicao(options);
  });

  document.querySelectorAll(".expedition-parameter-toggle").forEach((input) => {
    input.addEventListener("change", () => {
      const parameter = parameters.find((item) => item.materialId === input.dataset.materialId);
      if (!parameter) return;

      parameter[input.dataset.parameterField] = input.checked;
      if (input.dataset.parameterField === "canBeShipped") {
        parameter.showInExpedition = input.checked;
      }
      input.nextElementSibling.textContent = input.checked ? "Sim" : "Não";
    });
  });

  document.getElementById("saveExpeditionParametersBtn")?.addEventListener("click", async () => {
    try {
      const saved = await apiPut("/api/expedition-material-parameters", { parameters });
      replaceParameters(saved);
      showParametersNotice("Parâmetros salvos com sucesso.", "", "success", options);
    } catch (error) {
      showParametersNotice("Parâmetros não salvos", getApiErrorMessage(error), "danger", options);
    }
  });

  return loadPromise;
}

async function loadExpeditionParameterReferences(force = false, options = {}) {
  const shouldRerender = force || !hasTriedMaterialsLoad || !hasTriedParametersLoad;
  await Promise.all([
    loadMaterialsFromApi(force, options),
    loadParametersFromApi(force, options)
  ]);
  if (shouldRerender) rerenderParametrosExpedicao(options);
}

async function loadMaterialsFromApi(force = false, options = {}) {
  if (hasTriedMaterialsLoad && !force) return;
  hasTriedMaterialsLoad = true;

  try {
    const apiMaterials = await apiGet("/api/materials");
    lineStore.materials.splice(0, lineStore.materials.length, ...apiMaterials.map(normalizeMaterial));
    ensureMaterialParameters();
  } catch (error) {
    showParametersNotice("Materiais não carregados", getApiErrorMessage(error), "danger", options);
  }
}

async function loadParametersFromApi(force = false, options = {}) {
  if (hasTriedParametersLoad && !force) return;
  hasTriedParametersLoad = true;

  try {
    const apiParameters = await apiGet("/api/expedition-material-parameters");
    replaceParameters(apiParameters);
  } catch (error) {
    showParametersNotice("Parâmetros não carregados", getApiErrorMessage(error), "danger", options);
  }
}

function ensureMaterialParameters() {
  const activeMaterials = getActiveItems(lineStore.materials || []);

  activeMaterials.forEach((material) => {
    const materialId = getMaterialId(material);
    if (!materialId) return;

    const current = parameters.find((item) => item.materialId === materialId);
    if (current) {
      current.materialName = material.name || current.materialName;
      current.materialCode = material.code || current.materialCode;
      current.materialType = material.type || current.materialType || "";
      current.showInExpedition = Boolean(current.canBeShipped);
      return;
    }

    parameters.push({
      materialId,
      materialCode: material.code || "",
      materialType: material.type || "",
      materialName: material.name || "",
      canBeShipped: true,
      requiresCertificate: false,
      autoPrintCertificate: false,
      showInExpedition: true,
      status: "Ativo"
    });
  });
}

function replaceParameters(apiParameters) {
  parameters.splice(0, parameters.length, ...apiParameters.map(normalizeParameter));
  ensureMaterialParameters();
}

function getFilteredParameters() {
  const activeMaterialIds = new Set(getActiveItems(lineStore.materials || []).map(getMaterialId));
  return parameters.filter((parameter) => activeMaterialIds.has(parameter.materialId));
}

function findMaterial(materialId, materialName) {
  return (lineStore.materials || []).find((material) => getMaterialId(material) === materialId || material.name === materialName);
}

function getMaterialId(material) {
  return String(material?.id || material?.code || material?.name || "");
}

function normalizeMaterial(material) {
  return {
    ...material,
    id: material.id || "",
    code: material.code || "",
    name: material.name || "",
    type: material.type || material.materialType || "",
    status: material.status || "Ativo"
  };
}

function normalizeParameter(parameter) {
  return {
    ...parameter,
    materialId: String(parameter.materialId || ""),
    materialCode: parameter.materialCode || "",
    materialType: parameter.materialType || "",
    materialName: parameter.materialName || "",
    canBeShipped: parameter.canBeShipped !== false,
    requiresCertificate: Boolean(parameter.requiresCertificate),
    autoPrintCertificate: Boolean(parameter.autoPrintCertificate),
    showInExpedition: parameter.canBeShipped !== false,
    status: parameter.status || "Ativo"
  };
}

function showParametersNotice(title, message, type = "danger", options = {}) {
  clearTimeout(parametersNoticeTimer);
  parametersNotice = { title, message, type };
  rerenderParametrosExpedicao(options);

  if (type === "success") {
    parametersNoticeTimer = setTimeout(() => {
      parametersNotice = null;
      rerenderParametrosExpedicao(options);
    }, 3200);
  }
}

function clearParametersNotice() {
  clearTimeout(parametersNoticeTimer);
  parametersNoticeTimer = null;
  parametersNotice = null;
}

function getApiErrorMessage(error) {
  const message = error?.data?.error || error?.message || "";
  return message && !/^Erro HTTP/i.test(message) ? message : "Não foi possível concluir a operação.";
}

function rerenderParametrosExpedicao(options = {}) {
  const appContent = document.getElementById("appContent");
  if (!appContent) return;

  if (options.embedded) {
    appContent.innerHTML = `
      <div class="page-header">
        <h1>Parâmetros</h1>
        <p>Cadastre regras, fatores, tolerâncias e configurações usadas nos cálculos e na operação.</p>
      </div>
      ${renderParametrosExpedicao({ embedded: true })}
    `;
    setupParametrosExpedicaoEvents({ embedded: true });
    return;
  }

  appContent.innerHTML = `
    <div class="page-header">
      <h1>${parametrosExpedicaoPage.title}</h1>
      <p>${parametrosExpedicaoPage.subtitle}</p>
    </div>
    ${renderParametrosExpedicao()}
  `;
  setupParametrosExpedicaoEvents();
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
