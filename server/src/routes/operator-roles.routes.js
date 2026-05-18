const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar funções operacionais." };

function normalizePayload(body) {
  return {
    name: String(body.name || "").trim(),
    status: String(body.status || "Ativo").trim() || "Ativo"
  };
}

function isDuplicateNameError(error) {
  return error && error.code === "23505";
}

router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const result = await query(`
      select
        id,
        name,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from operator_roles
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

    if (!payload.name) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    const result = await query(
      `
        insert into operator_roles (
          name,
          status
        )
        values ($1, $2)
        returning
          id,
          name,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [payload.name, payload.status]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isDuplicateNameError(error)) {
      return res.status(409).json({ error: "Já existe uma função operacional com este nome." });
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

    if (!payload.name) {
      return res.status(400).json({ error: "Nome é obrigatório." });
    }

    const result = await query(
      `
        update operator_roles
        set
          name = $1,
          status = $2,
          updated_at = now()
        where id = $3
        returning
          id,
          name,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [payload.name, payload.status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Função operacional não encontrada." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    if (isDuplicateNameError(error)) {
      return res.status(409).json({ error: "Já existe outra função operacional com este nome." });
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
        update operator_roles
        set
          status = 'Inativo',
          updated_at = now()
        where id = $1
        returning
          id,
          name,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Função operacional não encontrada." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;
