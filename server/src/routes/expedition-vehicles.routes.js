const express = require("express");
const { pool } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar veículos de expedição." };

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizePayload(body = {}) {
  return {
    name: normalizeText(body.name),
    plate: normalizeText(body.plate)?.toUpperCase() || null,
    type: normalizeText(body.type),
    status: normalizeText(body.status) || "Ativo"
  };
}

function normalizeVehicle(row) {
  return {
    id: row.id,
    name: row.name || "",
    plate: row.plate || "",
    type: row.type || "",
    status: row.status || "Ativo",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

async function ensureVehicleSchema(client) {
  await client.query('create extension if not exists "uuid-ossp";');
  await client.query(`
    create table if not exists expedition_vehicles (
      id uuid primary key default uuid_generate_v4(),
      name text not null,
      plate text not null,
      type text not null,
      status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await client.query("create unique index if not exists idx_expedition_vehicles_plate on expedition_vehicles (upper(plate));");
}

function validatePayload(payload, res) {
  if (!payload.name) {
    res.status(400).json({ error: "Nome é obrigatório." });
    return false;
  }

  if (!payload.plate) {
    res.status(400).json({ error: "Placa é obrigatória." });
    return false;
  }

  if (!payload.type) {
    res.status(400).json({ error: "Tipo é obrigatório." });
    return false;
  }

  if (!["Ativo", "Inativo"].includes(payload.status)) {
    res.status(400).json({ error: "Status inválido." });
    return false;
  }

  return true;
}

function isDuplicatePlateError(error) {
  return error?.code === "23505" && String(error?.constraint || "").includes("expedition_vehicles_plate");
}

router.get("/", async (req, res) => {
  const client = await pool.connect();

  try {
    await ensureVehicleSchema(client);
    const includeInactive = req.query.includeInactive === "true";
    const result = await client.query(`
      select
        id,
        name,
        plate,
        type,
        status,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from expedition_vehicles
      ${includeInactive ? "" : "where status = 'Ativo'"}
      order by name asc, plate asc;
    `);

    return res.json(result.rows.map(normalizeVehicle));
  } catch (error) {
    console.error("Erro ao listar veículos de expedição:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.post("/", async (req, res) => {
  const client = await pool.connect();

  try {
    await ensureVehicleSchema(client);
    const payload = normalizePayload(req.body);
    if (!validatePayload(payload, res)) return null;

    const result = await client.query(
      `
        insert into expedition_vehicles (name, plate, type, status)
        values ($1, $2, $3, $4)
        returning id, name, plate, type, status, created_at as "createdAt", updated_at as "updatedAt";
      `,
      [payload.name, payload.plate, payload.type, payload.status]
    );

    return res.status(201).json(normalizeVehicle(result.rows[0]));
  } catch (error) {
    if (isDuplicatePlateError(error)) {
      return res.status(409).json({ error: "Já existe um veículo com esta placa." });
    }

    console.error("Erro ao criar veículo de expedição:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    await ensureVehicleSchema(client);
    const payload = normalizePayload(req.body);
    if (!validatePayload(payload, res)) return null;

    const result = await client.query(
      `
        update expedition_vehicles
        set
          name = $1,
          plate = $2,
          type = $3,
          status = $4,
          updated_at = now()
        where id = $5
        returning id, name, plate, type, status, created_at as "createdAt", updated_at as "updatedAt";
      `,
      [payload.name, payload.plate, payload.type, payload.status, req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Veículo não encontrado." });
    }

    return res.json(normalizeVehicle(result.rows[0]));
  } catch (error) {
    if (isDuplicatePlateError(error)) {
      return res.status(409).json({ error: "Já existe outro veículo com esta placa." });
    }

    console.error("Erro ao atualizar veículo de expedição:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    await ensureVehicleSchema(client);
    const result = await client.query(
      `
        update expedition_vehicles
        set status = 'Inativo', updated_at = now()
        where id = $1
        returning id, name, plate, type, status, created_at as "createdAt", updated_at as "updatedAt";
      `,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Veículo não encontrado." });
    }

    return res.json(normalizeVehicle(result.rows[0]));
  } catch (error) {
    console.error("Erro ao inativar veículo de expedição:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

module.exports = router;
