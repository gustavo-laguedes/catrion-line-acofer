const express = require("express");
const { pool, query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar movimentacoes de estoque." };

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizeDecimal(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const text = String(value).trim();
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T12:00:00`;
  return text;
}

function toDateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizePurchasePayload(body) {
  return {
    type: normalizeText(body.type || body.movementType) || "PURCHASE",
    movementDate: normalizeDate(body.movementDate || body.dateTime || body.date),
    supplierId: body.supplierId || null,
    supplierName: normalizeText(body.supplierName),
    locationId: body.locationId || body.destinationLocationId || null,
    locationName: normalizeText(body.locationName || body.destinationLocation),
    documentNumber: normalizeText(body.documentNumber || body.fiscalNumber),
    notes: normalizeText(body.notes || body.observation),
    items: Array.isArray(body.items) ? body.items : []
  };
}

async function resolveByIdOrName(client, table, id, name, label) {
  if (id) {
    const result = await client.query(`select id from ${table} where id = $1 limit 1`, [id]);
    if (result.rows.length) return result.rows[0].id;
  }

  if (name) {
    const result = await client.query(`select id from ${table} where name = $1 limit 1`, [name]);
    if (result.rows.length) return result.rows[0].id;
  }

  throw Object.assign(new Error(`${label} nao encontrado.`), { status: 400 });
}

async function resolveMaterial(client, item) {
  if (item.materialId) {
    const result = await client.query(
      `
        select id, code, name, coalesce(primary_unit, unit) as unit, secondary_unit
        from materials
        where id = $1
        limit 1;
      `,
      [item.materialId]
    );
    if (result.rows.length) return result.rows[0];
  }

  if (item.materialCode) {
    const result = await client.query(
      `
        select id, code, name, coalesce(primary_unit, unit) as unit, secondary_unit
        from materials
        where code = $1
        limit 1;
      `,
      [item.materialCode]
    );
    if (result.rows.length) return result.rows[0];
  }

  if (item.materialName) {
    const result = await client.query(
      `
        select id, code, name, coalesce(primary_unit, unit) as unit, secondary_unit
        from materials
        where name = $1
        limit 1;
      `,
      [item.materialName]
    );
    if (result.rows.length) return result.rows[0];
  }

  throw Object.assign(new Error(`Material ${item.materialName || item.materialCode || ""} nao encontrado.`), { status: 400 });
}

async function findOrCreatePurchaseLot(client, { lotCode, material, movementId, locationId, movementDate }) {
  const existing = await client.query(
    `
      select id, material_id
      from lots
      where lot_code = $1
      limit 1;
    `,
    [lotCode]
  );

  if (existing.rows.length) {
    if (existing.rows[0].material_id !== material.id) {
      throw Object.assign(new Error(`Lote ${lotCode} ja existe para outro material.`), { status: 409 });
    }

    await client.query(
      `
        update lots
        set current_location_id = $1, updated_at = now()
        where id = $2;
      `,
      [locationId, existing.rows[0].id]
    );

    return existing.rows[0].id;
  }

  const result = await client.query(
    `
      insert into lots (
        lot_code,
        material_id,
        origin_type,
        origin_id,
        production_date,
        current_location_id,
        status
      )
      values ($1, $2, 'PURCHASE', $3, $4::date, $5, 'Disponível')
      returning id;
    `,
    [lotCode, material.id, movementId, movementDate, locationId]
  );

  return result.rows[0].id;
}

function validatePurchase(payload, res) {
  if (payload.type !== "PURCHASE" && payload.type !== "COMPRA") {
    res.status(400).json({ error: "Neste momento apenas compras podem ser registradas pela API." });
    return false;
  }

  if (!payload.locationId && !payload.locationName) {
    res.status(400).json({ error: "Local de entrada e obrigatorio." });
    return false;
  }

  if (!payload.items.length) {
    res.status(400).json({ error: "Adicione pelo menos um item." });
    return false;
  }

  for (const item of payload.items) {
    if (!item.materialId && !item.materialCode && !item.materialName) {
      res.status(400).json({ error: "Material e obrigatorio em todos os itens." });
      return false;
    }

    if (normalizeDecimal(item.quantity) <= 0) {
      res.status(400).json({ error: "Quantidade do item deve ser maior que zero." });
      return false;
    }

    const lots = Array.isArray(item.lots) ? item.lots : [];

    if (!lots.length) {
      res.status(400).json({ error: `Informe pelo menos um lote para ${item.materialName || item.materialCode}.` });
      return false;
    }

    const lotTotal = lots.reduce((sum, lot) => sum + normalizeDecimal(lot.quantity), 0);

    if (Math.abs(lotTotal - normalizeDecimal(item.quantity)) > 0.0001) {
      res.status(400).json({ error: `A soma dos lotes precisa bater com a quantidade de ${item.materialName || item.materialCode}.` });
      return false;
    }

    if (lots.some((lot) => !normalizeText(lot.lotCode))) {
      res.status(400).json({ error: `Existe lote sem codigo em ${item.materialName || item.materialCode}.` });
      return false;
    }
  }

  return true;
}

async function getMovementById(client, id) {
  const movementResult = await client.query(
    `
      select
        sm.id,
        sm.movement_type as "movementType",
        sm.movement_date as "movementDate",
        sm.status,
        sm.document_number as "documentNumber",
        sm.notes,
        sm.created_at as "createdAt",
        sm.updated_at as "updatedAt",
        sm.supplier_id as "supplierId",
        s.name as "supplierName",
        sm.destination_location_id as "locationId",
        dl.name as "locationName"
      from stock_movements sm
      left join suppliers s on s.id = sm.supplier_id
      left join locations dl on dl.id = sm.destination_location_id
      where sm.id = $1
      limit 1;
    `,
    [id]
  );

  if (!movementResult.rows.length) return null;

  const movement = movementResult.rows[0];
  const itemResult = await client.query(
    `
      select
        smi.id,
        smi.material_id as "materialId",
        m.code as "materialCode",
        m.name as "materialName",
        smi.quantity,
        smi.unit,
        smi.secondary_quantity as "secondaryQuantity",
        smi.secondary_unit as "secondaryUnit",
        smi.notes
      from stock_movement_items smi
      join materials m on m.id = smi.material_id
      where smi.movement_id = $1
      order by m.name asc;
    `,
    [id]
  );

  for (const item of itemResult.rows) {
    const lotsResult = await client.query(
      `
        select
          sml.id,
          sml.lot_id as "lotId",
          sml.lot_code as "lotCode",
          sml.quantity,
          sml.secondary_quantity as "secondaryQuantity",
          sml.current_location_id as "locationId",
          l.name as "locationName",
          lo.production_date as "productionDate"
        from stock_movement_lots sml
        left join locations l on l.id = sml.current_location_id
        left join lots lo on lo.id = sml.lot_id
        where sml.movement_item_id = $1
        order by sml.lot_code asc;
      `,
      [item.id]
    );

    item.lots = lotsResult.rows;
  }

  movement.items = itemResult.rows;

  return normalizeMovementForClient(movement);
}

function normalizeMovementForClient(movement) {
  return {
    id: movement.id,
    type: movement.movementType,
    typeLabel: movement.movementType === "PURCHASE" ? "Compra" : movement.movementType,
    sourceType: "API",
    sourceLabel: "Neon",
    dateTime: movement.movementDate,
    movementDate: toDateOnly(movement.movementDate),
    locationId: movement.locationId,
    locationName: movement.locationName || "",
    supplierId: movement.supplierId,
    supplierName: movement.supplierName || "",
    fiscalNumber: movement.documentNumber || "",
    documentNumber: movement.documentNumber || "",
    observation: movement.notes || "",
    notes: movement.notes || "",
    status: movement.status || "Processado",
    responsibleName: "API",
    createdAt: movement.createdAt,
    updatedAt: movement.updatedAt,
    items: (movement.items || []).map((item) => ({
      id: item.id,
      movementId: movement.id,
      materialId: item.materialId,
      materialCode: item.materialCode,
      materialName: item.materialName,
      quantity: normalizeDecimal(item.quantity),
      unit: item.unit,
      secondaryQuantity: normalizeDecimal(item.secondaryQuantity),
      secondaryUnit: item.secondaryUnit || "",
      notes: item.notes || "",
      lots: (item.lots || []).map((lot) => ({
        id: lot.id,
        sourceLotId: lot.lotId,
        lotId: lot.lotId,
        lotCode: lot.lotCode,
        quantity: normalizeDecimal(lot.quantity),
        movementQuantity: normalizeDecimal(lot.quantity),
        secondaryQuantity: normalizeDecimal(lot.secondaryQuantity),
        secondaryUnit: item.secondaryUnit || "",
        locationId: lot.locationId,
        locationName: lot.locationName || movement.locationName || "",
        productionDate: lot.productionDate || movement.movementDate
      }))
    }))
  };
}

async function getMovementForStatusChange(client, id) {
  const result = await client.query(
    `
      select id, movement_type as "movementType", status
      from stock_movements
      where id = $1
      for update;
    `,
    [id]
  );

  return result.rows[0] || null;
}

function movementImpactsStock(status) {
  return status === "Processado" || status === "Reprocessado";
}

async function getMovementLotImpacts(client, movementId) {
  const result = await client.query(
    `
      select
        smi.material_id as "materialId",
        smi.unit,
        smi.secondary_unit as "secondaryUnit",
        sml.lot_id as "lotId",
        sml.quantity,
        sml.secondary_quantity as "secondaryQuantity",
        coalesce(sml.destination_location_id, sml.current_location_id, sm.destination_location_id) as "locationId"
      from stock_movements sm
      join stock_movement_items smi on smi.movement_id = sm.id
      join stock_movement_lots sml on sml.movement_item_id = smi.id
      where sm.id = $1
      order by smi.id, sml.id;
    `,
    [movementId]
  );

  return result.rows.map((row) => ({
    materialId: row.materialId,
    unit: row.unit,
    secondaryUnit: row.secondaryUnit,
    lotId: row.lotId,
    locationId: row.locationId,
    quantity: normalizeDecimal(row.quantity),
    secondaryQuantity: row.secondaryQuantity === null ? null : normalizeDecimal(row.secondaryQuantity)
  }));
}

async function ensureCancelablePurchaseBalance(client, impacts) {
  for (const impact of impacts) {
    const result = await client.query(
      `
        select quantity, secondary_quantity
        from stock_balances
        where lot_id = $1 and location_id = $2
        for update;
      `,
      [impact.lotId, impact.locationId]
    );

    const balance = result.rows[0];
    const quantity = normalizeDecimal(balance?.quantity);
    const secondaryQuantity = normalizeDecimal(balance?.secondary_quantity);

    if (!balance || quantity + 0.0001 < impact.quantity) {
      throw Object.assign(new Error("Saldo insuficiente para cancelar esta compra. O lote ja pode ter sido consumido ou movimentado."), { status: 409 });
    }

    if (impact.secondaryQuantity !== null && secondaryQuantity + 0.0001 < impact.secondaryQuantity) {
      throw Object.assign(new Error("Saldo secundario insuficiente para cancelar esta compra."), { status: 409 });
    }
  }
}

async function applyPurchaseImpact(client, movementId, direction) {
  const impacts = await getMovementLotImpacts(client, movementId);

  if (direction < 0) {
    await ensureCancelablePurchaseBalance(client, impacts);
  }

  for (const impact of impacts) {
    const quantityDelta = impact.quantity * direction;
    const secondaryDelta = impact.secondaryQuantity === null ? null : impact.secondaryQuantity * direction;

    await client.query(
      `
        insert into stock_balances (
          lot_id,
          material_id,
          location_id,
          quantity,
          secondary_quantity,
          unit,
          secondary_unit,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7, 'Disponível')
        on conflict (lot_id, location_id)
        do update set
          quantity = stock_balances.quantity + excluded.quantity,
          secondary_quantity = case
            when stock_balances.secondary_quantity is null and excluded.secondary_quantity is null then null
            else coalesce(stock_balances.secondary_quantity, 0) + coalesce(excluded.secondary_quantity, 0)
          end,
          unit = excluded.unit,
          secondary_unit = excluded.secondary_unit,
          status = case
            when stock_balances.quantity + excluded.quantity > 0 then 'Disponível'
            else 'Sem saldo'
          end,
          updated_at = now();
      `,
      [impact.lotId, impact.materialId, impact.locationId, quantityDelta, secondaryDelta, impact.unit, impact.secondaryUnit]
    );
  }

  await client.query(
    `
      update stock_balances
      set
        quantity = 0,
        secondary_quantity = case when secondary_quantity is null then null else greatest(secondary_quantity, 0) end,
        status = 'Sem saldo',
        updated_at = now()
      where lot_id in (
        select distinct sml.lot_id
        from stock_movement_items smi
        join stock_movement_lots sml on sml.movement_item_id = smi.id
        where smi.movement_id = $1 and sml.lot_id is not null
      )
      and quantity < 0.0001;
    `,
    [movementId]
  );

  await refreshLotsForMovement(client, movementId);
}

async function refreshLotsForMovement(client, movementId) {
  await client.query(
    `
      with impacted_lots as (
        select distinct sml.lot_id
        from stock_movement_items smi
        join stock_movement_lots sml on sml.movement_item_id = smi.id
        where smi.movement_id = $1 and sml.lot_id is not null
      ),
      lot_totals as (
        select
          il.lot_id,
          coalesce(sum(sb.quantity), 0) as total_quantity,
          (
            array_agg(sb.location_id order by sb.quantity desc, sb.updated_at desc)
            filter (where sb.quantity > 0)
          )[1] as current_location_id
        from impacted_lots il
        left join stock_balances sb on sb.lot_id = il.lot_id
        group by il.lot_id
      )
      update lots lo
      set
        current_location_id = lot_totals.current_location_id,
        status = case
          when lot_totals.total_quantity > 0 then 'Disponível'
          when lo.origin_type = 'PURCHASE' and lo.origin_id = $1 then 'Cancelado'
          else 'Sem saldo'
        end,
        updated_at = now()
      from lot_totals
      where lo.id = lot_totals.lot_id;
    `,
    [movementId]
  );
}

async function changePurchaseMovementStatus(req, res, nextStatus, direction) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const movement = await getMovementForStatusChange(client, req.params.id);

    if (!movement) {
      await client.query("rollback");
      return res.status(404).json({ error: "Movimentacao nao encontrada." });
    }

    if (movement.movementType !== "PURCHASE") {
      await client.query("rollback");
      return res.status(400).json({ error: "Neste momento cancelamento/reprocessamento via API esta disponivel apenas para compras." });
    }

    const shouldApplyImpact = direction < 0
      ? movementImpactsStock(movement.status)
      : movement.status === "Cancelado";

    if (shouldApplyImpact) {
      await applyPurchaseImpact(client, movement.id, direction);
    }

    await client.query(
      `
        update stock_movements
        set status = $1, updated_at = now()
        where id = $2;
      `,
      [nextStatus, movement.id]
    );

    const updatedMovement = await getMovementById(client, movement.id);
    await client.query("commit");

    return res.json(updatedMovement);
  } catch (error) {
    await client.query("rollback");
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro interno ao alterar status da movimentacao.",
      detail: error.status ? null : error.message
    });
  } finally {
    client.release();
  }
}

router.get("/", async (req, res) => {
  const client = await pool.connect();

  try {
    const result = await client.query(`
      select id
      from stock_movements
      where movement_type = 'PURCHASE'
      order by movement_date desc, created_at desc;
    `);

    const movements = [];

    for (const row of result.rows) {
      movements.push(await getMovementById(client, row.id));
    }

    return res.json(movements.filter(Boolean));
  } catch (error) {
    console.error("Erro ao listar movimentacoes de estoque:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.post("/:id/cancel", async (req, res) => {
  return changePurchaseMovementStatus(req, res, "Cancelado", -1);
});

router.post("/:id/reprocess", async (req, res) => {
  return changePurchaseMovementStatus(req, res, "Reprocessado", 1);
});

router.post("/", async (req, res) => {
  const payload = normalizePurchasePayload(req.body || {});

  if (!validatePurchase(payload, res)) return null;

  const client = await pool.connect();

  try {
    console.info("Iniciando registro de compra no estoque:", {
      documentNumber: payload.documentNumber,
      supplierName: payload.supplierName,
      locationName: payload.locationName,
      items: payload.items.length
    });

    await client.query("begin");

    const locationId = await resolveByIdOrName(client, "locations", payload.locationId, payload.locationName, "Local");
    const supplierId = payload.supplierId || payload.supplierName
      ? await resolveByIdOrName(client, "suppliers", payload.supplierId, payload.supplierName, "Fornecedor")
      : null;

    const movementResult = await client.query(
      `
        insert into stock_movements (
          movement_type,
          movement_date,
          status,
          destination_location_id,
          supplier_id,
          document_number,
          notes
        )
        values ('PURCHASE', $1, 'Processado', $2, $3, $4, $5)
        returning id;
      `,
      [payload.movementDate, locationId, supplierId, payload.documentNumber, payload.notes]
    );

    const movementId = movementResult.rows[0].id;
    console.info("Movimento de compra criado:", { movementId });

    for (const item of payload.items) {
      const material = await resolveMaterial(client, item);
      const quantity = normalizeDecimal(item.quantity);
      const secondaryQuantity = item.secondaryQuantity === undefined || item.secondaryQuantity === null || item.secondaryQuantity === ""
        ? null
        : normalizeDecimal(item.secondaryQuantity);
      const unit = normalizeText(item.unit) || material.unit || "un";
      const secondaryUnit = normalizeText(item.secondaryUnit) || material.secondary_unit || null;

      const itemResult = await client.query(
        `
          insert into stock_movement_items (
            movement_id,
            material_id,
            quantity,
            unit,
            secondary_quantity,
            secondary_unit,
            notes
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning id;
        `,
        [movementId, material.id, quantity, unit, secondaryQuantity, secondaryUnit, normalizeText(item.notes)]
      );

      const movementItemId = itemResult.rows[0].id;
      console.info("Item de compra criado:", { movementId, movementItemId, materialId: material.id, quantity });

      for (const lot of item.lots) {
        const lotCode = normalizeText(lot.lotCode).toUpperCase();
        const lotQuantity = normalizeDecimal(lot.quantity);
        const lotSecondaryQuantity = lot.secondaryQuantity === undefined || lot.secondaryQuantity === null || lot.secondaryQuantity === ""
          ? null
          : normalizeDecimal(lot.secondaryQuantity);
        const lotId = await findOrCreatePurchaseLot(client, {
          lotCode,
          material,
          movementId,
          locationId,
          movementDate: payload.movementDate
        });

        await client.query(
          `
            insert into stock_movement_lots (
              movement_item_id,
              lot_id,
              lot_code,
              quantity,
              secondary_quantity,
              current_location_id,
              destination_location_id,
              notes
            )
            values ($1, $2, $3, $4, $5, $6, $6, $7);
          `,
          [movementItemId, lotId, lotCode, lotQuantity, lotSecondaryQuantity, locationId, normalizeText(lot.notes)]
        );

        await client.query(
          `
            insert into stock_balances (
              lot_id,
              material_id,
              location_id,
              quantity,
              secondary_quantity,
              unit,
              secondary_unit,
              status
            )
            values ($1, $2, $3, $4, $5, $6, $7, 'Disponível')
            on conflict (lot_id, location_id)
            do update set
              quantity = stock_balances.quantity + excluded.quantity,
              secondary_quantity = coalesce(stock_balances.secondary_quantity, 0) + coalesce(excluded.secondary_quantity, 0),
              unit = excluded.unit,
              secondary_unit = excluded.secondary_unit,
              status = 'Disponível',
              updated_at = now();
          `,
          [lotId, material.id, locationId, lotQuantity, lotSecondaryQuantity, unit, secondaryUnit]
        );

        console.info("Lote/saldo de compra atualizado:", {
          movementId,
          movementItemId,
          lotId,
          lotCode,
          locationId,
          lotQuantity
        });
      }
    }

    const movement = await getMovementById(client, movementId);
    await client.query("commit");

    console.info("Compra registrada com sucesso:", { movementId });
    return res.status(201).json(movement);
  } catch (error) {
    await client.query("rollback");
    console.error("Erro ao registrar compra:", {
      message: error.message,
      detail: error.detail,
      code: error.code,
      constraint: error.constraint
    });

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({
      error: "Erro interno ao registrar compra.",
      detail: error.detail || error.message || null,
      code: error.code || null,
      constraint: error.constraint || null
    });
  } finally {
    client.release();
  }
});

module.exports = router;
