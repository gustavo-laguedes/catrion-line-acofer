const express = require("express");
const { pool } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar producoes." };

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

function normalizeUnitName(unit) {
  return String(unit || "").trim().toLowerCase();
}

function normalizeUnitForComparison(unit) {
  return normalizeUnitName(unit)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isManualOrEmptyUnit(unit) {
  const normalized = normalizeUnitForComparison(unit);

  return (
    !normalized ||
    normalized === "-" ||
    normalized === "manual" ||
    normalized === "outro" ||
    normalized.includes("manual") ||
    normalized.includes("informada operacionalmente") ||
    normalized.includes("informado na producao")
  );
}

function toDateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function getOutputQuantityForConsumedUnit(outputMaterial, consumedUnit, outputLots) {
  const unit = normalizeUnitForComparison(consumedUnit);
  const primaryUnit = normalizeUnitForComparison(outputMaterial?.unit || outputMaterial?.primaryUnit || outputMaterial?.primary_unit);
  const secondaryUnit = normalizeUnitForComparison(outputMaterial?.secondary_unit || outputMaterial?.secondaryUnit);

  if (unit && secondaryUnit && unit === secondaryUnit) {
    return outputLots.reduce((sum, lot) => sum + normalizeDecimal(lot.secondaryQuantity), 0);
  }

  if (!unit || unit === primaryUnit) {
    return outputLots.reduce((sum, lot) => sum + normalizeDecimal(lot.quantity), 0);
  }

  return null;
}

function resolveVariableConsumptionExpectedQuantity(outputMaterial, inputUnit, productiveConsumedLots, outputLots) {
  const unitsToTry = [];

  if (!isManualOrEmptyUnit(inputUnit)) {
    unitsToTry.push({ source: "model", unit: inputUnit });
  }

  for (const consumed of productiveConsumedLots) {
    unitsToTry.push({ source: "consumedLot", unit: consumed.sourceLot.unit });
    unitsToTry.push({ source: "consumedLotSecondary", unit: consumed.sourceLot.secondary_unit });
  }

  for (const candidate of unitsToTry) {
    const expectedQuantity = getOutputQuantityForConsumedUnit(outputMaterial, candidate.unit, outputLots);

    if (expectedQuantity !== null) {
      return {
        expectedQuantity,
        resolvedUnit: candidate.unit,
        resolvedFrom: candidate.source
      };
    }
  }

  const inputUnitIsManual = isManualOrEmptyUnit(inputUnit);
  const normalizedInputUnit = normalizeUnitForComparison(inputUnit);
  const matchesConsumedPrimaryUnit = productiveConsumedLots.some((consumed) => {
    const consumedPrimaryUnit = normalizeUnitForComparison(consumed.sourceLot.unit);
    return consumedPrimaryUnit && (inputUnitIsManual || consumedPrimaryUnit === normalizedInputUnit);
  });

  if (matchesConsumedPrimaryUnit) {
    return {
      expectedQuantity: outputLots.reduce((sum, lot) => sum + normalizeDecimal(lot.quantity), 0),
      resolvedUnit: productiveConsumedLots.find((consumed) => consumed.sourceLot.unit)?.sourceLot.unit || inputUnit,
      resolvedFrom: "consumedMaterialPrimaryFallback"
    };
  }

  return {
    expectedQuantity: null,
    resolvedUnit: null,
    resolvedFrom: null
  };
}

function isVariableConsumptionMode(mode) {
  const normalized = normalizeUnitForComparison(mode);

  return normalized === "variavel na producao";
}

function isIndustrialLossConsumption(consumed) {
  return Boolean(consumed?.isIndustrialLoss) || consumed?.eventType === "INDUSTRIAL_LOSS";
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

async function resolveOperators(client, operatorIds = [], operatorCodes = []) {
  const ids = [];

  for (const id of operatorIds.filter(Boolean)) {
    const result = await client.query("select id from operators where id = $1 limit 1", [id]);
    if (result.rows.length) ids.push(result.rows[0].id);
  }

  for (const code of operatorCodes.filter(Boolean)) {
    const result = await client.query("select id from operators where code = $1 limit 1", [code]);
    if (result.rows.length && !ids.includes(result.rows[0].id)) ids.push(result.rows[0].id);
  }

  if (!ids.length) {
    throw Object.assign(new Error("Selecione ao menos um operador."), { status: 400 });
  }

  return ids;
}

async function resolveProductionModel(client, materialId, modelId, modelName) {
  if (modelId) {
    const result = await client.query(
      "select id from material_production_models where id = $1 and material_id = $2 limit 1",
      [modelId, materialId]
    );
    if (result.rows.length) return result.rows[0].id;
  }

  if (modelName) {
    const result = await client.query(
      "select id from material_production_models where name = $1 and material_id = $2 limit 1",
      [modelName, materialId]
    );
    if (result.rows.length) return result.rows[0].id;
  }

  throw Object.assign(new Error("Modelo de producao nao encontrado para o material."), { status: 400 });
}

async function getProductionById(client, id) {
  const result = await client.query(
    `
      select
        p.id,
        p.production_date as "productionDate",
        p.status,
        p.notes,
        p.created_at as "createdAt",
        p.updated_at as "updatedAt",
        p.material_id as "outputMaterialId",
        m.code as "outputMaterialCode",
        m.name as "outputMaterialName",
        mt.name as "outputMaterialType",
        coalesce(m.primary_unit, m.unit) as "outputUnit",
        m.secondary_unit as "outputSecondaryUnit",
        p.production_model_id as "productionModelId",
        pm.name as "productionModelName",
        p.machine_id as "machineId",
        mach.name as "machineName",
        p.location_id as "locationId",
        loc.name as "locationName",
        coalesce(sum(pol.quantity) filter (where lo.status <> 'Cancelado'), 0) as "outputQuantity",
        coalesce(sum(pol.secondary_quantity) filter (where lo.status <> 'Cancelado'), 0) as "outputSecondaryQuantity",
        (array_agg(pol.lot_code order by pol.lot_code asc) filter (where lo.status <> 'Cancelado'))[1] as "generatedLotCode"
      from productions p
      join materials m on m.id = p.material_id
      left join material_types mt on mt.id = m.material_type_id
      left join material_production_models pm on pm.id = p.production_model_id
      left join machines mach on mach.id = p.machine_id
      left join locations loc on loc.id = p.location_id
      left join production_output_lots pol on pol.production_id = p.id
      left join lots lo on lo.id = pol.lot_id
      where p.id = $1
      group by p.id, m.id, mt.name, pm.name, mach.name, loc.name;
    `,
    [id]
  );

  if (!result.rows.length) return null;

  const production = result.rows[0];

  const consumedResult = await client.query(
    `
      select
        pcl.id,
        pcl.lot_id as "sourceLotId",
        lo.lot_code as "lotCode",
        im.name as "inputMaterial",
        im.code as "inputCode",
        pcl.quantity,
        pcl.unit as "inputUnit",
        pcl.secondary_quantity as "secondaryQuantity",
        pcl.secondary_unit as "secondaryUnit",
        loc.name as "locationName",
        coalesce(le.event_type, 'PRODUCTION_CONSUME') as "eventType"
      from production_consumed_lots pcl
      join lots lo on lo.id = pcl.lot_id
      join materials im on im.id = lo.material_id
      left join stock_balances sb on sb.lot_id = lo.id and sb.location_id = $2
      left join locations loc on loc.id = $2
      left join lateral (
        select event_type
        from lot_events
        where reference_type = 'production'
          and reference_id = pcl.production_id
          and lot_id = pcl.lot_id
          and abs(abs(quantity) - pcl.quantity) < 0.0001
          and event_type in ('PRODUCTION_CONSUME', 'INDUSTRIAL_LOSS')
        order by
          case when event_type = 'INDUSTRIAL_LOSS' then 0 else 1 end,
          event_date desc
        limit 1
      ) le on true
      where pcl.production_id = $1
      order by lo.lot_code asc;
    `,
    [id, production.locationId]
  );

  const outputLotsResult = await client.query(
    `
      select
        pol.id,
        pol.lot_id as "lotId",
        pol.lot_code as "lotCode",
        pol.quantity,
        pol.unit,
        pol.secondary_quantity as "secondaryQuantity",
        pol.secondary_unit as "secondaryUnit",
        loc.name as "locationName",
        lo.production_date as "productionDate",
        lo.created_at as "createdAt",
        lo.status as "lotStatus"
      from production_output_lots pol
      join lots lo on lo.id = pol.lot_id
      left join locations loc on loc.id = lo.current_location_id
      where pol.production_id = $1
      order by pol.lot_code asc;
    `,
    [id]
  );

  const operatorsResult = await client.query(
    `
      select op.id, op.code, op.name
      from production_operators po
      join operators op on op.id = po.operator_id
      where po.production_id = $1
      order by op.name asc;
    `,
    [id]
  );

  return normalizeProductionForClient(production, consumedResult.rows, outputLotsResult.rows, operatorsResult.rows);
}

function normalizeProductionForClient(production, consumedRows, outputLots, operators) {
  return {
    id: production.id,
    productionDate: toDateOnly(production.productionDate),
    dateTime: production.productionDate,
    locationId: production.locationId,
    locationName: production.locationName || "",
    outputMaterialId: production.outputMaterialId,
    outputMaterialName: production.outputMaterialName,
    outputMaterialCode: production.outputMaterialCode,
    outputMaterialType: production.outputMaterialType || "",
    outputUnit: production.outputUnit || "un",
    outputSecondaryUnit: production.outputSecondaryUnit || "",
    productionModelId: production.productionModelId,
    productionModelName: production.productionModelName || "",
    machineId: production.machineId,
    machineName: production.machineName || "",
    responsibleName: operators.map((operator) => operator.name).join(" / "),
    responsibleCodes: operators.map((operator) => operator.code),
    outputQuantity: normalizeDecimal(production.outputQuantity),
    outputSecondaryQuantity: normalizeDecimal(production.outputSecondaryQuantity),
    generatedLotCode: production.generatedLotCode || "",
    observation: production.notes || "",
    status: production.status || "Processado",
    createdAt: production.createdAt,
    updatedAt: production.updatedAt,
    consumedItems: Object.values(consumedRows.reduce((groups, row) => {
      const key = row.inputCode || row.inputMaterial || row.sourceLotId;

      if (!groups[key]) {
        groups[key] = {
          id: row.id,
          productionRecordId: production.id,
          inputMaterial: row.inputMaterial,
          inputCode: row.inputCode,
          inputUnit: row.inputUnit,
          requiredQuantity: 0,
          consumedLots: [],
          sourceLocation: production.locationName || ""
        };
      }

      const quantity = normalizeDecimal(row.quantity);
      groups[key].requiredQuantity += quantity;
      groups[key].consumedLots.push({
        sourceLotId: row.sourceLotId,
        lotId: row.sourceLotId,
        lotCode: row.lotCode,
        locationName: row.locationName || production.locationName || "",
        quantity,
        secondaryQuantity: normalizeDecimal(row.secondaryQuantity),
        eventType: row.eventType || "PRODUCTION_CONSUME",
        type: row.eventType || "PRODUCTION_CONSUME",
        isIndustrialLoss: row.eventType === "INDUSTRIAL_LOSS"
      });

      return groups;
    }, {})),
    producedLots: outputLots.map((lot) => ({
      id: lot.id,
      productionRecordId: production.id,
      lotId: lot.lotId,
      materialName: production.outputMaterialName,
      materialCode: production.outputMaterialCode,
      materialType: production.outputMaterialType || "",
      lotCode: lot.lotCode,
      locationName: lot.locationName || production.locationName || "",
      quantity: normalizeDecimal(lot.quantity),
      secondaryQuantity: normalizeDecimal(lot.secondaryQuantity),
      unit: lot.unit || production.outputUnit || "un",
      secondaryUnit: lot.secondaryUnit || production.outputSecondaryUnit || "",
      status: lot.lotStatus || "",
      lotStatus: lot.lotStatus || "",
      origin: "Produção",
      productionDate: lot.productionDate || production.productionDate,
      createdAt: lot.createdAt
    }))
  };
}

async function refreshLotStatus(client, lotId) {
  await client.query(
    `
      with totals as (
        select
          coalesce(sum(quantity), 0) as total_quantity,
          (
            array_agg(location_id order by quantity desc, updated_at desc)
            filter (where quantity > 0)
          )[1] as current_location_id
        from stock_balances
        where lot_id = $1
      )
      update lots
      set
        current_location_id = totals.current_location_id,
        status = case when totals.total_quantity > 0 then 'Disponível' else 'Sem saldo' end,
        updated_at = now()
      from totals
      where lots.id = $1;
    `,
    [lotId]
  );
}

async function getProductionForStatusChange(client, id) {
  const result = await client.query(
    `
      select id, status, location_id as "locationId"
      from productions
      where id = $1
      for update;
    `,
    [id]
  );

  return result.rows[0] || null;
}

function productionImpactsStock(status) {
  return status === "Processado" || status === "Reprocessado";
}

async function getProductionImpactRows(client, productionId, outputMode = "all") {
  const consumed = await client.query(
    `
      select
        p.location_id as "locationId",
        pcl.lot_id as "lotId",
        lo.material_id as "materialId",
        pcl.quantity,
        pcl.secondary_quantity as "secondaryQuantity",
        pcl.unit,
        pcl.secondary_unit as "secondaryUnit"
      from production_consumed_lots pcl
      join productions p on p.id = pcl.production_id
      join lots lo on lo.id = pcl.lot_id
      where pcl.production_id = $1;
    `,
    [productionId]
  );

  const outputStatusFilter = outputMode === "active"
    ? "and lo.status <> 'Cancelado'"
    : outputMode === "canceled"
      ? "and lo.status = 'Cancelado'"
      : "";

  const outputs = await client.query(
    `
      select
        p.location_id as "locationId",
        pol.lot_id as "lotId",
        lo.material_id as "materialId",
        pol.quantity,
        pol.secondary_quantity as "secondaryQuantity",
        pol.unit,
        pol.secondary_unit as "secondaryUnit"
      from production_output_lots pol
      join productions p on p.id = pol.production_id
      join lots lo on lo.id = pol.lot_id
      where pol.production_id = $1
      ${outputStatusFilter};
    `,
    [productionId]
  );

  return { consumed: consumed.rows, outputs: outputs.rows };
}

async function ensureBalancesCanSubtract(client, impacts, message) {
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
    const impactQuantity = normalizeDecimal(impact.quantity);
    const impactSecondaryQuantity = impact.secondaryQuantity === null ? null : normalizeDecimal(impact.secondaryQuantity);

    if (!balance || quantity + 0.0001 < impactQuantity) {
      throw Object.assign(new Error(message), { status: 409 });
    }

    if (impactSecondaryQuantity !== null && secondaryQuantity + 0.0001 < impactSecondaryQuantity) {
      throw Object.assign(new Error(message), { status: 409 });
    }
  }
}

async function applyBalanceDelta(client, impact, direction) {
  const quantityDelta = normalizeDecimal(impact.quantity) * direction;
  const secondaryDelta = impact.secondaryQuantity === null ? null : normalizeDecimal(impact.secondaryQuantity) * direction;

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
    [
      impact.lotId,
      impact.materialId,
      impact.locationId,
      quantityDelta,
      secondaryDelta,
      impact.unit || "un",
      impact.secondaryUnit || null
    ]
  );
}

