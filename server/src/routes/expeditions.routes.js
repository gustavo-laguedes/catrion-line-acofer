const express = require("express");
const { pool } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar expedições." };

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

function roundQuantity(value) {
  return Math.round(normalizeDecimal(value) * 1000000) / 1000000;
}

function toDateTime(value) {
  return value ? new Date(value) : new Date();
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isMissingSchemaError(error) {
  return ["3F000", "42P01", "42703"].includes(error?.code);
}

function handleExpeditionError(error, res, action, fallbackMessage = INTERNAL_ERROR.error) {
  if (isMissingSchemaError(error)) {
    console.error(`Schema ausente ou incompatível ao ${action} expedições:`, {
      code: error.code,
      message: error.message,
      table: error.table,
      column: error.column
    });
    return res.status(503).json({
      error: "Estrutura de banco ausente ou incompatível para expedições."
    });
  }

  console.error(`Erro ao ${action} expedições:`, error);
  return res.status(500).json({ error: fallbackMessage });
}

async function resolveLocation(client, locationId, locationName) {
  const result = await client.query(
    `
      select id, name
      from locations
      where ($1::uuid is not null and id = $1::uuid)
         or ($2::text is not null and name = $2::text)
      limit 1;
    `,
    [locationId || null, normalizeText(locationName)]
  );

  if (!result.rows.length) {
    throw Object.assign(new Error("Local de expedição não encontrado."), { status: 400 });
  }

  return result.rows[0];
}

async function getLotForShipment(client, { lotId, lotCode, materialId, materialName, locationId }) {
  const result = await client.query(
    `
      select
        lo.id as "lotId",
        lo.lot_code as "lotCode",
        lo.status as "lotStatus",
        lo.production_date as "productionDate",
        lo.created_at as "createdAt",
        lo.origin_type as "origin",
        sb.material_id as "materialId",
        m.code as "materialCode",
        m.name as "materialName",
        coalesce(m.primary_unit, m.unit, sb.unit) as "unit",
        m.secondary_unit as "materialSecondaryUnit",
        sb.location_id as "locationId",
        loc.name as "locationName",
        sb.quantity,
        sb.secondary_quantity as "secondaryQuantity",
        sb.unit as "balanceUnit",
        sb.secondary_unit as "balanceSecondaryUnit",
        sb.status as "balanceStatus"
      from lots lo
      join stock_balances sb on sb.lot_id = lo.id and sb.location_id = $3
      join materials m on m.id = sb.material_id
      join locations loc on loc.id = sb.location_id
      where (lo.id = $1::uuid or lo.lot_code = $2::text)
        and ($4::uuid is null or m.id = $4::uuid)
        and ($5::text is null or m.name = $5::text)
        and coalesce(lo.status, 'Disponível') not in ('Cancelado', 'Sem saldo')
        and coalesce(sb.status, 'Disponível') not in ('Cancelado', 'Sem saldo')
      for update of sb, lo;
    `,
    [lotId || null, lotCode || null, locationId, materialId || null, normalizeText(materialName)]
  );

  if (!result.rows.length) {
    throw Object.assign(new Error(`Lote ${lotCode || lotId || ""} não encontrado ou indisponível no local selecionado.`), { status: 400 });
  }

  return result.rows[0];
}

async function applyBalanceDelta(client, impact, direction) {
  const quantityDelta = normalizeDecimal(impact.quantity) * direction;
  const secondaryDelta = impact.secondaryQuantity === null ? null : normalizeDecimal(impact.secondaryQuantity) * direction;

  await client.query(
    `
      update stock_balances
      set
        quantity = quantity + $3,
        secondary_quantity = case
          when secondary_quantity is null and $4::numeric is null then null
          else coalesce(secondary_quantity, 0) + coalesce($4::numeric, 0)
        end,
        status = case when quantity + $3 > 0 then 'Disponível' else 'Sem saldo' end,
        updated_at = now()
      where lot_id = $1 and location_id = $2;
    `,
    [impact.lotId, impact.locationId, quantityDelta, secondaryDelta]
  );
}

async function writeLotEvent(client, impact, expeditionId, shipment = {}) {
  const eventType = shipment.eventType || "EXPEDITION_SHIPMENT";
  const quantitySign = shipment.quantitySign ?? -1;
  const actionLabel = shipment.actionLabel || "Baixa por expedição";
  const details = [
    shipment.orderNumber ? `pedido ${shipment.orderNumber}` : null,
    shipment.vehicleName ? `caminhão ${shipment.vehicleName}` : null,
    shipment.dateTime ? `data ${toDateTimeInput(shipment.dateTime)}` : null,
    shipment.lotCode ? `lote expedido ${shipment.lotCode}` : null,
    shipment.status ? `status ${shipment.status}` : null,
    shipment.reason ? `motivo ${shipment.reason}` : null,
    `quantidade expedida ${normalizeDecimal(impact.quantity)} ${impact.unit || "un"}`
  ].filter(Boolean);

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
      values ($1, $9, now(), 'expedition', $2, $3, $4, $5, $6, $7, $8);
    `,
    [
      impact.lotId,
      expeditionId,
      impact.locationId,
      normalizeDecimal(impact.quantity) * quantitySign,
      impact.secondaryQuantity === null ? null : normalizeDecimal(impact.secondaryQuantity) * quantitySign,
      impact.unit || "un",
      impact.secondaryUnit || null,
      `${actionLabel}${details.length ? `: ${details.join("; ")}` : ""}`,
      eventType
    ]
  );
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

function calculateSecondaryQuantity(primaryQuantity, lot) {
  const lotPrimaryBalance = normalizeDecimal(lot.quantity);
  const lotSecondaryBalance = normalizeDecimal(lot.secondaryQuantity);

  if (lotPrimaryBalance <= 0 || lotSecondaryBalance <= 0) return null;

  return roundQuantity(primaryQuantity * (lotSecondaryBalance / lotPrimaryBalance));
}

async function normalizePayload(client, body) {
  const location = await resolveLocation(client, body.locationId, body.locationName);
  const ordersInput = Array.isArray(body.orders) ? body.orders : [];

  if (!ordersInput.length) {
    throw Object.assign(new Error("Informe ao menos um pedido para expedir."), { status: 400 });
  }

  const rows = [];

  ordersInput.forEach((order, orderIndex) => {
    const orderNumber = normalizeText(order.number || order.orderNumber);
    if (!orderNumber) return;

    (order.materials || []).forEach((material, materialIndex) => {
      const selectedLots = Array.isArray(material.lots)
        ? material.lots
        : Object.values(material.lotSelections || {}).filter((selection) => selection.selected);

      selectedLots.forEach((lot) => {
        rows.push({
          orderIndex,
          materialIndex,
          orderNumber,
          orderNotes: normalizeText(order.notes),
          materialId: material.materialId || lot.materialId || null,
          materialName: normalizeText(material.materialName || lot.materialName),
          lotId: lot.lotId || lot.sourceLotId || lot.id || null,
          lotCode: normalizeText(lot.lotCode),
          primaryQuantity: normalizeDecimal(lot.primaryQuantity ?? lot.loadedQuantity ?? lot.quantityLoaded),
          clientSecondaryQuantity: lot.secondaryQuantityLoaded ?? lot.secondaryLoaded ?? lot.loadedSecondaryQuantity
        });
      });
    });
  });

  if (!rows.length) {
    throw Object.assign(new Error("Selecione ao menos um lote para expedir."), { status: 400 });
  }

  if (rows.some((row) => row.primaryQuantity <= 0)) {
    throw Object.assign(new Error("Quantidade carregada deve ser maior que zero."), { status: 400 });
  }

  const resolvedRows = [];
  const totalsByLot = new Map();

  for (const row of rows) {
    const sourceLot = await getLotForShipment(client, {
      ...row,
      locationId: location.id
    });

    const key = sourceLot.lotId;
    const total = totalsByLot.get(key) || {
      lotCode: sourceLot.lotCode,
      availableQuantity: normalizeDecimal(sourceLot.quantity),
      quantity: 0
    };

    total.quantity += row.primaryQuantity;
    totalsByLot.set(key, total);

    const secondaryQuantity = calculateSecondaryQuantity(row.primaryQuantity, sourceLot);

    resolvedRows.push({
      ...row,
      materialId: sourceLot.materialId,
      materialCode: sourceLot.materialCode,
      materialName: sourceLot.materialName,
      lotId: sourceLot.lotId,
      lotCode: sourceLot.lotCode,
      locationId: sourceLot.locationId,
      locationName: sourceLot.locationName,
      primaryUnit: sourceLot.balanceUnit || sourceLot.unit || "un",
      secondaryUnit: sourceLot.balanceSecondaryUnit || sourceLot.materialSecondaryUnit || "",
      secondaryQuantity
    });
  }

  for (const total of totalsByLot.values()) {
    if (total.availableQuantity + 0.0001 < total.quantity) {
      throw Object.assign(new Error(`Quantidade carregada ultrapassa o saldo disponível do lote ${total.lotCode}.`), { status: 409 });
    }
  }

  return {
    dateTime: toDateTime(body.dateTime),
    location,
    vehicleId: normalizeText(body.vehicleId),
    vehicleName: normalizeText(body.vehicleName),
    notes: normalizeText(body.observation || body.notes),
    rows: resolvedRows
  };
}

function groupRows(rows) {
  const orders = [];

  rows.forEach((row) => {
    let order = orders.find((item) => item.orderIndex === row.orderIndex);

    if (!order) {
      order = {
        orderIndex: row.orderIndex,
        number: row.orderNumber,
        notes: row.orderNotes || "",
        materials: []
      };
      orders.push(order);
    }

    let material = order.materials.find((item) => item.materialIndex === row.materialIndex);

    if (!material) {
      material = {
        materialIndex: row.materialIndex,
        materialId: row.materialId,
        materialCode: row.materialCode,
        materialName: row.materialName,
        lotSelections: {}
      };
      order.materials.push(material);
    }

    const key = `${row.materialId}__${row.locationName}__${row.lotCode}`;
    material.lotSelections[key] = {
      selected: true,
      lotId: row.lotId,
      sourceLotId: row.lotId,
      id: row.lotId,
      lotCode: row.lotCode,
      materialId: row.materialId,
      materialCode: row.materialCode,
      materialName: row.materialName,
      locationId: row.locationId,
      locationName: row.locationName,
      loadedQuantity: row.primaryQuantity,
      secondaryQuantityLoaded: row.secondaryQuantity,
      unit: row.primaryUnit,
      secondaryUnit: row.secondaryUnit
    };
  });

  return orders.sort((a, b) => a.orderIndex - b.orderIndex).map((order, index) => ({
    id: order.id,
    sequence: index + 1,
    number: order.number,
    notes: order.notes,
    status: "Salvo",
    materials: order.materials.sort((a, b) => a.materialIndex - b.materialIndex).map((material) => ({
      id: material.id,
      materialId: material.materialId,
      materialCode: material.materialCode,
      materialName: material.materialName,
      lotSelections: material.lotSelections
    }))
  }));
}

async function getExpeditionById(client, id) {
  const expeditionResult = await client.query(
    `
      select
        e.id,
        e.date_time as "dateTime",
        e.location_id as "locationId",
        loc.name as "locationName",
        e.vehicle_id as "vehicleId",
        e.vehicle_name as "vehicleName",
        e.status,
        e.notes as observation,
        e.created_at as "createdAt",
        e.updated_at as "updatedAt"
      from expeditions e
      left join locations loc on loc.id = e.location_id
      where e.id = $1;
    `,
    [id]
  );

  if (!expeditionResult.rows.length) return null;

  const lotsResult = await client.query(
    `
      select
        eo.sequence as "orderIndex",
        eo.order_number as "orderNumber",
        eo.notes as "orderNotes",
        em.sequence as "materialIndex",
        em.material_id as "materialId",
        em.material_code as "materialCode",
        em.material_name as "materialName",
        el.lot_id as "lotId",
        el.lot_code as "lotCode",
        el.location_id as "locationId",
        loc.name as "locationName",
        el.primary_quantity as "primaryQuantity",
        el.primary_unit as "primaryUnit",
        el.secondary_quantity as "secondaryQuantity",
        el.secondary_unit as "secondaryUnit"
      from expedition_orders eo
      join expedition_materials em on em.expedition_order_id = eo.id
      join expedition_lots el on el.expedition_material_id = em.id
      left join locations loc on loc.id = el.location_id
      where eo.expedition_id = $1
      order by eo.sequence asc, em.sequence asc, el.created_at asc;
    `,
    [id]
  );

  const expedition = expeditionResult.rows[0];

  return {
    ...expedition,
    dateTime: toDateTimeInput(expedition.dateTime),
    status: expedition.status || "Processado",
    orders: groupRows(lotsResult.rows.map((row) => ({
      ...row,
      orderIndex: Number(row.orderIndex || 1) - 1,
      materialIndex: Number(row.materialIndex || 1) - 1,
      primaryQuantity: normalizeDecimal(row.primaryQuantity),
      secondaryQuantity: row.secondaryQuantity === null ? null : normalizeDecimal(row.secondaryQuantity)
    })))
  };
}

async function hasLaboratoryTests(client) {
  const result = await client.query("select to_regclass('public.laboratory_tests') as table_name");
  return Boolean(result.rows[0]?.table_name);
}

function normalizeCertificate(row) {
  return {
    id: row.certificateId,
    certificateCode: row.certificateCode || "",
    status: row.status || "",
    testDate: row.testDate || "",
    certificateFileName: row.certificateFileName || "",
    certificateFileUrl: row.certificateFileUrl || "",
    originalLotId: row.certificateLotId,
    originalLotCode: row.certificateLotCode || "",
    originalMaterialId: row.certificateMaterialId,
    originalMaterialCode: row.certificateMaterialCode || "",
    originalMaterialName: row.certificateMaterialName || ""
  };
}

async function findCertificatesForShippedLot(client, shippedLot) {
  if (!(await hasLaboratoryTests(client))) return [];

  const result = await client.query(
    `
      with recursive ancestry as (
        select
          lo.id as lot_id,
          0 as depth,
          array[lo.id] as path
        from lots lo
        where lo.id = $1

        union all

        select
          ll.parent_lot_id as lot_id,
          ancestry.depth + 1,
          ancestry.path || ll.parent_lot_id
        from ancestry
        join lot_links ll on ll.child_lot_id = ancestry.lot_id
        where ancestry.depth < 24
          and not ll.parent_lot_id = any(ancestry.path)
      ),
      certificates as (
        select
          ancestry.depth,
          ancestry.path,
          lt.id as certificate_id,
          lt.certificate_code,
          lt.status,
          lt.test_date,
          lt.tested_at,
          lt.created_at,
          lt.certificate_file_name,
          lt.certificate_file_url,
          cert_lot.id as certificate_lot_id,
          cert_lot.lot_code as certificate_lot_code,
          cert_material.id as certificate_material_id,
          cert_material.code as certificate_material_code,
          cert_material.name as certificate_material_name,
          array(
            select json_build_object(
              'lotId', path_lot.id,
              'lotCode', path_lot.lot_code,
              'materialId', path_material.id,
              'materialCode', path_material.code,
              'materialName', path_material.name
            )
            from unnest(ancestry.path) with ordinality as path_ids(lot_id, sort_order)
            join lots path_lot on path_lot.id = path_ids.lot_id
            join materials path_material on path_material.id = path_lot.material_id
            order by path_ids.sort_order
          ) as path_lots
        from ancestry
        join laboratory_tests lt on lt.lot_id = ancestry.lot_id
        join lots cert_lot on cert_lot.id = lt.lot_id
        left join materials cert_material on cert_material.id = coalesce(lt.material_id, cert_lot.material_id)
        where coalesce(lt.status, '') <> 'Cancelado'
          and (
            coalesce(lt.certificate_code, '') <> ''
            or coalesce(lt.certificate_file_name, '') <> ''
            or coalesce(lt.certificate_file_url, '') <> ''
          )
      ),
      nearest as (
        select min(depth) as depth
        from certificates
      )
      select
        certificates.depth,
        certificates.path_lots as "pathLots",
        certificates.certificate_id as "certificateId",
        certificates.certificate_code as "certificateCode",
        certificates.status,
        certificates.test_date as "testDate",
        certificates.certificate_file_name as "certificateFileName",
        certificates.certificate_file_url as "certificateFileUrl",
        certificates.certificate_lot_id as "certificateLotId",
        certificates.certificate_lot_code as "certificateLotCode",
        certificates.certificate_material_id as "certificateMaterialId",
        certificates.certificate_material_code as "certificateMaterialCode",
        certificates.certificate_material_name as "certificateMaterialName"
      from certificates
      join nearest on nearest.depth = certificates.depth
      order by certificates.depth asc, certificates.tested_at desc, certificates.created_at desc;
    `,
    [shippedLot.lotId]
  );

  return result.rows.map((row) => ({
    ...normalizeCertificate(row),
    relation: {
      shippedLotId: shippedLot.lotId,
      shippedLotCode: shippedLot.lotCode,
      shippedMaterialId: shippedLot.materialId,
      shippedMaterialCode: shippedLot.materialCode || "",
      shippedMaterialName: shippedLot.materialName || "",
      orderNumber: shippedLot.orderNumber || "",
      depth: toNumber(row.depth),
      path: Array.isArray(row.pathLots) ? row.pathLots : []
    }
  }));
}

function groupCertificates(foundCertificates) {
  const grouped = new Map();

  foundCertificates.forEach((item) => {
    const key = item.id || `${item.certificateCode}__${item.originalLotId}`;
    const current = grouped.get(key) || {
      ...item,
      linkedLots: [],
      relations: []
    };

    const linkedKey = `${item.relation.shippedLotId}__${item.relation.orderNumber}`;
    if (!current.linkedLots.some((lot) => `${lot.shippedLotId}__${lot.orderNumber}` === linkedKey)) {
      current.linkedLots.push({
        shippedLotId: item.relation.shippedLotId,
        shippedLotCode: item.relation.shippedLotCode,
        shippedMaterialId: item.relation.shippedMaterialId,
        shippedMaterialCode: item.relation.shippedMaterialCode,
        shippedMaterialName: item.relation.shippedMaterialName,
        orderNumber: item.relation.orderNumber
      });
    }

    current.relations.push(item.relation);
    grouped.set(key, current);
  });

  return [...grouped.values()];
}

function expeditionImpactsStock(status) {
  return status === "Processado" || status === "Reprocessado";
}

async function getExpeditionForStatusChange(client, expeditionId) {
  const result = await client.query(
    `
      select id, status, date_time as "dateTime", vehicle_name as "vehicleName"
      from expeditions
      where id = $1
      for update;
    `,
    [expeditionId]
  );

  return result.rows[0] || null;
}

async function getExpeditionImpactRows(client, expeditionId) {
  const result = await client.query(
    `
      select
        eo.order_number as "orderNumber",
        el.lot_id as "lotId",
        el.lot_code as "lotCode",
        el.location_id as "locationId",
        el.primary_quantity as quantity,
        el.primary_unit as unit,
        el.secondary_quantity as "secondaryQuantity",
        el.secondary_unit as "secondaryUnit"
      from expedition_orders eo
      join expedition_materials em on em.expedition_order_id = eo.id
      join expedition_lots el on el.expedition_material_id = em.id
      where eo.expedition_id = $1
      order by eo.sequence asc, em.sequence asc, el.created_at asc
      for update of el;
    `,
    [expeditionId]
  );

  return result.rows.map((row) => ({
    ...row,
    quantity: normalizeDecimal(row.quantity),
    secondaryQuantity: row.secondaryQuantity === null ? null : normalizeDecimal(row.secondaryQuantity)
  }));
}

async function lockStockBalances(client, impacts) {
  const pairs = [
    ...new Map(impacts.map((impact) => [`${impact.lotId}__${impact.locationId}`, impact])).values()
  ];

  for (const pair of pairs) {
    const result = await client.query(
      `
        select lot_id, location_id, quantity, secondary_quantity
        from stock_balances
        where lot_id = $1 and location_id = $2
        for update;
      `,
      [pair.lotId, pair.locationId]
    );

    if (!result.rows.length) {
      throw Object.assign(new Error(`Saldo do lote ${pair.lotCode || pair.lotId} não encontrado para esta expedição.`), { status: 409 });
    }
  }
}

async function validateStockForReprocess(client, impacts) {
  await lockStockBalances(client, impacts);

  const totals = new Map();
  impacts.forEach((impact) => {
    const key = `${impact.lotId}__${impact.locationId}`;
    const current = totals.get(key) || {
      lotId: impact.lotId,
      locationId: impact.locationId,
      lotCode: impact.lotCode,
      quantity: 0
    };
    current.quantity += normalizeDecimal(impact.quantity);
    totals.set(key, current);
  });

  for (const total of totals.values()) {
    const result = await client.query(
      `
        select quantity
        from stock_balances
        where lot_id = $1 and location_id = $2;
      `,
      [total.lotId, total.locationId]
    );
    const available = normalizeDecimal(result.rows[0]?.quantity);
    if (available + 0.0001 < total.quantity) {
      throw Object.assign(new Error(`Saldo insuficiente para reprocessar o lote ${total.lotCode}. Disponível: ${available}; necessário: ${roundQuantity(total.quantity)}.`), { status: 409 });
    }
  }
}

async function changeExpeditionStatus(req, res, nextStatus, action) {
  const client = await pool.connect();
  const reason = normalizeText(req.body?.reason);

  try {
    await client.query("begin");

    const expedition = await getExpeditionForStatusChange(client, req.params.id);
    if (!expedition) {
      await client.query("rollback");
      return res.status(404).json({ error: "Expedição não encontrada." });
    }

    if (action === "cancel" && !reason) {
      await client.query("rollback");
      return res.status(400).json({ error: "Informe o motivo do cancelamento." });
    }

    if (action === "reprocess" && expedition.status !== "Cancelado") {
      await client.query("rollback");
      return res.status(409).json({ error: "Somente expedições canceladas podem ser reprocessadas." });
    }

    if (action === "cancel" && !expeditionImpactsStock(expedition.status)) {
      await client.query("rollback");
      return res.status(409).json({ error: "Esta expedição já está cancelada." });
    }

    const impacts = await getExpeditionImpactRows(client, expedition.id);
    if (!impacts.length) {
      await client.query("rollback");
      return res.status(409).json({ error: "Nenhum lote encontrado para esta expedição." });
    }

    if (action === "reprocess") await validateStockForReprocess(client, impacts);
    if (action === "cancel") await lockStockBalances(client, impacts);

    for (const impact of impacts) {
      const direction = action === "cancel" ? 1 : -1;
      await applyBalanceDelta(client, impact, direction);
      await writeLotEvent(client, impact, expedition.id, {
        orderNumber: impact.orderNumber,
        vehicleName: expedition.vehicleName,
        dateTime: expedition.dateTime,
        lotCode: impact.lotCode,
        status: nextStatus,
        reason,
        eventType: action === "cancel" ? "EXPEDITION_CANCEL" : "EXPEDITION_REPROCESS",
        quantitySign: direction,
        actionLabel: action === "cancel" ? "Estorno de expedição" : "Reprocessamento de expedição"
      });
      await refreshLotStatus(client, impact.lotId);
    }

    await client.query(
      `
        update expeditions
        set status = $1, notes = case when $3::text is null then notes else concat_ws(E'\n', notes, concat('Cancelamento: ', $3::text)) end, updated_at = now()
        where id = $2;
      `,
      [nextStatus, expedition.id, action === "cancel" ? reason : null]
    );

    const updatedExpedition = await getExpeditionById(client, expedition.id);
    await client.query("commit");

    return res.json(updatedExpedition);
  } catch (error) {
    await client.query("rollback");
    if (isMissingSchemaError(error)) return handleExpeditionError(error, res, "alterar status de");

    console.error("Erro ao alterar status da expedição:", error);
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro interno ao alterar status da expedição.",
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
      from expeditions
      order by date_time desc, created_at desc;
    `);

    const expeditions = [];
    for (const row of result.rows) {
      expeditions.push(await getExpeditionById(client, row.id));
    }

    return res.json(expeditions.filter(Boolean));
  } catch (error) {
    return handleExpeditionError(error, res, "listar");
  } finally {
    client.release();
  }
});

