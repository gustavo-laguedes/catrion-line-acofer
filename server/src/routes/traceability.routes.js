const express = require("express");
const { pool } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao consultar rastreabilidade." };

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toDateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function addFilter(filters, values, clause, value) {
  values.push(value);
  filters.push(clause.replace("?", `$${values.length}`));
}

function normalizeLot(row) {
  if (!row) return null;

  return {
    id: row.id,
    lotCode: row.lotCode,
    materialId: row.materialId,
    materialCode: row.materialCode || "",
    materialName: row.materialName || "Material nao informado",
    materialTypeId: row.materialTypeId || "",
    materialType: row.materialType || "Sem tipo",
    unit: row.unit || "un",
    secondaryUnit: row.secondaryUnit || "",
    originType: row.originType || "",
    originId: row.originId || "",
    originLabel: getOriginLabel(row.originType),
    currentLocationId: row.currentLocationId || "",
    currentLocationName: row.currentLocationName || "",
    productionDate: toDateOnly(row.productionDate),
    status: row.status || "Sem status",
    notes: row.notes || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function getOriginLabel(originType) {
  if (originType === "PURCHASE") return "Compra/entrada";
  if (originType === "PRODUCTION") return "Producao";
  if (originType === "INVENTORY") return "Inventario";
  if (originType === "ADJUSTMENT") return "Ajuste";
  return originType || "Origem nao informada";
}

function normalizeBalance(row) {
  if (!row) {
    return {
      quantity: 0,
      secondaryQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      unit: "",
      secondaryUnit: "",
      locations: []
    };
  }

  const quantity = toNumber(row.quantity);
  const reservedQuantity = toNumber(row.reservedQuantity);

  return {
    quantity,
    secondaryQuantity: toNumber(row.secondaryQuantity),
    reservedQuantity,
    availableQuantity: toNumber(row.availableQuantity ?? quantity - reservedQuantity),
    unit: row.unit || "",
    secondaryUnit: row.secondaryUnit || "",
    locations: Array.isArray(row.locations) ? row.locations : []
  };
}

function normalizeRelation(row, direction) {
  return {
    id: row.linkId,
    lotId: row.lotId,
    lotCode: row.lotCode,
    materialName: row.materialName || "",
    materialCode: row.materialCode || "",
    status: row.status || "",
    linkType: row.linkType || "TRANSFORMATION",
    productionId: row.productionId || "",
    direction
  };
}

function normalizeMovement(row) {
  return {
    id: row.id,
    movementType: row.movementType || "",
    typeLabel: row.movementType === "PURCHASE" ? "Compra" : row.movementType || "Movimentacao",
    movementDate: row.movementDate,
    status: row.status || "",
    documentNumber: row.documentNumber || "",
    supplierName: row.supplierName || "",
    locationId: row.locationId || "",
    locationName: row.locationName || "",
    materialName: row.materialName || "",
    materialCode: row.materialCode || "",
    quantity: toNumber(row.quantity),
    secondaryQuantity: toNumber(row.secondaryQuantity),
    unit: row.unit || "",
    secondaryUnit: row.secondaryUnit || "",
    notes: row.notes || ""
  };
}

function normalizeProduction(row, role) {
  return {
    id: row.id,
    role,
    productionDate: toDateOnly(row.productionDate),
    status: row.status || "",
    notes: row.notes || "",
    locationId: row.locationId || "",
    locationName: row.locationName || "",
    machineId: row.machineId || "",
    machineName: row.machineName || "",
    outputMaterialId: row.outputMaterialId || "",
    outputMaterialName: row.outputMaterialName || "",
    outputMaterialCode: row.outputMaterialCode || "",
    productionModelName: row.productionModelName || "",
    operatorNames: row.operatorNames || "",
    lotCode: row.lotCode || "",
    quantity: toNumber(row.quantity),
    secondaryQuantity: toNumber(row.secondaryQuantity),
    unit: row.unit || "",
    secondaryUnit: row.secondaryUnit || "",
    outputLots: Array.isArray(row.outputLots) ? row.outputLots : []
  };
}

function makeTimelineItem(item) {
  return {
    id: item.id,
    date: item.date || null,
    type: item.type,
    title: item.title,
    description: item.description || "",
    status: item.status || "",
    icon: item.icon || "•",
    referenceType: item.referenceType || "",
    referenceId: item.referenceId || "",
    quantity: toNumber(item.quantity),
    secondaryQuantity: item.secondaryQuantity === null || item.secondaryQuantity === undefined
      ? null
      : toNumber(item.secondaryQuantity),
    locationName: item.locationName || "",
    materialName: item.materialName || "",
    lotCode: item.lotCode || ""
  };
}

function mapEventType(eventType) {
  if (eventType === "PRODUCTION_CONSUME") return "PRODUCTION_CONSUMED";
  if (eventType === "PRODUCTION_OUTPUT") return "PRODUCTION_OUTPUT";
  if (String(eventType || "").includes("CANCEL")) return "PRODUCTION_CANCEL";
  if (String(eventType || "").includes("REPROCESS")) return "PRODUCTION_REPROCESS";
  return eventType || "LOT_EVENT";
}

function getTimelineMeta(type) {
  const meta = {
    LOT_CREATED: ["Lote criado", "•"],
    PURCHASE_IN: ["Entrada por compra", "+"],
    PRODUCTION_CONSUMED: ["Consumo em producao", "-"],
    PRODUCTION_OUTPUT: ["Geracao por producao", "+"],
    PRODUCTION_CANCEL: ["Cancelamento", "!"],
    PRODUCTION_REPROCESS: ["Reprocessamento", "↻"],
    STOCK_MOVEMENT: ["Movimentacao de estoque", "↔"],
    LINK_PARENT: ["Vinculo com lote origem", "↑"],
    LINK_CHILD: ["Vinculo com lote derivado", "↓"]
  };

  return meta[type] || [type || "Evento", "•"];
}

async function getLotBase(client, whereClause, params) {
  const result = await client.query(
    `
      select
        lo.id,
        lo.lot_code as "lotCode",
        lo.material_id as "materialId",
        m.code as "materialCode",
        m.name as "materialName",
        mt.id as "materialTypeId",
        mt.name as "materialType",
        coalesce(m.primary_unit, m.unit) as unit,
        m.secondary_unit as "secondaryUnit",
        lo.origin_type as "originType",
        lo.origin_id as "originId",
        lo.current_location_id as "currentLocationId",
        loc.name as "currentLocationName",
        lo.production_date as "productionDate",
        lo.status,
        lo.created_at as "createdAt",
        lo.updated_at as "updatedAt"
      from lots lo
      join materials m on m.id = lo.material_id
      left join material_types mt on mt.id = m.material_type_id
      left join locations loc on loc.id = lo.current_location_id
      where ${whereClause}
      limit 1;
    `,
    params
  );

  return normalizeLot(result.rows[0]);
}

async function getCurrentBalance(client, lotId) {
  const result = await client.query(
    `
      select
        coalesce(sum(sb.quantity), 0) as quantity,
        coalesce(sum(sb.secondary_quantity), 0) as "secondaryQuantity",
        0 as "reservedQuantity",
        coalesce(sum(sb.quantity), 0) as "availableQuantity",
        (array_agg(sb.unit order by sb.updated_at desc) filter (where sb.unit is not null))[1] as unit,
        (array_agg(sb.secondary_unit order by sb.updated_at desc) filter (where sb.secondary_unit is not null))[1] as "secondaryUnit",
        coalesce(
          json_agg(
            json_build_object(
              'locationId', sb.location_id,
              'locationName', loc.name,
              'quantity', sb.quantity,
              'secondaryQuantity', sb.secondary_quantity,
              'unit', sb.unit,
              'secondaryUnit', sb.secondary_unit,
              'status', sb.status,
              'updatedAt', sb.updated_at
            )
            order by loc.name asc
          ) filter (where sb.id is not null),
          '[]'
        ) as locations
      from stock_balances sb
      left join locations loc on loc.id = sb.location_id
      where sb.lot_id = $1;
    `,
    [lotId]
  );

  return normalizeBalance(result.rows[0]);
}

async function getRelations(client, lotId, relation) {
  const isParent = relation === "parents";
  const result = await client.query(
    `
      select
        ll.id as "linkId",
        linked.id as "lotId",
        linked.lot_code as "lotCode",
        m.code as "materialCode",
        m.name as "materialName",
        linked.status,
        ll.link_type as "linkType",
        ll.production_id as "productionId"
      from lot_links ll
      join lots linked on linked.id = ${isParent ? "ll.parent_lot_id" : "ll.child_lot_id"}
      join materials m on m.id = linked.material_id
      where ${isParent ? "ll.child_lot_id" : "ll.parent_lot_id"} = $1
      order by linked.lot_code asc;
    `,
    [lotId]
  );

  return result.rows.map((row) => normalizeRelation(row, isParent ? "parent" : "child"));
}

async function getEvents(client, lotId) {
  const result = await client.query(
    `
      select
        le.id,
        le.event_type as "eventType",
        le.event_date as "eventDate",
        le.reference_type as "referenceType",
        le.reference_id as "referenceId",
        le.quantity,
        le.secondary_quantity as "secondaryQuantity",
        le.unit,
        le.secondary_unit as "secondaryUnit",
        le.notes,
        loc.name as "locationName"
      from lot_events le
      left join locations loc on loc.id = le.location_id
      where le.lot_id = $1
      order by le.event_date asc, le.id asc;
    `,
    [lotId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.eventType,
    eventDate: row.eventDate,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    quantity: toNumber(row.quantity),
    secondaryQuantity: row.secondaryQuantity === null ? null : toNumber(row.secondaryQuantity),
    unit: row.unit || "",
    secondaryUnit: row.secondaryUnit || "",
    notes: row.notes || "",
    locationName: row.locationName || ""
  }));
}

async function getMovements(client, lotId) {
  const result = await client.query(
    `
      select
        sm.id,
        sm.movement_type as "movementType",
        sm.movement_date as "movementDate",
        sm.status,
        sm.document_number as "documentNumber",
        sm.notes,
        s.name as "supplierName",
        coalesce(sml.destination_location_id, sml.current_location_id, sm.destination_location_id) as "locationId",
        loc.name as "locationName",
        m.code as "materialCode",
        m.name as "materialName",
        sml.quantity,
        sml.secondary_quantity as "secondaryQuantity",
        smi.unit,
        smi.secondary_unit as "secondaryUnit"
      from stock_movement_lots sml
      join stock_movement_items smi on smi.id = sml.movement_item_id
      join stock_movements sm on sm.id = smi.movement_id
      join materials m on m.id = smi.material_id
      left join suppliers s on s.id = sm.supplier_id
      left join locations loc on loc.id = coalesce(sml.destination_location_id, sml.current_location_id, sm.destination_location_id)
      where sml.lot_id = $1
      order by sm.movement_date asc, sm.created_at asc;
    `,
    [lotId]
  );

  return result.rows.map(normalizeMovement);
}

async function getProductionsAsInput(client, lotId) {
  const result = await client.query(
    `
      select
        p.id,
        p.production_date as "productionDate",
        p.status,
        p.notes,
        p.location_id as "locationId",
        loc.name as "locationName",
        p.machine_id as "machineId",
        mach.name as "machineName",
        p.material_id as "outputMaterialId",
        om.code as "outputMaterialCode",
        om.name as "outputMaterialName",
        pm.name as "productionModelName",
        string_agg(distinct op.name, ' / ') as "operatorNames",
        pcl.quantity,
        pcl.secondary_quantity as "secondaryQuantity",
        pcl.unit,
        pcl.secondary_unit as "secondaryUnit",
        coalesce(
          json_agg(
            distinct jsonb_build_object(
              'lotId', pol.lot_id,
              'lotCode', pol.lot_code,
              'quantity', pol.quantity,
              'secondaryQuantity', pol.secondary_quantity
            )
          ) filter (where pol.id is not null),
          '[]'
        ) as "outputLots"
      from production_consumed_lots pcl
      join productions p on p.id = pcl.production_id
      join materials om on om.id = p.material_id
      left join locations loc on loc.id = p.location_id
      left join machines mach on mach.id = p.machine_id
      left join material_production_models pm on pm.id = p.production_model_id
      left join production_operators po on po.production_id = p.id
      left join operators op on op.id = po.operator_id
      left join production_output_lots pol on pol.production_id = p.id
      where pcl.lot_id = $1
      group by p.id, loc.name, mach.name, om.code, om.name, pm.name, pcl.id
      order by p.production_date asc, p.created_at asc;
    `,
    [lotId]
  );

  return result.rows.map((row) => normalizeProduction(row, "input"));
}

async function getProductionsAsOutput(client, lotId) {
  const result = await client.query(
    `
      select
        p.id,
        p.production_date as "productionDate",
        p.status,
        p.notes,
        p.location_id as "locationId",
        loc.name as "locationName",
        p.machine_id as "machineId",
        mach.name as "machineName",
        p.material_id as "outputMaterialId",
        om.code as "outputMaterialCode",
        om.name as "outputMaterialName",
        pm.name as "productionModelName",
        string_agg(distinct op.name, ' / ') as "operatorNames",
        pol.lot_code as "lotCode",
        pol.quantity,
        pol.secondary_quantity as "secondaryQuantity",
        pol.unit,
        pol.secondary_unit as "secondaryUnit",
        coalesce(
          json_agg(
            distinct jsonb_build_object(
              'lotId', pcl.lot_id,
              'lotCode', parent.lot_code,
              'quantity', pcl.quantity,
              'secondaryQuantity', pcl.secondary_quantity
            )
          ) filter (where pcl.id is not null),
          '[]'
        ) as "outputLots"
      from production_output_lots pol
      join productions p on p.id = pol.production_id
      join materials om on om.id = p.material_id
      left join locations loc on loc.id = p.location_id
      left join machines mach on mach.id = p.machine_id
      left join material_production_models pm on pm.id = p.production_model_id
      left join production_operators po on po.production_id = p.id
      left join operators op on op.id = po.operator_id
      left join production_consumed_lots pcl on pcl.production_id = p.id
      left join lots parent on parent.id = pcl.lot_id
      where pol.lot_id = $1
      group by p.id, loc.name, mach.name, om.code, om.name, pm.name, pol.id
      order by p.production_date asc, p.created_at asc;
    `,
    [lotId]
  );

  return result.rows.map((row) => normalizeProduction(row, "output"));
}

function buildTimeline({ lot, parents, children, events, movements, productionsAsInput, productionsAsOutput }) {
  const timeline = [];

  if (lot) {
    timeline.push(makeTimelineItem({
      id: `lot-${lot.id}`,
      date: lot.createdAt || lot.productionDate,
      type: "LOT_CREATED",
      title: "Lote criado",
      description: `${lot.lotCode} registrado com origem ${lot.originLabel}.`,
      status: lot.status,
      icon: "•",
      referenceType: "lot",
      referenceId: lot.id,
      locationName: lot.currentLocationName,
      materialName: lot.materialName,
      lotCode: lot.lotCode
    }));
  }

  movements.forEach((movement) => {
    const type = movement.movementType === "PURCHASE" ? "PURCHASE_IN" : "STOCK_MOVEMENT";
    const [title, icon] = getTimelineMeta(type);
    timeline.push(makeTimelineItem({
      id: `movement-${movement.id}-${movement.lotCode || lot.lotCode}`,
      date: movement.movementDate,
      type,
      title,
      description: movement.movementType === "PURCHASE"
        ? `Entrada do lote ${lot.lotCode}${movement.documentNumber ? ` na NF ${movement.documentNumber}` : ""}.`
        : `Movimentacao ${movement.movementType || ""} registrada para o lote.`,
      status: movement.status,
      icon,
      referenceType: "stock_movement",
      referenceId: movement.id,
      quantity: movement.quantity,
      secondaryQuantity: movement.secondaryQuantity,
      locationName: movement.locationName,
      materialName: movement.materialName,
      lotCode: lot.lotCode
    }));
  });

  productionsAsInput.forEach((production) => {
    timeline.push(makeTimelineItem({
      id: `production-input-${production.id}`,
      date: production.productionDate,
      type: "PRODUCTION_CONSUMED",
      title: "Lote consumido na producao",
      description: `Consumido para gerar ${production.outputMaterialName || "material produzido"}.`,
      status: production.status,
      icon: "-",
      referenceType: "production",
      referenceId: production.id,
      quantity: production.quantity * -1,
      secondaryQuantity: production.secondaryQuantity ? production.secondaryQuantity * -1 : production.secondaryQuantity,
      locationName: production.locationName,
      materialName: lot.materialName,
      lotCode: lot.lotCode
    }));
  });

  productionsAsOutput.forEach((production) => {
    timeline.push(makeTimelineItem({
      id: `production-output-${production.id}`,
      date: production.productionDate,
      type: "PRODUCTION_OUTPUT",
      title: "Lote gerado por producao",
      description: `Gerou o lote ${lot.lotCode}${production.productionModelName ? ` pelo modelo ${production.productionModelName}` : ""}.`,
      status: production.status,
      icon: "+",
      referenceType: "production",
      referenceId: production.id,
      quantity: production.quantity,
      secondaryQuantity: production.secondaryQuantity,
      locationName: production.locationName,
      materialName: production.outputMaterialName,
      lotCode: lot.lotCode
    }));
  });

  events.forEach((event) => {
    const type = mapEventType(event.eventType);
    const [title, icon] = getTimelineMeta(type);
    timeline.push(makeTimelineItem({
      id: `event-${event.id}`,
      date: event.eventDate,
      type,
      title,
      description: event.notes || title,
      status: "",
      icon,
      referenceType: event.referenceType,
      referenceId: event.referenceId,
      quantity: event.quantity,
      secondaryQuantity: event.secondaryQuantity,
      locationName: event.locationName,
      materialName: lot.materialName,
      lotCode: lot.lotCode
    }));
  });

  parents.forEach((parent) => {
    timeline.push(makeTimelineItem({
      id: `parent-${parent.id}`,
      date: lot.createdAt || lot.productionDate,
      type: "LINK_PARENT",
      title: "Origem vinculada",
      description: `Lote pai/origem: ${parent.lotCode}.`,
      status: parent.status,
      icon: "↑",
      referenceType: "lot",
      referenceId: parent.lotId,
      materialName: parent.materialName,
      lotCode: parent.lotCode
    }));
  });

  children.forEach((child) => {
    timeline.push(makeTimelineItem({
      id: `child-${child.id}`,
      date: lot.updatedAt || lot.createdAt || lot.productionDate,
      type: "LINK_CHILD",
      title: "Derivacao vinculada",
      description: `Gerou o lote filho/derivado ${child.lotCode}.`,
      status: child.status,
      icon: "↓",
      referenceType: "lot",
      referenceId: child.lotId,
      materialName: child.materialName,
      lotCode: child.lotCode
    }));
  });

  return timeline.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateA - dateB;
  });
}