async function writeProductionLotEvent(client, impact, productionId, direction, eventType, notes) {
  await client.query(
    `
      insert into lot_events (
        lot_id,
        event_type,
        event_date,
        reference_type,
        reference_id,
        location_id,
        quantity,
        secondary_quantity,
        unit,
        secondary_unit,
        notes
      )
      values ($1, $2, now(), 'production', $3, $4, $5, $6, $7, $8, $9);
    `,
    [
      impact.lotId,
      eventType,
      productionId,
      impact.locationId,
      normalizeDecimal(impact.quantity) * direction,
      impact.secondaryQuantity === null ? null : normalizeDecimal(impact.secondaryQuantity) * direction,
      impact.unit || "un",
      impact.secondaryUnit || null,
      notes
    ]
  );
}

async function applyProductionStockImpact(client, productionId, action) {
  const impacts = await getProductionImpactRows(client, productionId, action === "reprocess" ? "canceled" : "active");

  if (action === "cancel") {
    await ensureBalancesCanSubtract(
      client,
      impacts.outputs,
      "Saldo insuficiente para cancelar esta producao. Algum lote produzido ja pode ter sido consumido ou movimentado."
    );

    for (const consumed of impacts.consumed) {
      await applyBalanceDelta(client, consumed, 1);
      await writeProductionLotEvent(client, consumed, productionId, 1, "PRODUCTION_CANCEL_CONSUME_REVERSAL", "Estorno de consumo por cancelamento de producao");
    }

    for (const output of impacts.outputs) {
      await applyBalanceDelta(client, output, -1);
      await writeProductionLotEvent(client, output, productionId, -1, "PRODUCTION_CANCEL_OUTPUT_REVERSAL", "Estorno de entrada por cancelamento de producao");
      await client.query(
        `
          update lots
          set status = 'Cancelado', current_location_id = null, updated_at = now()
          where id = $1 and origin_type = 'PRODUCTION' and origin_id = $2;
        `,
        [output.lotId, productionId]
      );
    }
  }

  if (action === "reprocess") {
    await ensureBalancesCanSubtract(
      client,
      impacts.consumed,
      "Saldo insuficiente para reprocessar esta producao. O lote consumido nao possui saldo disponivel."
    );

    for (const consumed of impacts.consumed) {
      await applyBalanceDelta(client, consumed, -1);
      await writeProductionLotEvent(client, consumed, productionId, -1, "PRODUCTION_REPROCESS_CONSUME", "Baixa por reprocessamento de producao");
    }

    for (const output of impacts.outputs) {
      await applyBalanceDelta(client, output, 1);
      await writeProductionLotEvent(client, output, productionId, 1, "PRODUCTION_REPROCESS_OUTPUT", "Entrada por reprocessamento de producao");
      await client.query(
        `
          update lots
          set status = 'Disponível', current_location_id = $3, updated_at = now()
          where id = $1 and origin_type = 'PRODUCTION' and origin_id = $2;
        `,
        [output.lotId, productionId, output.locationId]
      );
    }
  }

  for (const lotId of [...impacts.consumed, ...impacts.outputs].map((impact) => impact.lotId)) {
    await refreshLotStatus(client, lotId);
  }

  if (action === "cancel") {
    for (const output of impacts.outputs) {
      await client.query(
        `
          update lots
          set status = 'Cancelado', current_location_id = null, updated_at = now()
          where id = $1 and origin_type = 'PRODUCTION' and origin_id = $2;
        `,
        [output.lotId, productionId]
      );
    }
  }
}

