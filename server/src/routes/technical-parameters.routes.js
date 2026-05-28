const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar parametros tecnicos." };

function normalizeDecimal(value) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizePayload(body) {
  return {
    code: String(body.code || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    materialId: body.materialId || null,
    material: normalizeText(body.material),
    unit: normalizeText(body.unit),
    baseValue: normalizeDecimal(body.baseValue),
    toleranceMode: normalizeText(body.toleranceMode),
    minTolerancePercent: normalizeDecimal(body.minTolerancePercent ?? body.tolerance_min_percent),
    minToleranceNumber: normalizeDecimal(body.minToleranceNumber ?? body.tolerance_min_value),
    maxTolerancePercent: normalizeDecimal(body.maxTolerancePercent ?? body.tolerance_max_percent),
    maxToleranceNumber: normalizeDecimal(body.maxToleranceNumber ?? body.tolerance_max_value),
    notes: normalizeText(body.notes),
    status: normalizeText(body.status) || "Ativo"
  };
}

function isDuplicateCodeError(error) {
  return error && error.code === "23505";
}

async function resolveMaterialId(materialId, materialName) {
  if (materialId) {
    const result = await query("select id from materials where id = $1 limit 1", [materialId]);
    if (result.rows.length) return result.rows[0].id;
  }

  if (materialName && !materialName.toLowerCase().includes("vincular material")) {
    const result = await query("select id from materials where name = $1 limit 1", [materialName]);
    if (result.rows.length) return result.rows[0].id;
  }

  return null;
}

function selectTechnicalParametersWhere(includeInactive) {
  return `
    select
      tp.id,
      tp.code,
      tp.name,
      tp.material_id as "materialId",
      m.name as material,
      tp.unit,
      tp.base_value as "baseValue",
      tp.tolerance_mode as "toleranceMode",
      tp.min_tolerance_percent as "minTolerancePercent",
      tp.min_tolerance_number as "minToleranceNumber",
      tp.max_tolerance_percent as "maxTolerancePercent",
      tp.max_tolerance_number as "maxToleranceNumber",
      tp.notes,
      tp.status,
      tp.created_at as "createdAt",
      tp.updated_at as "updatedAt"
    from technical_parameters tp
    left join materials m on m.id = tp.material_id
    ${includeInactive ? "" : "where tp.status = 'Ativo'"}
  `;
}

router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const result = await query(`
      ${selectTechnicalParametersWhere(includeInactive)}
      order by tp.name asc;
    `);

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});

    if (!payload.code) {
      return res.status(400).json({ error: "Codigo e obrigatorio." });
    }

    if (!payload.name) {
      return res.status(400).json({ error: "Nome e obrigatorio." });
    }

    const materialId = await resolveMaterialId(payload.materialId, payload.material);

    const result = await query(
      `
        insert into technical_parameters (
          code,
          name,
          material_id,
          unit,
          base_value,
          tolerance_mode,
          min_tolerance_percent,
          min_tolerance_number,
          max_tolerance_percent,
          max_tolerance_number,
          notes,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        returning id;
      `,
      [
        payload.code,
        payload.name,
        materialId,
        payload.unit,
        payload.baseValue,
        payload.toleranceMode,
        payload.minTolerancePercent,
        payload.minToleranceNumber,
        payload.maxTolerancePercent,
        payload.maxToleranceNumber,
        payload.notes,
        payload.status
      ]
    );

    const saved = await query(
      `
        ${selectTechnicalParametersWhere(true)}
        where tp.id = $1
        limit 1;
      `,
      [result.rows[0].id]
    );

    return res.status(201).json(saved.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Ja existe um parametro tecnico com este codigo." });
    }

    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const payload = normalizePayload(req.body || {});

    if (!id) {
      return res.status(400).json({ error: "ID e obrigatorio." });
    }

    if (!payload.code) {
      return res.status(400).json({ error: "Codigo e obrigatorio." });
    }

    if (!payload.name) {
      return res.status(400).json({ error: "Nome e obrigatorio." });
    }

    const materialId = await resolveMaterialId(payload.materialId, payload.material);

    const result = await query(
      `
        update technical_parameters
        set
          code = $1,
          name = $2,
          material_id = $3,
          unit = $4,
          base_value = $5,
          tolerance_mode = $6,
          min_tolerance_percent = $7,
          min_tolerance_number = $8,
          max_tolerance_percent = $9,
          max_tolerance_number = $10,
          notes = $11,
          status = $12,
          updated_at = now()
        where id = $13
        returning id;
      `,
      [
        payload.code,
        payload.name,
        materialId,
        payload.unit,
        payload.baseValue,
        payload.toleranceMode,
        payload.minTolerancePercent,
        payload.minToleranceNumber,
        payload.maxTolerancePercent,
        payload.maxToleranceNumber,
        payload.notes,
        payload.status,
        id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Parametro tecnico nao encontrado." });
    }

    const updated = await query(
      `
        ${selectTechnicalParametersWhere(true)}
        where tp.id = $1
        limit 1;
      `,
      [id]
    );

    return res.json(updated.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Ja existe outro parametro tecnico com este codigo." });
    }

    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID e obrigatorio." });
    }

    const result = await query(
      `
        update technical_parameters
        set status = 'Inativo', updated_at = now()
        where id = $1
        returning id;
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Parametro tecnico nao encontrado." });
    }

    const deleted = await query(
      `
        ${selectTechnicalParametersWhere(true)}
        where tp.id = $1
        limit 1;
      `,
      [id]
    );

    return res.json(deleted.rows[0]);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;