router.post("/", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const payload = await normalizePayload(client, req.body || {});

    const expeditionResult = await client.query(
      `
        insert into expeditions (
          date_time,
          location_id,
          vehicle_id,
          vehicle_name,
          status,
          notes
        )
        values ($1, $2, $3, $4, 'Processado', $5)
        returning id;
      `,
      [payload.dateTime, payload.location.id, payload.vehicleId, payload.vehicleName, payload.notes]
    );
    const expeditionId = expeditionResult.rows[0].id;

    const orderIds = new Map();
    const materialIds = new Map();

    for (const row of payload.rows) {
      const orderKey = row.orderIndex;
      if (!orderIds.has(orderKey)) {
        const orderResult = await client.query(
          `
            insert into expedition_orders (expedition_id, order_number, notes, sequence)
            values ($1, $2, $3, $4)
            returning id;
          `,
          [expeditionId, row.orderNumber, row.orderNotes, row.orderIndex + 1]
        );
        orderIds.set(orderKey, orderResult.rows[0].id);
      }

      const materialKey = `${row.orderIndex}__${row.materialIndex}`;
      if (!materialIds.has(materialKey)) {
        const materialResult = await client.query(
          `
            insert into expedition_materials (
              expedition_order_id,
              material_id,
              material_code,
              material_name,
              sequence
            )
            values ($1, $2, $3, $4, $5)
            returning id;
          `,
          [orderIds.get(orderKey), row.materialId, row.materialCode, row.materialName, row.materialIndex + 1]
        );
        materialIds.set(materialKey, materialResult.rows[0].id);
      }

      await client.query(
        `
          insert into expedition_lots (
            expedition_material_id,
            lot_id,
            lot_code,
            location_id,
            primary_quantity,
            primary_unit,
            secondary_quantity,
            secondary_unit
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8);
        `,
        [
          materialIds.get(materialKey),
          row.lotId,
          row.lotCode,
          row.locationId,
          row.primaryQuantity,
          row.primaryUnit,
          row.secondaryQuantity,
          row.secondaryUnit || null
        ]
      );

      const impact = {
        lotId: row.lotId,
        materialId: row.materialId,
        locationId: row.locationId,
        quantity: row.primaryQuantity,
        secondaryQuantity: row.secondaryQuantity,
        unit: row.primaryUnit,
        secondaryUnit: row.secondaryUnit
      };

      await applyBalanceDelta(client, impact, -1);
      await writeLotEvent(client, impact, expeditionId, {
        orderNumber: row.orderNumber,
        vehicleName: payload.vehicleName,
        dateTime: payload.dateTime,
        lotCode: row.lotCode
      });
      await refreshLotStatus(client, row.lotId);
    }

    const expedition = await getExpeditionById(client, expeditionId);
    await client.query("commit");

    return res.status(201).json(expedition);
  } catch (error) {
    await client.query("rollback");
    if (isMissingSchemaError(error)) return handleExpeditionError(error, res, "registrar");

    console.error("Erro ao registrar expedição:", {
      message: error.message,
      detail: error.detail,
      code: error.code,
      constraint: error.constraint
    });

    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Erro interno ao registrar expedição.",
      detail: error.status ? null : error.detail || error.message,
      code: error.code || null,
      constraint: error.constraint || null
    });
  } finally {
    client.release();
  }
});