async function getProductionOutputLotForPartial(client, productionId, outputLotId) {
  const result = await client.query(
    `
      select
        p.id as "productionId",
        p.status as "productionStatus",
        p.location_id as "locationId",
        pcl.id as "consumedRowId",
        pcl.lot_id as "consumedLotId",
        consumed_lot.material_id as "consumedMaterialId",
        pcl.unit as "consumedUnit",
        pcl.secondary_unit as "consumedSecondaryUnit",
        pol.id as "outputRowId",
        pol.lot_id as "outputLotId",
        pol.lot_code as "outputLotCode",
        output_lot.material_id as "outputMaterialId",
        output_lot.status as "outputLotStatus",
        pol.quantity,
        pol.secondary_quantity as "secondaryQuantity",
        pol.unit,
        pol.secondary_unit as "secondaryUnit"
      from productions p
      join production_consumed_lots pcl on pcl.production_id = p.id
      join lots consumed_lot on consumed_lot.id = pcl.lot_id
      join production_output_lots pol on pol.production_id = p.id
      join lots output_lot on output_lot.id = pol.lot_id
      where p.id = $1
        and (pol.id = $2 or pol.lot_id = $2)
      for update of p, pcl, pol, consumed_lot, output_lot;
    `,
    [productionId, outputLotId]
  );

  return result.rows[0] || null;
}

