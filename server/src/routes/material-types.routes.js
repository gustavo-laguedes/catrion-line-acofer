const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar tipos de material." };

function normalizePayload(body) {
  return {
    code: String(body.code || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    description: body.description ? String(body.description).trim() || null : null,
    status: String(body.status || "Ativo").trim() || "Ativo"
  };
}

function isDuplicateCodeError(error) {
  return error && error.code === "23505";
}

router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const result = await query(`
      select
        id,
        code,
        name,
        description,
        case
          when lower(status) = 'active' then 'Ativo'
          when lower(status) = 'inactive' then 'Inativo'
          else status
        end as status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from material_types
      ${includeInactive ? "" : "where status in ('Ativo', 'active')"}
      order by name asc;
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json(INTERNAL_ERROR);
  }
});

router.post("/", async (req, res) => {
  try {
    const payload = normalizePayload(req.body || {});

    if (!payload.code) {
      return res.status(400).json({ error: "Código é obrigatório." });
    }

    if (!payload.name) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    const result = await query(
      `
        insert into material_types (
          code,
          name,
          description,
          status
        )
        values ($1, $2, $3, $4)
        returning
          id,
          code,
          name,
          description,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [payload.code, payload.name, payload.description, payload.status]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe um tipo de material com este código." });
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

    if (!payload.code) {
      return res.status(400).json({ error: "Código é obrigatório." });
    }

    if (!payload.name) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    const result = await query(
      `
        update material_types
        set
          code = $1,
          name = $2,
          description = $3,
          status = $4,
          updated_at = now()
        where id = $5
        returning
          id,
          code,
          name,
          description,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [payload.code, payload.name, payload.description, payload.status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Tipo de material não encontrado." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe outro tipo de material com este código." });
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
        update material_types
        set
          status = 'Inativo',
          updated_at = now()
        where id = $1
        returning
          id,
          code,
          name,
          description,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Tipo de material não encontrado." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;