router.post("/:id/cancel", (req, res) => {
  return changeExpeditionStatus(req, res, "Cancelado", "cancel");
});

router.post("/:id/reprocess", (req, res) => {
  return changeExpeditionStatus(req, res, "Reprocessado", "reprocess");
});

router.get("/:id/certificates", async (req, res) => {
  const client = await pool.connect();

  try {
    const expedition = await getExpeditionById(client, req.params.id);
    if (!expedition) return res.status(404).json({ error: "Expedição não encontrada." });

    const shippedLotsResult = await client.query(
      `
        select
          eo.id as "orderId",
          eo.order_number as "orderNumber",
          eo.notes as "orderNotes",
          eo.sequence as "orderSequence",
          em.id as "expeditionMaterialId",
          em.material_id as "materialId",
          em.material_code as "materialCode",
          em.material_name as "materialName",
          em.sequence as "materialSequence",
          el.id as "expeditionLotId",
          el.lot_id as "lotId",
          el.lot_code as "lotCode",
          el.location_id as "locationId",
          loc.name as "locationName",
          el.primary_quantity as "primaryQuantity",
          el.primary_unit as "primaryUnit",
          el.secondary_quantity as "secondaryQuantity",
          el.secondary_unit as "secondaryUnit"
        from expedition_orders eo
        join expedition_materials em on em.expedition_order_id = eo.id
        join expedition_lots el on el.expedition_material_id = em.id
        left join locations loc on loc.id = el.location_id
        where eo.expedition_id = $1
        order by eo.sequence asc, em.sequence asc, el.created_at asc;
      `,
      [req.params.id]
    );

    const shippedLots = shippedLotsResult.rows.map((row) => ({
      ...row,
      primaryQuantity: toNumber(row.primaryQuantity),
      secondaryQuantity: row.secondaryQuantity === null ? null : toNumber(row.secondaryQuantity)
    }));

    const foundCertificates = [];
    for (const lot of shippedLots) {
      foundCertificates.push(...(await findCertificatesForShippedLot(client, lot)));
    }

    const certificates = groupCertificates(foundCertificates);

    return res.json({
      expedition,
      orders: expedition.orders || [],
      materials: shippedLots.reduce((items, lot) => {
        const key = `${lot.orderId}__${lot.expeditionMaterialId}`;
        if (items.some((item) => item.key === key)) return items;
        items.push({
          key,
          orderId: lot.orderId,
          orderNumber: lot.orderNumber,
          expeditionMaterialId: lot.expeditionMaterialId,
          materialId: lot.materialId,
          materialCode: lot.materialCode || "",
          materialName: lot.materialName || ""
        });
        return items;
      }, []),
      lots: shippedLots,
      certificates,
      relations: foundCertificates.map((item) => item.relation)
    });
  } catch (error) {
    return handleExpeditionError(error, res, "consultar certificados de");
  } finally {
    client.release();
  }
});

module.exports = router;