async function countActiveProductionOutputLots(client, productionId) {
  const result = await client.query(
    `
      select count(*)::int as total
      from production_output_lots pol
      join lots lo on lo.id = pol.lot_id
      where pol.production_id = $1
        and lo.status <> 'Cancelado';
    `,
    [productionId]
  );

  return Number(result.rows[0]?.total || 0);
}

async function updateConsumedQuantityForOutputLot(client, outputLot, direction) {
  const quantityDelta = normalizeDecimal(outputLot.quantity) * direction;
  const secondaryDelta = outputLot.secondaryQuantity === null
    ? null
    : normalizeDecimal(outputLot.secondaryQuantity) * direction;

  await client.query(
    `
      update production_consumed_lots
      set
        quantity = greatest(quantity + $2, 0),
        secondary_quantity = case
          when secondary_quantity is null and $3::numeric is null then null
          else greatest(coalesce(secondary_quantity, 0) + coalesce($3::numeric, 0), 0)
        end
      where id = $1;
    `,
    [outputLot.consumedRowId, quantityDelta, secondaryDelta]
  );
}

async function changeProductionOutputLotStatus(req, res, action) {
  const client = await pool.connect();
  const productionId = req.params.productionId;
  const outputLotId = req.params.outputLotId;

  try {
    await client.query("begin");

    const outputLot = await getProductionOutputLotForPartial(client, productionId, outputLotId);

    if (!outputLot) {
      await client.query("rollback");
      return res.status(404).json({ error: "Lote produzido nao encontrado para esta producao." });
    }

    const outputImpact = {
      lotId: outputLot.outputLotId,
      materialId: outputLot.outputMaterialId,
      locationId: outputLot.locationId,
      quantity: outputLot.quantity,
      secondaryQuantity: outputLot.secondaryQuantity,
      unit: outputLot.unit,
      secondaryUnit: outputLot.secondaryUnit
    };
    const consumedImpact = {
      lotId: outputLot.consumedLotId,
      materialId: outputLot.consumedMaterialId,
      locationId: outputLot.locationId,
      quantity: outputLot.quantity,
      secondaryQuantity: outputLot.secondaryQuantity,
      unit: outputLot.consumedUnit,
      secondaryUnit: outputLot.consumedSecondaryUnit
    };

    if (action === "cancel") {
      if (!productionImpactsStock(outputLot.productionStatus)) {
        throw Object.assign(new Error("Esta producao nao esta ativa para cancelamento parcial."), { status: 409 });
      }

      if (outputLot.outputLotStatus === "Cancelado") {
        await client.query("commit");
        return res.json(await getProductionById(client, productionId));
      }

      const activeLots = await countActiveProductionOutputLots(client, productionId);
      if (activeLots <= 1) {
        throw Object.assign(new Error("Este e o ultimo lote ativo. Use Cancelar producao para cancelar o apontamento inteiro."), { status: 409 });
      }

      await ensureBalancesCanSubtract(
        client,
        [outputImpact],
        "Saldo insuficiente para cancelar este lote produzido. Ele ja pode ter sido consumido ou movimentado."
      );

      await applyBalanceDelta(client, outputImpact, -1);
      await writeProductionLotEvent(client, outputImpact, productionId, -1, "PRODUCTION_OUTPUT_LOT_CANCEL", "Estorno parcial de lote produzido");
      await applyBalanceDelta(client, consumedImpact, 1);
      await writeProductionLotEvent(client, consumedImpact, productionId, 1, "PRODUCTION_OUTPUT_LOT_CANCEL_CONSUME_REVERSAL", "Devolucao parcial ao lote consumido");
      await updateConsumedQuantityForOutputLot(client, outputLot, -1);

      await client.query(
        "update lots set status = 'Cancelado', current_location_id = null, updated_at = now() where id = $1",
        [outputLot.outputLotId]
      );
    }

    if (action === "reprocess") {
      if (outputLot.outputLotStatus !== "Cancelado") {
        await client.query("commit");
        return res.json(await getProductionById(client, productionId));
      }

      await ensureBalancesCanSubtract(
        client,
        [consumedImpact],
        "Saldo insuficiente para reprocessar este lote produzido. O lote consumido nao possui saldo disponivel."
      );

      await applyBalanceDelta(client, consumedImpact, -1);
      await writeProductionLotEvent(client, consumedImpact, productionId, -1, "PRODUCTION_OUTPUT_LOT_REPROCESS_CONSUME", "Baixa parcial por reprocessamento de lote produzido");
      await applyBalanceDelta(client, outputImpact, 1);
      await writeProductionLotEvent(client, outputImpact, productionId, 1, "PRODUCTION_OUTPUT_LOT_REPROCESS", "Reentrada parcial de lote produzido");
      await updateConsumedQuantityForOutputLot(client, outputLot, 1);

      await client.query(
        "update lots set status = 'Disponível', current_location_id = $2, updated_at = now() where id = $1",
        [outputLot.outputLotId, outputLot.locationId]
      );
      await client.query("update productions set status = 'Reprocessado', updated_at = now() where id = $1", [productionId]);
    }

    await refreshLotStatus(client, outputLot.consumedLotId);
    if (action === "reprocess") {
      await refreshLotStatus(client, outputLot.outputLotId);
    }

    const updatedProduction = await getProductionById(client, productionId);
    await client.query("commit");

    return res.json(updatedProduction);
  } catch (error) {
    await client.query("rollback");
    console.error("Erro ao alterar lote produzido da producao:", error);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro interno ao alterar lote produzido da producao.",
      detail: error.status ? null : error.message
    });
  } finally {
    client.release();
  }
}

