const express = require("express");
const { pool, query } = require("../db");

const router = express.Router();
const SCHEMA_ERROR = {
  error: "Schema do laboratorio ausente ou incompativel. Execute as migrations/baseline antes de usar este endpoint."
};
const SCHEMA_ERROR_CODES = new Set(["42P01", "42703", "42883", "42P07"]);
const INTERNAL_ERROR = { error: "Erro interno ao processar laboratório." };

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeDecimal(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toDateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function isSchemaError(error) {
  return SCHEMA_ERROR_CODES.has(error?.code);
}

function logLaboratoryError(route, step, error) {
  console.error("Erro ao processar laboratorio:", {
    route,
    step,
    code: error?.code,
    message: error?.message,
    detail: error?.detail,
    constraint: error?.constraint
  });
}

function sendLaboratoryError(res, route, step, error, fallbackStatus = 500, fallbackBody = INTERNAL_ERROR) {
  logLaboratoryError(route, step, error);
  if (isSchemaError(error)) {
    return res.status(503).json(SCHEMA_ERROR);
  }
  return res.status(fallbackStatus).json(fallbackBody);
}

function calculateValues(payload) {
  const nominalValue = normalizeDecimal(payload.nominalValue);
  const measuredSpecificWeight = normalizeDecimal(payload.measuredSpecificWeight);
  const yieldStrengthLe = normalizeDecimal(payload.yieldStrengthLe);
  const tensileStrengthLr = normalizeDecimal(payload.tensileStrengthLr);
  const elongationPercent = normalizeDecimal(payload.elongationPercent);

  return {
    nominalValue,
    measuredSpecificWeight,
    variationPercent: nominalValue && measuredSpecificWeight !== null
      ? ((measuredSpecificWeight - nominalValue) / nominalValue) * 100
      : null,
    yieldStrengthLe,
    tensileStrengthLr,
    elongationPercent,
    ratioLrLe: yieldStrengthLe && tensileStrengthLr !== null
      ? tensileStrengthLr / yieldStrengthLe
      : null
  };
}

function calculateStoredStatus(row) {
  const nominalValue = normalizeDecimal(row.nominalValue);
  const measuredSpecificWeight = normalizeDecimal(row.measuredSpecificWeight);
  const minPercent = normalizeDecimal(row.toleranceMinPercent);
  const maxPercent = normalizeDecimal(row.toleranceMaxPercent);

  if (nominalValue === null || measuredSpecificWeight === null || minPercent === null || maxPercent === null) {
    return "Aprovado";
  }

  const min = nominalValue + ((nominalValue * minPercent) / 100);
  const max = nominalValue + ((nominalValue * maxPercent) / 100);
  return measuredSpecificWeight >= min && measuredSpecificWeight <= max ? "Aprovado" : "Reprovado";
}

function normalizeTest(row) {
  return {
    id: row.id,
    lotId: row.lotId,
    lotCode: row.lotCode || "",
    materialId: row.materialId,
    materialName: row.materialName || "",
    materialCode: row.materialCode || "",
    materialTypeId: row.materialTypeId,
    materialType: row.materialType || "",
    supplierId: row.supplierId,
    supplierName: row.supplierName || "",
    technicalParameterId: row.technicalParameterId,
    technicalParameterName: row.technicalParameterName || "",
    testDate: toDateOnly(row.testDate),
    testedAt: row.testedAt,
    nominalValue: toNumber(row.nominalValue),
    nominalUnit: row.nominalUnit || "",
    measuredSpecificWeight: toNumber(row.measuredSpecificWeight),
    variationPercent: toNumber(row.variationPercent),
    toleranceMinPercent: toNumber(row.toleranceMinPercent),
    toleranceMaxPercent: toNumber(row.toleranceMaxPercent),
    apparentDiameter: toNumber(row.apparentDiameter),
    yieldStrengthLe: toNumber(row.yieldStrengthLe),
    tensileStrengthLr: toNumber(row.tensileStrengthLr),
    ratioLrLe: toNumber(row.ratioLrLe),
    elongationPercent: toNumber(row.elongationPercent),
    certificateCode: row.certificateCode || "",
    supplierCertificateNumber: row.supplierCertificateNumber || "",
    certificateFileName: row.certificateFileName || "",
    certificateFileUrl: row.certificateFileUrl || "",
    status: row.status || "Aprovado",
    notes: row.notes || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canceledAt: row.canceledAt,
    cancelReason: row.cancelReason || ""
  };
}

const testSelect = `
  select
    lt.id,
    lt.lot_id as "lotId",
    lo.lot_code as "lotCode",
    lt.material_id as "materialId",
    m.code as "materialCode",
    m.name as "materialName",
    lt.material_type_id as "materialTypeId",
    mt.name as "materialType",
    lt.supplier_id as "supplierId",
    s.name as "supplierName",
    lt.technical_parameter_id as "technicalParameterId",
    tp.name as "technicalParameterName",
    lt.test_date as "testDate",
    lt.tested_at as "testedAt",
    lt.nominal_value as "nominalValue",
    lt.nominal_unit as "nominalUnit",
    lt.measured_specific_weight as "measuredSpecificWeight",
    lt.variation_percent as "variationPercent",
    lt.tolerance_min_percent as "toleranceMinPercent",
    lt.tolerance_max_percent as "toleranceMaxPercent",
    lt.apparent_diameter as "apparentDiameter",
    lt.yield_strength_le as "yieldStrengthLe",
    lt.tensile_strength_lr as "tensileStrengthLr",
    lt.ratio_lr_le as "ratioLrLe",
    lt.elongation_percent as "elongationPercent",
    lt.certificate_code as "certificateCode",
    lt.supplier_certificate_number as "supplierCertificateNumber",
    lt.certificate_file_name as "certificateFileName",
    lt.certificate_file_url as "certificateFileUrl",
    lt.status,
    lt.notes,
    lt.created_at as "createdAt",
    lt.updated_at as "updatedAt",
    lt.canceled_at as "canceledAt",
    lt.cancel_reason as "cancelReason"
  from laboratory_tests lt
  join lots lo on lo.id = lt.lot_id
  left join materials m on m.id = lt.material_id
  left join material_types mt on mt.id = lt.material_type_id
  left join suppliers s on s.id = lt.supplier_id
  left join technical_parameters tp on tp.id = lt.technical_parameter_id
`;

async function getLotContext(client, lotId) {
  const result = await client.query(
    `
      select
        lo.id,
        lo.lot_code as "lotCode",
        lo.material_id as "materialId",
        m.material_type_id as "materialTypeId",
        sm.supplier_id as "supplierId",
        coalesce(lo.supplier_certificate_number, sml.supplier_certificate_number, sm.supplier_certificate_number) as "supplierCertificateNumber"
      from lots lo
      join materials m on m.id = lo.material_id
      left join stock_movement_lots sml on sml.lot_id = lo.id
      left join stock_movement_items smi on smi.id = sml.movement_item_id
      left join stock_movements sm on sm.id = smi.movement_id and sm.movement_type = 'PURCHASE'
      where lo.id = $1
      order by sm.movement_date desc nulls last, sm.created_at desc nulls last
      limit 1;
    `,
    [lotId]
  );

  return result.rows[0] || null;
}

async function getTestById(client, id) {
  const result = await client.query(`${testSelect} where lt.id = $1 limit 1`, [id]);
  return result.rows[0] ? normalizeTest(result.rows[0]) : null;
}

router.get("/lots", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      with latest_purchase as (
        select distinct on (sml.lot_id)
          sml.lot_id,
          sm.movement_date,
          sm.document_number,
          sm.supplier_id,
          s.name as supplier_name,
          coalesce(sml.supplier_certificate_number, sm.supplier_certificate_number) as supplier_certificate_number
        from stock_movement_lots sml
        join stock_movement_items smi on smi.id = sml.movement_item_id
        join stock_movements sm on sm.id = smi.movement_id
        left join suppliers s on s.id = sm.supplier_id
        where sm.movement_type in ('PURCHASE', 'COMPRA', 'ENTRADA')
        order by sml.lot_id, sm.movement_date desc, sm.created_at desc
      ),
      lab as (
        select
          lot_id,
          count(*)::int as total_tests,
          (array_agg(status order by tested_at desc, created_at desc))[1] as last_status,
          string_agg(certificate_code, ' / ' order by tested_at desc, created_at desc) filter (where certificate_code is not null and certificate_code <> '') as certificate_codes,
          (array_agg(certificate_file_name order by tested_at desc, created_at desc) filter (where certificate_file_name is not null))[1] as certificate_file_name,
          (array_agg(certificate_file_url order by tested_at desc, created_at desc) filter (where certificate_file_url is not null))[1] as certificate_file_url
        from laboratory_tests
        group by lot_id
      )
      select
        lo.id,
        lo.lot_code as "lotCode",
        lo.material_id as "materialId",
        m.code as "materialCode",
        m.name as "materialName",
        mt.id as "materialTypeId",
        mt.name as "materialType",
        lp.supplier_id as "supplierId",
        lp.supplier_name as "supplierName",
        lp.document_number as "documentNumber",
        coalesce(lp.movement_date::date, lo.production_date, lo.created_at::date) as "entryDate",
        loc.name as "currentLocationName",
        coalesce(sum(sb.quantity), 0) as quantity,
        coalesce((array_agg(sb.unit order by sb.updated_at desc) filter (where sb.unit is not null))[1], m.unit) as unit,
        coalesce(lo.supplier_certificate_number, lp.supplier_certificate_number) as "supplierCertificateNumber",
        coalesce(lab.last_status, 'Não ensaiado') as "laboratoryStatus",
        lab.certificate_codes as "laboratoryCertificateCodes",
        coalesce(lab.total_tests, 0) as "totalTests",
        lab.certificate_file_name as "certificateFileName",
        lab.certificate_file_url as "certificateFileUrl"
      from lots lo
      join materials m on m.id = lo.material_id
      left join material_types mt on mt.id = m.material_type_id
      left join locations loc on loc.id = lo.current_location_id
      left join stock_balances sb on sb.lot_id = lo.id
      join latest_purchase lp on lp.lot_id = lo.id
      left join lab on lab.lot_id = lo.id
      where coalesce(lo.origin_type, '') in ('PURCHASE', 'COMPRA', 'ENTRADA', '')
      group by lo.id, m.id, mt.id, mt.name, loc.name, lp.supplier_id, lp.supplier_name, lp.document_number, lp.supplier_certificate_number, lp.movement_date, lab.last_status, lab.certificate_codes, lab.total_tests, lab.certificate_file_name, lab.certificate_file_url
      order by coalesce(lp.movement_date::date, lo.production_date, lo.created_at::date) desc, lo.lot_code asc;
    `);

    return res.json(result.rows.map((row) => ({
      ...row,
      entryDate: toDateOnly(row.entryDate),
      quantity: toNumber(row.quantity) || 0,
      totalTests: Number(row.totalTests || 0)
    })));
  } catch (error) {
    return sendLaboratoryError(res, "GET /lots", "list_lots", error);
  } finally {
    client.release();
  }
});

router.get("/lots/:lotId/tests", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(
      `${testSelect} where lt.lot_id = $1 order by lt.tested_at desc, lt.created_at desc`,
      [req.params.lotId]
    );
    return res.json(result.rows.map(normalizeTest));
  } catch (error) {
    return sendLaboratoryError(res, "GET /lots/:lotId/tests", "list_lot_tests", error);
  } finally {
    client.release();
  }
});

router.post("/tests", async (req, res) => {
  const client = await pool.connect();

  try {
    const payload = req.body || {};
    const lotId = normalizeText(payload.lotId);
    const certificateCode = normalizeText(payload.certificateCode);
    const certificateFileName = normalizeText(payload.certificateFileName);
    const certificateFileUrl = normalizeText(payload.certificateFileUrl);

    if (!lotId) return res.status(400).json({ error: "Lote é obrigatório." });
    if (!certificateCode) return res.status(400).json({ error: "Código do certificado de qualidade é obrigatório." });
    if (!certificateFileName && !certificateFileUrl) {
      return res.status(400).json({ error: "Anexo do certificado é obrigatório." });
    }

    const lot = await getLotContext(client, lotId);
    if (!lot) return res.status(404).json({ error: "Lote não encontrado." });

    const values = calculateValues(payload);
    const savedAt = new Date();

    const result = await client.query(
      `
        insert into laboratory_tests (
          lot_id, material_id, material_type_id, supplier_id, technical_parameter_id,
          test_date, tested_at, nominal_value, nominal_unit, measured_specific_weight,
          variation_percent, tolerance_min_percent, tolerance_max_percent, apparent_diameter,
          yield_strength_le, tensile_strength_lr, ratio_lr_le, elongation_percent, certificate_code,
          supplier_certificate_number, certificate_file_name, certificate_file_url, status, notes
        )
        values (
          $1, $2, $3, $4, $5,
          $6::date, $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18, $19,
          $20, $21, $22, $23, $24
        )
        returning id;
      `,
      [
        lotId,
        payload.materialId || lot.materialId,
        payload.materialTypeId || lot.materialTypeId,
        payload.supplierId || lot.supplierId,
        payload.technicalParameterId || null,
        payload.testDate || savedAt.toISOString().slice(0, 10),
        savedAt,
        values.nominalValue,
        normalizeText(payload.nominalUnit),
        values.measuredSpecificWeight,
        values.variationPercent,
        normalizeDecimal(payload.toleranceMinPercent),
        normalizeDecimal(payload.toleranceMaxPercent),
        normalizeDecimal(payload.apparentDiameter),
        values.yieldStrengthLe,
        values.tensileStrengthLr,
        values.ratioLrLe,
        values.elongationPercent,
        certificateCode,
        normalizeText(payload.supplierCertificateNumber) || lot.supplierCertificateNumber,
        certificateFileName || certificateFileUrl,
        certificateFileUrl,
        normalizeText(payload.status) || "Aprovado",
        normalizeText(payload.notes)
      ]
    );

    return res.status(201).json(await getTestById(client, result.rows[0].id));
  } catch (error) {
    return sendLaboratoryError(
      res,
      "POST /tests",
      "create_test",
      error,
      error.code === "23505" ? 409 : 500,
      {
        error: error.code === "23505" ? "C\u00f3digo de certificado j\u00e1 existe. Tente salvar novamente." : INTERNAL_ERROR.error
      }
    );
  } finally {
    client.release();
  }
});

router.put("/tests/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    const payload = req.body || {};
    const certificateCode = normalizeText(payload.certificateCode);
    const values = calculateValues(payload);

    if (!certificateCode) return res.status(400).json({ error: "Código do certificado de qualidade é obrigatório." });

    const result = await client.query(
      `
        update laboratory_tests
        set
          material_id = $1,
          material_type_id = $2,
          supplier_id = $3,
          technical_parameter_id = $4,
          test_date = $5::date,
          nominal_value = $6,
          nominal_unit = $7,
          measured_specific_weight = $8,
          variation_percent = $9,
          tolerance_min_percent = $10,
          tolerance_max_percent = $11,
          apparent_diameter = $12,
          yield_strength_le = $13,
          tensile_strength_lr = $14,
          ratio_lr_le = $15,
          elongation_percent = $16,
          certificate_code = $17,
          supplier_certificate_number = $18,
          certificate_file_name = coalesce($19, certificate_file_name),
          certificate_file_url = $20,
          status = $21,
          notes = $22,
          updated_at = now()
        where id = $23
        returning id;
      `,
      [
        payload.materialId || null,
        payload.materialTypeId || null,
        payload.supplierId || null,
        payload.technicalParameterId || null,
        payload.testDate || new Date().toISOString().slice(0, 10),
        values.nominalValue,
        normalizeText(payload.nominalUnit),
        values.measuredSpecificWeight,
        values.variationPercent,
        normalizeDecimal(payload.toleranceMinPercent),
        normalizeDecimal(payload.toleranceMaxPercent),
        normalizeDecimal(payload.apparentDiameter),
        values.yieldStrengthLe,
        values.tensileStrengthLr,
        values.ratioLrLe,
        values.elongationPercent,
        certificateCode,
        normalizeText(payload.supplierCertificateNumber),
        normalizeText(payload.certificateFileName),
        normalizeText(payload.certificateFileUrl),
        normalizeText(payload.status) || "Aprovado",
        normalizeText(payload.notes),
        req.params.id
      ]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Ensaio não encontrado." });
    return res.json(await getTestById(client, req.params.id));
  } catch (error) {
    return sendLaboratoryError(
      res,
      "PUT /tests/:id",
      "update_test",
      error,
      error.code === "23505" ? 409 : 500,
      {
        error: error.code === "23505" ? "C\u00f3digo de certificado j\u00e1 existe. Informe outro c\u00f3digo." : INTERNAL_ERROR.error
      }
    );
  } finally {
    client.release();
  }
});

router.post("/tests/:id/cancel", async (req, res) => {
  const reason = normalizeText(req.body?.reason || req.body?.cancelReason);
  if (!reason) return res.status(400).json({ error: "Motivo do cancelamento é obrigatório." });

  const client = await pool.connect();

  try {
    const result = await client.query(
      `
        update laboratory_tests
        set status = 'Cancelado', canceled_at = now(), cancel_reason = $1, updated_at = now()
        where id = $2
        returning id;
      `,
      [reason, req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Ensaio não encontrado." });
    return res.json(await getTestById(client, req.params.id));
  } catch (error) {
    return sendLaboratoryError(res, "POST /tests/:id/cancel", "cancel_test", error);
  } finally {
    client.release();
  }
});

router.post("/tests/:id/reprocess", async (req, res) => {
  const client = await pool.connect();

  try {
    const current = await client.query(
      `
        select
          nominal_value as "nominalValue",
          measured_specific_weight as "measuredSpecificWeight",
          tolerance_min_percent as "toleranceMinPercent",
          tolerance_max_percent as "toleranceMaxPercent"
        from laboratory_tests
        where id = $1
        limit 1;
      `,
      [req.params.id]
    );

    if (!current.rows.length) return res.status(404).json({ error: "Ensaio não encontrado." });

    const result = await client.query(
      `
        update laboratory_tests
        set status = 'Reprocessado', updated_at = now()
        where id = $1
        returning id;
      `,
      [req.params.id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Ensaio não encontrado." });
    return res.json(await getTestById(client, req.params.id));
  } catch (error) {
    return sendLaboratoryError(res, "POST /tests/:id/reprocess", "reprocess_test", error);
  } finally {
    client.release();
  }
});

module.exports = router;
