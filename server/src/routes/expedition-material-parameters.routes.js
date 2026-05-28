const express = require("express");
const { pool } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar parâmetros de expedição." };

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return Boolean(value);
}

function normalizeParameter(row) {
  return {
    id: row.id || "",
    materialId: row.materialId,
    materialCode: row.materialCode || "",
    materialName: row.materialName || "",
    materialType: row.materialType || "",
    canBeShipped: normalizeBoolean(row.canBeShipped, true),
    requiresCertificate: normalizeBoolean(row.requiresCertificate, false),
    autoPrintCertificate: normalizeBoolean(row.autoPrintCertificate, false),
    showInExpedition: normalizeBoolean(row.canBeShipped, true),
    status: row.status || "Ativo",
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function normalizePayload(item = {}) {
  return {
    materialId: String(item.materialId || "").trim(),
    canBeShipped: normalizeBoolean(item.canBeShipped, true),
    requiresCertificate: normalizeBoolean(item.requiresCertificate, false),
    autoPrintCertificate: normalizeBoolean(item.autoPrintCertificate, false),
    status: String(item.status || "Ativo").trim() || "Ativo"
  };
}

function isMissingSchemaError(error) {
  return ["3F000", "42P01", "42703"].includes(error?.code);
}

function handleParameterError(error, res, action) {
  if (isMissingSchemaError(error)) {
    console.error(`Schema ausente ou incompatível ao ${action} parâmetros de expedição:`, {
      code: error.code,
      message: error.message,
      table: error.table,
      column: error.column
    });
    return res.status(503).json({
      error: "Estrutura de banco ausente ou incompatível para parâmetros de expedição."
    });
  }

  console.error(`Erro ao ${action} parâmetros de expedição:`, error);
  return res.status(500).json(INTERNAL_ERROR);
}

async function listParameters(client) {
  const result = await client.query(`
    select
      emp.id,
      m.id as "materialId",
      m.code as "materialCode",
      m.name as "materialName",
      mt.name as "materialType",
      coalesce(emp.can_be_shipped, true) as "canBeShipped",
      coalesce(emp.requires_certificate, false) as "requiresCertificate",
      coalesce(emp.auto_print_certificate, false) as "autoPrintCertificate",
      coalesce(emp.status, 'Ativo') as status,
      emp.created_at as "createdAt",
      emp.updated_at as "updatedAt"
    from materials m
    left join material_types mt on mt.id = m.material_type_id
    left join expedition_material_parameters emp on emp.material_id = m.id
    where coalesce(m.status, 'Ativo') in ('Ativo', 'active')
    order by m.name asc;
  `);

  return result.rows.map(normalizeParameter);
}

router.get("/", async (_req, res) => {
  const client = await pool.connect();

  try {
    return res.json(await listParameters(client));
  } catch (error) {
    if (isMissingSchemaError(error)) return handleParameterError(error, res, "listar");

    console.error("Erro ao listar parâmetros de expedição:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.put("/", async (req, res) => {
  const client = await pool.connect();
  const items = Array.isArray(req.body?.parameters) ? req.body.parameters : Array.isArray(req.body) ? req.body : [];

  try {
    await client.query("begin");

    for (const item of items.map(normalizePayload)) {
      if (!item.materialId) {
        await client.query("rollback");
        return res.status(400).json({ error: "Material é obrigatório." });
      }

      if (!["Ativo", "Inativo"].includes(item.status)) {
        await client.query("rollback");
        return res.status(400).json({ error: "Status inválido." });
      }

      await client.query(
        `
          insert into expedition_material_parameters (
            material_id,
            can_be_shipped,
            requires_certificate,
            auto_print_certificate,
            status
          )
          values ($1, $2, $3, $4, $5)
          on conflict (material_id) do update
          set
            can_be_shipped = excluded.can_be_shipped,
            requires_certificate = excluded.requires_certificate,
            auto_print_certificate = excluded.auto_print_certificate,
            status = excluded.status,
            updated_at = now();
        `,
        [
          item.materialId,
          item.canBeShipped,
          item.requiresCertificate,
          item.autoPrintCertificate,
          item.status
        ]
      );
    }

    const parameters = await listParameters(client);
    await client.query("commit");
    return res.json(parameters);
  } catch (error) {
    await client.query("rollback");
    if (isMissingSchemaError(error)) return handleParameterError(error, res, "salvar");

    console.error("Erro ao salvar parâmetros de expedição:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.put("/:materialId", async (req, res) => {
  const client = await pool.connect();
  const item = normalizePayload({ ...req.body, materialId: req.params.materialId });

  try {
    await client.query("begin");

    if (!item.materialId) {
      await client.query("rollback");
      return res.status(400).json({ error: "Material é obrigatório." });
    }

    if (!["Ativo", "Inativo"].includes(item.status)) {
      await client.query("rollback");
      return res.status(400).json({ error: "Status inválido." });
    }

    await client.query(
      `
        insert into expedition_material_parameters (
          material_id,
          can_be_shipped,
          requires_certificate,
          auto_print_certificate,
          status
        )
        values ($1, $2, $3, $4, $5)
        on conflict (material_id) do update
        set
          can_be_shipped = excluded.can_be_shipped,
          requires_certificate = excluded.requires_certificate,
          auto_print_certificate = excluded.auto_print_certificate,
          status = excluded.status,
          updated_at = now();
      `,
      [
        item.materialId,
        item.canBeShipped,
        item.requiresCertificate,
        item.autoPrintCertificate,
        item.status
      ]
    );

    const parameters = await listParameters(client);
    await client.query("commit");
    return res.json(parameters.find((parameter) => parameter.materialId === item.materialId) || null);
  } catch (error) {
    await client.query("rollback");
    if (isMissingSchemaError(error)) return handleParameterError(error, res, "salvar");

    console.error("Erro ao salvar parâmetro de expedição:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

module.exports = router;