async function reverseProductionImpactForEdit(client, productionId) {
  const impacts = await getProductionImpactRows(client, productionId, "active");

  await ensureBalancesCanSubtract(
    client,
    impacts.outputs,
    "Saldo insuficiente para editar esta producao. Algum lote produzido ja pode ter sido consumido ou movimentado."
  );

  for (const consumed of impacts.consumed) {
    await applyBalanceDelta(client, consumed, 1);
  }

  for (const output of impacts.outputs) {
    await applyBalanceDelta(client, output, -1);
  }

  for (const lotId of [...impacts.consumed, ...impacts.outputs].map((impact) => impact.lotId)) {
    await refreshLotStatus(client, lotId);
  }

  return impacts;
}

async function removeProductionDetails(client, productionId, outputLotIds) {
  await client.query("delete from lot_events where reference_type = 'production' and reference_id = $1", [productionId]);
  if (outputLotIds.length) {
    await client.query("delete from lot_links where production_id = $1 and child_lot_id = any($2)", [productionId, outputLotIds]);
    await client.query("delete from production_output_lots where production_id = $1 and lot_id = any($2)", [productionId, outputLotIds]);
  }
  await client.query("delete from production_consumed_lots where production_id = $1", [productionId]);
  await client.query("delete from production_operators where production_id = $1", [productionId]);

  if (outputLotIds.length) {
    await client.query(
      "delete from lots where id = any($1) and origin_type = 'PRODUCTION' and origin_id = $2",
      [outputLotIds, productionId]
    );
  }
}