async function buildLotDetail(client, lot) {
  const [currentBalance, parents, children, events, movements, productionsAsInput, productionsAsOutput] = await Promise.all([
    getCurrentBalance(client, lot.id),
    getRelations(client, lot.id, "parents"),
    getRelations(client, lot.id, "children"),
    getEvents(client, lot.id),
    getMovements(client, lot.id),
    getProductionsAsInput(client, lot.id),
    getProductionsAsOutput(client, lot.id)
  ]);

  const material = {
    id: lot.materialId,
    code: lot.materialCode,
    name: lot.materialName,
    typeId: lot.materialTypeId,
    type: lot.materialType,
    unit: lot.unit,
    secondaryUnit: lot.secondaryUnit
  };

  const location = {
    id: lot.currentLocationId,
    name: lot.currentLocationName
  };

  const timeline = buildTimeline({
    lot,
    parents,
    children,
    events,
    movements,
    productionsAsInput,
    productionsAsOutput
  });

  return {
    lot,
    currentBalance,
    material,
    location,
    parents,
    children,
    events,
    movements,
    productionsAsInput,
    productionsAsOutput,
    timeline
  };
}

router.get("/search", async (req, res) => {
  const client = await pool.connect();

  try {
    const filters = [];
    const values = [];
    const q = String(req.query.q || "").trim();

    if (q) {
      values.push(`%${q.toLowerCase()}%`);
      filters.push(`(
        lower(lo.lot_code) like $${values.length}
        or lower(m.name) like $${values.length}
        or lower(m.code) like $${values.length}
      )`);
    }

    if (req.query.materialId) addFilter(filters, values, "m.id = ?", req.query.materialId);
    if (req.query.typeId) addFilter(filters, values, "mt.id = ?", req.query.typeId);
    if (req.query.locationId) {
      addFilter(filters, values, "(lo.current_location_id = ? or exists (select 1 from stock_balances fsb where fsb.lot_id = lo.id and fsb.location_id = ?))", req.query.locationId);
      values.push(req.query.locationId);
      filters[filters.length - 1] = filters[filters.length - 1].replace("?", `$${values.length}`);
    }
    if (req.query.status) {
      const status = String(req.query.status).toLowerCase();
      const statusPattern = status.includes("dispon")
        ? "dispon%"
        : status.includes("cancel")
          ? "cancel%"
          : status.includes("reprocess")
            ? "reprocess%"
            : status.includes("sem")
              ? "sem saldo%"
              : `${status}%`;
      addFilter(filters, values, "lower(lo.status) like ?", statusPattern);
    }
    if (req.query.from) addFilter(filters, values, "coalesce(lo.production_date, lo.created_at::date) >= ?::date", req.query.from);
    if (req.query.to) addFilter(filters, values, "coalesce(lo.production_date, lo.created_at::date) <= ?::date", req.query.to);

    const where = filters.length ? `where ${filters.join(" and ")}` : "";

    const result = await client.query(
      `
        select
          lo.id,
          lo.lot_code as "lotCode",
          lo.material_id as "materialId",
          m.code as "materialCode",
          m.name as "materialName",
          mt.id as "materialTypeId",
          mt.name as "materialType",
          coalesce(m.primary_unit, m.unit) as unit,
          m.secondary_unit as "secondaryUnit",
          lo.origin_type as "originType",
          lo.origin_id as "originId",
          lo.current_location_id as "currentLocationId",
          loc.name as "currentLocationName",
          lo.production_date as "productionDate",
        lo.status,
          lo.created_at as "createdAt",
          lo.updated_at as "updatedAt",
          coalesce(sum(sb.quantity), 0) as quantity,
          coalesce(sum(sb.secondary_quantity), 0) as "secondaryQuantity"
        from lots lo
        join materials m on m.id = lo.material_id
        left join material_types mt on mt.id = m.material_type_id
        left join locations loc on loc.id = lo.current_location_id
        left join stock_balances sb on sb.lot_id = lo.id
        ${where}
        group by lo.id, m.id, mt.id, mt.name, loc.name
        order by coalesce(lo.updated_at, lo.created_at) desc, lo.lot_code asc
        limit 80;
      `,
      values
    );

    return res.json(result.rows.map((row) => ({
      ...normalizeLot(row),
      quantity: toNumber(row.quantity),
      secondaryQuantity: toNumber(row.secondaryQuantity)
    })));
  } catch (error) {
    console.error("Erro ao buscar rastreabilidade:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.get("/lots/code/:lotCode", async (req, res) => {
  const client = await pool.connect();

  try {
    const lot = await getLotBase(client, "lo.lot_code = $1", [String(req.params.lotCode || "").toUpperCase()]);

    if (!lot) return res.status(404).json({ error: "Lote nao encontrado." });

    return res.json(await buildLotDetail(client, lot));
  } catch (error) {
    console.error("Erro ao consultar lote por codigo:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.get("/lots/:lotId", async (req, res) => {
  const client = await pool.connect();

  try {
    const lot = await getLotBase(client, "lo.id = $1", [req.params.lotId]);

    if (!lot) return res.status(404).json({ error: "Lote nao encontrado." });

    return res.json(await buildLotDetail(client, lot));
  } catch (error) {
    console.error("Erro ao consultar lote:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

module.exports = router;
