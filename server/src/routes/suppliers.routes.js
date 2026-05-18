const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar fornecedores." };

function normalizePayload(body) {
  return {
    name: String(body.name || "").trim(),
    document: body.document ? String(body.document).trim() || null : null,
    contact: body.contact ? String(body.contact).trim() || null : null,
    status: String(body.status || "Ativo").trim() || "Ativo"
  };
}

function isDuplicateDocumentError(error) {
  return error && error.code === "23505";
}

function validatePayload(payload, res) {
  if (!payload.name) {
    res.status(400).json({ error: "Nome é obrigatório." });
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
        name,
        document,
        contact,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from suppliers
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
        insert into suppliers (
          name,
          document,
          contact,
          status
        )
        values ($1, $2, $3, $4)
        returning
          id,
          name,
          document,
          contact,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [payload.name, payload.document, payload.contact, payload.status]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    if (isDuplicateDocumentError(error)) {
      return res.status(409).json({ error: "Já existe um fornecedor com este documento." });
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
        update suppliers
        set
          name = $1,
          document = $2,
          contact = $3,
          status = $4,
          updated_at = now()
        where id = $5
        returning
          id,
          name,
          document,
          contact,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [payload.name, payload.document, payload.contact, payload.status, id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Fornecedor não encontrado." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    if (isDuplicateDocumentError(error)) {
      return res.status(409).json({ error: "Já existe outro fornecedor com este documento." });
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
        update suppliers
        set
          status = 'Inativo',
          updated_at = now()
        where id = $1
        returning
          id,
          name,
          document,
          contact,
          status,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Fornecedor não encontrado." });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;