async function resolveProductionPayload(client, body) {
  const outputLots = Array.isArray(body.outputLots || body.producedLots)
    ? body.outputLots || body.producedLots
    : [];
  const consumedLotsInput = Array.isArray(body.consumedLots) && body.consumedLots.length
    ? body.consumedLots
    : [body.consumedLot || {}];

  if (outputLots.length < 1) {
    throw Object.assign(new Error("Informe ao menos um lote produzido."), { status: 400 });
  }

  const materialId = await resolveByIdOrName(client, "materials", body.materialId || body.outputMaterialId, body.outputMaterialName, "Material produzido");
  const locationId = await resolveByIdOrName(client, "locations", body.locationId, body.locationName, "Local");
  const machineId = await resolveByIdOrName(client, "machines", body.machineId, body.machineName, "Maquina");
  const productionModelId = await resolveProductionModel(client, materialId, body.productionModelId, body.productionModelName);
  const operatorIds = await resolveOperators(client, body.operatorIds || [], body.operatorCodes || body.responsibleCodes || []);

  const materialResult = await client.query(
    `
      select id, code, name, coalesce(primary_unit, unit) as unit, secondary_unit
      from materials
      where id = $1
      limit 1;
    `,
    [materialId]
  );
  const outputMaterial = materialResult.rows[0];
  outputMaterial.unit = normalizeText(body.outputUnit) || outputMaterial.unit || "un";
  outputMaterial.secondary_unit = normalizeText(body.outputSecondaryUnit) || outputMaterial.secondary_unit;

  const consumedLots = [];

  for (const consumedLot of consumedLotsInput) {
    const consumedLotResult = await client.query(
      `
        select
          lo.id,
          lo.material_id,
          lo.lot_code,
          m.code as material_code,
          m.name as material_name,
          coalesce(m.primary_unit, m.unit) as unit,
          m.secondary_unit,
          sb.quantity,
          sb.secondary_quantity
        from lots lo
        join materials m on m.id = lo.material_id
        join stock_balances sb on sb.lot_id = lo.id and sb.location_id = $2
        where (lo.id = $1 or lo.lot_code = $3)
        for update of sb, lo;
      `,
      [consumedLot.lotId || consumedLot.id || null, locationId, consumedLot.lotCode || null]
    );

    if (!consumedLotResult.rows.length) {
      throw Object.assign(new Error("Lote consumido nao encontrado no local selecionado."), { status: 400 });
    }

    const sourceLot = consumedLotResult.rows[0];
    const consumedQuantity = normalizeDecimal(consumedLot.quantity ?? consumedLot.consumedQuantity);
    const consumedSecondaryQuantity = consumedLot.secondaryQuantity === undefined || consumedLot.secondaryQuantity === null
      ? null
      : normalizeDecimal(consumedLot.secondaryQuantity);

    if (consumedLot.materialCode && sourceLot.material_code !== consumedLot.materialCode) {
      throw Object.assign(new Error(`O lote consumido ${sourceLot.lot_code} nao pertence ao material ${consumedLot.materialName || consumedLot.materialCode}.`), { status: 400 });
    }

    if (consumedQuantity <= 0) {
      throw Object.assign(new Error("Quantidade consumida deve ser maior que zero."), { status: 400 });
    }

    if (normalizeDecimal(sourceLot.quantity) + 0.0001 < consumedQuantity) {
      throw Object.assign(new Error(`A producao informada ultrapassa o saldo disponivel do lote consumido ${sourceLot.lot_code}.`), { status: 409 });
    }

    consumedLots.push({
      sourceLot,
      consumedQuantity,
      consumedSecondaryQuantity,
      eventType: consumedLot.eventType || (consumedLot.isIndustrialLoss ? "INDUSTRIAL_LOSS" : "PRODUCTION_CONSUME"),
      isIndustrialLoss: Boolean(consumedLot.isIndustrialLoss),
      notes: normalizeText(consumedLot.notes)
    });
  }

  const consumedQuantityByLot = new Map();

  for (const consumed of consumedLots) {
    const key = consumed.sourceLot.id;
    const current = consumedQuantityByLot.get(key) || {
      lotCode: consumed.sourceLot.lot_code,
      availableQuantity: normalizeDecimal(consumed.sourceLot.quantity),
      quantity: 0
    };

    current.quantity += normalizeDecimal(consumed.consumedQuantity);
    consumedQuantityByLot.set(key, current);
  }

  for (const total of consumedQuantityByLot.values()) {
    if (total.availableQuantity + 0.0001 < total.quantity) {
      throw Object.assign(new Error(`A produção informada ultrapassa o saldo disponível do lote consumido ${total.lotCode}.`), { status: 409 });
    }
  }

  const normalizedOutputLots = outputLots.map((lot) => ({
    id: lot.id || null,
    lotId: lot.lotId || null,
    lotCode: normalizeText(lot.lotCode)?.toUpperCase(),
    quantity: normalizeDecimal(lot.quantity ?? lot.outputQuantity),
    secondaryQuantity: lot.secondaryQuantity === undefined || lot.secondaryQuantity === null || lot.secondaryQuantity === ""
      ? null
      : normalizeDecimal(lot.secondaryQuantity ?? lot.outputSecondaryQuantity),
    status: lot.status === "Cancelado" || lot.lotStatus === "Cancelado" ? "Cancelado" : "Disponivel"
  }));

  const outputLotCodes = normalizedOutputLots.map((lot) => lot.lotCode).filter(Boolean);

  if (outputLotCodes.length !== new Set(outputLotCodes).size) {
    throw Object.assign(new Error("Existe duplicidade de lote produzido nesta producao."), { status: 400 });
  }

  if (normalizedOutputLots.some((lot) => !lot.lotCode || lot.quantity <= 0)) {
    throw Object.assign(new Error("Cada lote produzido precisa de codigo e quantidade maior que zero."), { status: 400 });
  }

  await validateVariableModelConsumption(client, productionModelId, outputMaterial, normalizedOutputLots, consumedLots);

  const existingLots = await client.query("select id, lot_code from lots where lot_code = any($1)", [outputLotCodes]);
  const retainedLotIds = new Set(normalizedOutputLots.map((lot) => lot.lotId || lot.id).filter(Boolean));
  const conflictingLot = existingLots.rows.find((lot) => !retainedLotIds.has(lot.id));

  if (conflictingLot) {
    throw Object.assign(new Error(`Lote produzido ${conflictingLot.lot_code} ja existe.`), { status: 409 });
  }

  return {
    materialId,
    locationId,
    machineId,
    productionModelId,
    operatorIds,
    outputMaterial,
    sourceLot: consumedLots[0]?.sourceLot || null,
    consumedQuantity: consumedLots[0]?.consumedQuantity || 0,
    consumedSecondaryQuantity: consumedLots[0]?.consumedSecondaryQuantity ?? null,
    consumedLots,
    outputLots: normalizedOutputLots,
    productionDate: body.productionDate || new Date().toISOString().slice(0, 10),
    notes: normalizeText(body.notes || body.observation)
  };
}

