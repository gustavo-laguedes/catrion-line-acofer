const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar locais." };

function normalizePayload(body) {
  return {
    code: String(body.code || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    type: String(body.type || "").trim(),
    sale: Boolean(body.sale),
    production: Boolean(body.production),
    storage: Boolean(body.storage),
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
        type,
        sale,
        production,
        storage,
        case
          when lower(status) = 'active' then 'Ativo'
          when lower(status) = 'inactive' then 'Inativo'
          else status
        end as status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from locations
      ${includeInactive ? "" : "where status in ('Ativo', 'active')"}
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

    if (!payload.code) {
      return res.status(400).json({ error: "Código é obrigatório." });
    }

    if (!payload.name) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    if (!payload.type) {
      return res.status(400).json({ error: "Tipo é obrigatório." });
    }

    const result = await query(
      `
        insert into locations (
          code,
          name,
          type,
          sale,
          production,
          storage,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning
          id,
          code,
          name,
          type,
          sale,
          production,
          storage,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [
        payload.code,
        payload.name,
        payload.type,
        payload.sale,
        payload.production,
        payload.storage,
        payload.status
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe um local com este código." });
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

    if (!payload.type) {
      return res.status(400).json({ error: "Tipo é obrigatório." });
    }

    const result = await query(
      `
        update locations
        set
          code = $1,
          name = $2,
          type = $3,
          sale = $4,
          production = $5,
          storage = $6,
          status = $7,
          updated_at = now()
        where id = $8
        returning
          id,
          code,
          name,
          type,
          sale,
          production,
          storage,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [
        payload.code,
        payload.name,
        payload.type,
        payload.sale,
        payload.production,
        payload.storage,
        payload.status,
        id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Local não encontrado." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe outro local com este código." });
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
        update locations
        set
          status = 'Inativo',
          updated_at = now()
        where id = $1
        returning
          id,
          code,
          name,
          type,
          sale,
          production,
          storage,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Local não encontrado." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;
