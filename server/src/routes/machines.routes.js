const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar máquinas." };

function normalizePayload(body) {
  const lotCode = String(body.lotCode || "").trim().toUpperCase();

  return {
    code: String(body.code || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    lotCode: lotCode || null,
    resourceType: body.resourceType ? String(body.resourceType).trim() || null : null,
    defaultLocationId: body.defaultLocationId || null,
    notes: body.notes ? String(body.notes).trim() || null : null,
    status: String(body.status || "Ativo").trim() || "Ativo"
  };
}

function isDuplicateCodeError(error) {
  return error && error.code === "23505";
}

function validatePayload(payload, res) {
  if (!payload.code) {
    res.status(400).json({ error: "Código é obrigatório." });
    return false;
  }

  if (!payload.name) {
    res.status(400).json({ error: "Nome é obrigatório." });
    return false;
  }

  if (payload.lotCode && payload.lotCode.length !== 5) {
    res.status(400).json({ error: "Código para lote precisa ter exatamente 5 caracteres." });
    return false;
  }

  return true;
}

router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const result = await query(`
      select
        id,
        code,
        name,
        lot_code as "lotCode",
        resource_type as "resourceType",
        default_location_id as "defaultLocationId",
        notes,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from machines
      ${includeInactive ? "" : "where status = 'Ativo'"}
      order by name asc;
    `);

    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});

    if (!validatePayload(payload, res)) return null;

    const result = await query(
      `
        insert into machines (
          code,
          name,
          lot_code,
          resource_type,
          default_location_id,
          notes,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning
          id,
          code,
          name,
          lot_code as "lotCode",
          resource_type as "resourceType",
          default_location_id as "defaultLocationId",
          notes,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [
        payload.code,
        payload.name,
        payload.lotCode,
        payload.resourceType,
        payload.defaultLocationId,
        payload.notes,
        payload.status
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe uma máquina com este código." });
    }

    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const payload = normalizePayload(req.body || {});

    if (!id) {
      return res.status(400).json({ error: "ID é obrigatório." });
    }

    if (!validatePayload(payload, res)) return null;

    const result = await query(
      `
        update machines
        set
          code = $1,
          name = $2,
          lot_code = $3,
          resource_type = $4,
          default_location_id = $5,
          notes = $6,
          status = $7,
          updated_at = now()
        where id = $8
        returning
          id,
          code,
          name,
          lot_code as "lotCode",
          resource_type as "resourceType",
          default_location_id as "defaultLocationId",
          notes,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [
        payload.code,
        payload.name,
        payload.lotCode,
        payload.resourceType,
        payload.defaultLocationId,
        payload.notes,
        payload.status,
        id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Máquina não encontrada." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe outra máquina com este código." });
    }

    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID é obrigatório." });
    }

    const result = await query(
      `
        update machines
        set
          status = 'Inativo',
          updated_at = now()
        where id = $1
        returning
          id,
          code,
          name,
          lot_code as "lotCode",
          resource_type as "resourceType",
          default_location_id as "defaultLocationId",
          notes,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Máquina não encontrada." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;