async function validateVariableModelConsumption(client, productionModelId, outputMaterial, outputLots, consumedLots) {
  const result = await client.query(
    `
      select
        input_material_id as "inputMaterialId",
        unit,
        coalesce(consumption_mode, 'Fixo') as "consumptionMode"
      from material_production_model_inputs
      where production_model_id = $1;
    `,
    [productionModelId]
  );

  for (const input of result.rows.filter((row) => isVariableConsumptionMode(row.consumptionMode))) {
    const productiveConsumedLots = consumedLots.filter((consumed) => {
      return (
        String(consumed.sourceLot.material_id) === String(input.inputMaterialId) &&
        !isIndustrialLossConsumption(consumed)
      );
    });

    if (!productiveConsumedLots.length) {
      continue;
    }

    const variableValidationContext = {
      productionModelId,
      inputMaterialId: input.inputMaterialId,
      outputMaterialUnit: outputMaterial?.unit || null,
      outputMaterialSecondaryUnit: outputMaterial?.secondary_unit || null,
      inputUnit: input.unit || null,
      consumedLots: productiveConsumedLots.map((consumed) => ({
        lotCode: consumed.sourceLot.lot_code,
        materialCode: consumed.sourceLot.material_code,
        materialName: consumed.sourceLot.material_name,
        materialUnit: consumed.sourceLot.unit,
        materialSecondaryUnit: consumed.sourceLot.secondary_unit,
        quantity: normalizeDecimal(consumed.consumedQuantity),
        secondaryQuantity: consumed.consumedSecondaryQuantity,
        eventType: consumed.eventType
      })),
      outputLots: outputLots.map((lot) => ({
        lotCode: lot.lotCode,
        quantity: normalizeDecimal(lot.quantity),
        secondaryQuantity: lot.secondaryQuantity
      }))
    };

    const {
      expectedQuantity,
      resolvedUnit,
      resolvedFrom
    } = resolveVariableConsumptionExpectedQuantity(outputMaterial, input.unit, productiveConsumedLots, outputLots);

    if (expectedQuantity === null) {
      console.error("Validacao de consumo variavel sem unidade resolvida:", variableValidationContext);
      throw Object.assign(new Error("Unidade de consumo variavel nao resolvida para o modelo de producao. Verifique no console do servidor a unidade do modelo, a unidade do insumo consumido e as unidades principal/secundaria do material produzido."), { status: 400 });
    }

    const informedQuantity = productiveConsumedLots
      .reduce((sum, consumed) => sum + normalizeDecimal(consumed.consumedQuantity), 0);

    console.info("Validacao de consumo variavel:", {
      ...variableValidationContext,
      resolvedUnit,
      resolvedFrom,
      expectedQuantity,
      informedQuantity
    });

    if (Math.abs(informedQuantity - expectedQuantity) > 0.0001) {
      throw Object.assign(new Error("Quantidade consumida variável diverge da quantidade produzida na unidade correspondente."), { status: 400 });
    }
  }
}

async function insertProductionDetails(client, productionId, payload, applyStock = true) {
  for (const consumed of payload.consumedLots) {
    await client.query(
      `
        insert into production_consumed_lots (
          production_id,
          lot_id,
          quantity,
          unit,
          secondary_quantity,
          secondary_unit
        )
        values ($1, $2, $3, $4, $5, $6);
      `,
      [productionId, consumed.sourceLot.id, consumed.consumedQuantity, consumed.sourceLot.unit || "un", consumed.consumedSecondaryQuantity, consumed.sourceLot.secondary_unit]
    );

    if (applyStock) {
      const impact = {
        lotId: consumed.sourceLot.id,
        materialId: consumed.sourceLot.material_id,
        locationId: payload.locationId,
        quantity: consumed.consumedQuantity,
        secondaryQuantity: consumed.consumedSecondaryQuantity,
        unit: consumed.sourceLot.unit || "un",
        secondaryUnit: consumed.sourceLot.secondary_unit
      };

      await applyBalanceDelta(client, impact, -1);
      await writeProductionLotEvent(
        client,
        impact,
        productionId,
        -1,
        consumed.eventType || "PRODUCTION_CONSUME",
        consumed.notes || (consumed.isIndustrialLoss ? "Perda industrial por saldo remanescente de produção" : "Baixa por produção")
      );
    }
  }

  for (const operatorId of payload.operatorIds) {
    await client.query(
      "insert into production_operators (production_id, operator_id) values ($1, $2) on conflict do nothing",
      [productionId, operatorId]
    );
  }

  for (const lot of payload.outputLots) {
    const lotIsActive = applyStock && lot.status !== "Cancelado";
    const createdLot = await client.query(
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
        values ($1, $2, 'PRODUCTION', $3, $4::date, $5, $6)
        returning id;
      `,
      [lot.lotCode, payload.materialId, productionId, payload.productionDate, lotIsActive ? payload.locationId : null, lotIsActive ? "Disponível" : "Cancelado"]
    );
    const outputLotId = createdLot.rows[0].id;

    await client.query(
      `
        insert into production_output_lots (
          production_id,
          lot_id,
          lot_code,
          quantity,
          unit,
          secondary_quantity,
          secondary_unit
        )
        values ($1, $2, $3, $4, $5, $6, $7);
      `,
      [productionId, outputLotId, lot.lotCode, lot.quantity, payload.outputMaterial.unit || "un", lot.secondaryQuantity, payload.outputMaterial.secondary_unit]
    );

    for (const consumed of payload.consumedLots) {
      await client.query(
        `
          insert into lot_links (
            parent_lot_id,
            child_lot_id,
            production_id,
            link_type
          )
          values ($1, $2, $3, 'TRANSFORMATION')
          on conflict do nothing;
        `,
        [consumed.sourceLot.id, outputLotId, productionId]
      );
    }

    if (lotIsActive) {
      const outputImpact = {
        lotId: outputLotId,
        materialId: payload.materialId,
        locationId: payload.locationId,
        quantity: lot.quantity,
        secondaryQuantity: lot.secondaryQuantity,
        unit: payload.outputMaterial.unit || "un",
        secondaryUnit: payload.outputMaterial.secondary_unit
      };

      await applyBalanceDelta(client, outputImpact, 1);
      await writeProductionLotEvent(client, outputImpact, productionId, 1, "PRODUCTION_OUTPUT", "Entrada por producao");
    }
  }

  for (const consumed of payload.consumedLots) {
    await refreshLotStatus(client, consumed.sourceLot.id);
  }
}

async function changeProductionStatus(req, res, nextStatus, action) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const production = await getProductionForStatusChange(client, req.params.id);

    if (!production) {
      await client.query("rollback");
      return res.status(404).json({ error: "Producao nao encontrada." });
    }

    const shouldApplyImpact = action === "cancel"
      ? productionImpactsStock(production.status)
      : production.status === "Cancelado";

    if (shouldApplyImpact) {
      await applyProductionStockImpact(client, production.id, action);
    }

    await client.query(
      `
        update productions
        set status = $1, updated_at = now()
        where id = $2;
      `,
      [nextStatus, production.id]
    );

    const updatedProduction = await getProductionById(client, production.id);
    await client.query("commit");

    return res.json(updatedProduction);
  } catch (error) {
    await client.query("rollback");
    console.error("Erro ao alterar status da producao:", error);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro interno ao alterar status da producao.",
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
      from productions
      order by production_date desc, created_at desc;
    `);

    const productions = [];

    for (const row of result.rows) {
      productions.push(await getProductionById(client, row.id));
    }

    return res.json(productions.filter(Boolean));
  } catch (error) {
    console.error("Erro ao listar producoes:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  const body = req.body || {};

  try {
    await client.query("begin");

    const productionResult = await client.query(
      `
        select id, status
        from productions
        where id = $1
        for update;
      `,
      [req.params.id]
    );

    if (!productionResult.rows.length) {
      await client.query("rollback");
      return res.status(404).json({ error: "Producao nao encontrada." });
    }

    const currentProduction = productionResult.rows[0];
    const currentImpacts = await getProductionImpactRows(client, req.params.id, "active");
    const oldOutputLotIds = currentImpacts.outputs.map((impact) => impact.lotId);

    if (productionImpactsStock(currentProduction.status)) {
      await reverseProductionImpactForEdit(client, req.params.id);
    }

    await removeProductionDetails(client, req.params.id, oldOutputLotIds);
    const payload = await resolveProductionPayload(client, body);
    payload.outputLots = payload.outputLots.filter((lot) => lot.status !== "Cancelado");
    const shouldApplyStock = productionImpactsStock(currentProduction.status);

    await client.query(
      `
        update productions
        set
          production_date = $1::date,
          material_id = $2,
          production_model_id = $3,
          machine_id = $4,
          location_id = $5,
          consumed_lot_id = $6,
          notes = $7,
          updated_at = now()
        where id = $8;
      `,
      [
        payload.productionDate,
        payload.materialId,
        payload.productionModelId,
        payload.machineId,
        payload.locationId,
        payload.sourceLot?.id || null,
        payload.notes,
        req.params.id
      ]
    );

    await insertProductionDetails(client, req.params.id, payload, shouldApplyStock);

    const updatedProduction = await getProductionById(client, req.params.id);
    await client.query("commit");

    return res.json(updatedProduction);
  } catch (error) {
    await client.query("rollback");
    console.error("Erro ao editar producao:", error);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro interno ao editar producao.",
      detail: error.status ? null : error.message
    });
  } finally {
    client.release();
  }
});

router.post("/:id/cancel", async (req, res) => {
  return changeProductionStatus(req, res, "Cancelado", "cancel");
});

router.post("/:id/reprocess", async (req, res) => {
  return changeProductionStatus(req, res, "Reprocessado", "reprocess");
});

router.post("/:productionId/output-lots/:outputLotId/cancel", async (req, res) => {
  return changeProductionOutputLotStatus(req, res, "cancel");
});

router.post("/:productionId/output-lots/:outputLotId/reprocess", async (req, res) => {
  return changeProductionOutputLotStatus(req, res, "reprocess");
});

router.post("/", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const payload = await resolveProductionPayload(client, req.body || {});

    const productionResult = await client.query(
      `
        insert into productions (
          production_date,
          material_id,
          production_model_id,
          machine_id,
          location_id,
          consumed_lot_id,
          status,
          notes
        )
        values ($1::date, $2, $3, $4, $5, $6, 'Processado', $7)
        returning id;
      `,
      [
        payload.productionDate,
        payload.materialId,
        payload.productionModelId,
        payload.machineId,
        payload.locationId,
        payload.sourceLot?.id || null,
        payload.notes
      ]
    );
    const productionId = productionResult.rows[0].id;

    await insertProductionDetails(client, productionId, payload, true);

    const production = await getProductionById(client, productionId);
    await client.query("commit");

    return res.status(201).json(production);
  } catch (error) {
    await client.query("rollback");
    console.error("Erro ao registrar producao:", {
      message: error.message,
      detail: error.detail,
      code: error.code,
      constraint: error.constraint
    });

    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro interno ao registrar producao.",
      detail: error.status ? null : error.detail || error.message,
      code: error.code || null,
      constraint: error.constraint || null
    });
  } finally {
    client.release();
  }
});

module.exports = router;
