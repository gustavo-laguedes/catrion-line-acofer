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
    materialName: row.materialName || "Material não informado",
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
    quantity: row.quantity === null || row.quantity === undefined ? null : toNumber(row.quantity),
    secondaryQuantity: row.secondaryQuantity === null || row.secondaryQuantity === undefined ? null : toNumber(row.secondaryQuantity),
    notes: row.notes || "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function getOriginLabel(originType) {
  if (originType === "PURCHASE") return "Compra/entrada";
  if (originType === "PRODUCTION") return "Produção";
  if (originType === "INVENTORY") return "Inventário";
  if (originType === "ADJUSTMENT") return "Ajuste";
  return originType || "Origem não informada";
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
    parentLotId: row.parentLotId || "",
    childLotId: row.childLotId || "",
    lotCode: row.lotCode,
    materialName: row.materialName || "",
    materialCode: row.materialCode || "",
    status: row.status || "",
    linkType: row.linkType || "TRANSFORMATION",
    productionId: row.productionId || "",
    productionDate: toDateOnly(row.productionDate),
    productionCreatedAt: row.productionCreatedAt || null,
    direction
  };
}

function normalizeMovement(row) {
  return {
    id: row.id,
    movementType: row.movementType || "",
    typeLabel: row.movementType === "PURCHASE" ? "Compra" : row.movementType || "Movimentação",
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
    traceLotId: row.traceLotId || "",
    productionDate: toDateOnly(row.productionDate),
    status: row.status || "",
    notes: row.notes || "",
    createdAt: row.createdAt || null,
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
    outputLots: Array.isArray(row.outputLots) ? row.outputLots.map(normalizeProductionLinkedLot) : []
  };
}

function normalizeProductionLinkedLot(lot) {
  return {
    lotId: lot.lotId || "",
    lotCode: lot.lotCode || "",
    quantity: toNumber(lot.quantity),
    secondaryQuantity: lot.secondaryQuantity === null || lot.secondaryQuantity === undefined
      ? null
      : toNumber(lot.secondaryQuantity),
    unit: lot.unit || "",
    secondaryUnit: lot.secondaryUnit || ""
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
    unit: item.unit || "",
    secondaryUnit: item.secondaryUnit || "",
    locationName: item.locationName || "",
    materialName: item.materialName || "",
    lotCode: item.lotCode || "",
    childLots: Array.isArray(item.childLots) ? item.childLots.map(normalizeProductionLinkedLot) : [],
    flowOrder: Number.isFinite(Number(item.flowOrder)) ? Number(item.flowOrder) : getTimelineFlowOrder(item.type)
  };
}

function mapEventType(eventType) {
  if (eventType === "PRODUCTION_CONSUME") return "PRODUCTION_CONSUMED";
  if (eventType === "PRODUCTION_OUTPUT") return "PRODUCTION_OUTPUT";
  if (eventType === "EXPEDITION_CANCEL") return "EXPEDITION_CANCEL";
  if (eventType === "EXPEDITION_REPROCESS") return "EXPEDITION_REPROCESS";
  if (String(eventType || "").includes("CANCEL")) return "PRODUCTION_CANCEL";
  if (String(eventType || "").includes("REPROCESS")) return "PRODUCTION_REPROCESS";
  return eventType || "LOT_EVENT";
}

function getTimelineMeta(type) {
  const meta = {
    LOT_CREATED: ["Lote criado", "•"],
    PURCHASE_IN: ["Entrada por compra", "+"],
    PRODUCTION_CONSUMED: ["Produção: consumiu este lote e gerou derivados", "-"],
    PRODUCTION_OUTPUT: ["Geração por produção", "+"],
    INDUSTRIAL_LOSS: ["Perda industrial", "-"],
    PRODUCTION_LOSS: ["Perda industrial", "-"],
    PRODUCTION_CANCEL: ["Cancelamento", "!"],
    PRODUCTION_REPROCESS: ["Reprocessamento", "↻"],
    STOCK_MOVEMENT: ["Movimentação de estoque", "↔"],
    EXPEDITION_SHIPMENT: ["Expedição / carregamento", ">"],
    EXPEDITION_CANCEL: ["Expedição cancelada", "!"],
    EXPEDITION_REPROCESS: ["Expedição reprocessada", "↻"],
    LINK_PARENT: ["Vinculo com lote origem", "↑"],
    LINK_CHILD: ["Vinculo com lote derivado", "↓"]
  };

  return meta[type] || [type || "Evento", "•"];
}

function getTimelineMetaPt(type) {
  const meta = {
    LOT_CREATED: ["Lote criado", "•"],
    PURCHASE_IN: ["Entrada por compra", "+"],
    PRODUCTION_CONSUMED: ["Produção: consumiu este lote e gerou derivados", "-"],
    PRODUCTION_OUTPUT: ["Geração por produção", "+"],
    INDUSTRIAL_LOSS: ["Perda industrial", "-"],
    PRODUCTION_LOSS: ["Perda industrial", "-"],
    PRODUCTION_CANCEL: ["Cancelamento", "!"],
    PRODUCTION_REPROCESS: ["Reprocessamento", "↻"],
    STOCK_MOVEMENT: ["Movimentação de estoque", "↔"],
    EXPEDITION_SHIPMENT: ["Expedição / carregamento", ">"],
    EXPEDITION_CANCEL: ["Expedição cancelada", "!"],
    EXPEDITION_REPROCESS: ["Expedição reprocessada", "↻"],
    LINK_PARENT: ["Vínculo com lote origem", "↑"],
    LINK_CHILD: ["Vínculo com lote derivado", "↓"]
  };

  return meta[type] || [type || "Evento", "•"];
}

function getTimelineFlowOrder(type = "") {
  if (type === "PURCHASE_IN") return 10;
  if (type === "LOT_CREATED") return 15;
  if (type === "LINK_PARENT") return 20;
  if (type === "PRODUCTION_CONSUMED" || type === "PRODUCTION_OUTPUT") return 30;
  if (type === "INDUSTRIAL_LOSS" || type === "PRODUCTION_LOSS") return 35;
  if (type === "PRODUCTION_CANCEL" || type === "PRODUCTION_REPROCESS") return 40;
  if (type === "LINK_CHILD") return 45;
  if (type === "STOCK_MOVEMENT") return 50;
  if (type === "EXPEDITION_SHIPMENT" || type === "EXPEDITION_CANCEL" || type === "EXPEDITION_REPROCESS") return 70;
  return 60;
}

function getEventStatus(type) {
  if (type === "EXPEDITION_SHIPMENT") return "Processado";
  if (type === "EXPEDITION_CANCEL") return "Cancelado";
  if (type === "EXPEDITION_REPROCESS") return "Reprocessado";
  return "";
}

function formatQuantity(value, unit) {
  return `${toNumber(value).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  })}${unit ? ` ${unit}` : ""}`;
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
        ll.parent_lot_id as "parentLotId",
        ll.child_lot_id as "childLotId",
        linked.id as "lotId",
        linked.lot_code as "lotCode",
        m.code as "materialCode",
        m.name as "materialName",
        linked.status,
        ll.link_type as "linkType",
        ll.production_id as "productionId",
        p.production_date as "productionDate",
        p.created_at as "productionCreatedAt"
      from lot_links ll
      join lots linked on linked.id = ${isParent ? "ll.parent_lot_id" : "ll.child_lot_id"}
      join materials m on m.id = linked.material_id
      left join productions p on p.id = ll.production_id
      where ${isParent ? "ll.child_lot_id" : "ll.parent_lot_id"} = $1
      order by linked.lot_code asc;
    `,
    [lotId]
  );

  return result.rows.map((row) => normalizeRelation(row, isParent ? "parent" : "child"));
}

function normalizeGraphLot(row, prefix) {
  return normalizeLot({
    id: row[`${prefix}Id`],
    lotCode: row[`${prefix}LotCode`],
    materialId: row[`${prefix}MaterialId`],
    materialCode: row[`${prefix}MaterialCode`],
    materialName: row[`${prefix}MaterialName`],
    materialTypeId: row[`${prefix}MaterialTypeId`],
    materialType: row[`${prefix}MaterialType`],
    unit: row[`${prefix}Unit`],
    secondaryUnit: row[`${prefix}SecondaryUnit`],
    originType: row[`${prefix}OriginType`],
    originId: row[`${prefix}OriginId`],
    currentLocationId: row[`${prefix}CurrentLocationId`],
    currentLocationName: row[`${prefix}CurrentLocationName`],
    productionDate: row[`${prefix}ProductionDate`],
    status: row[`${prefix}Status`],
    quantity: row[`${prefix}Quantity`],
    secondaryQuantity: row[`${prefix}SecondaryQuantity`],
    createdAt: row[`${prefix}CreatedAt`],
    updatedAt: row[`${prefix}UpdatedAt`]
  });
}

function makeGraphRelation(row, direction, lot) {
  return {
    id: row.linkId,
    lotId: lot.id,
    parentLotId: row.parentLotId || "",
    childLotId: row.childLotId || "",
    lotCode: lot.lotCode,
    materialName: lot.materialName || "",
    materialCode: lot.materialCode || "",
    status: lot.status || "",
    linkType: row.linkType || "TRANSFORMATION",
    productionId: row.productionId || "",
    productionDate: toDateOnly(row.productionDate),
    productionCreatedAt: row.productionCreatedAt || null,
    direction
  };
}

function buildIndustrialTree({ rootLotId, lotsById, edges }) {
  const rootId = String(rootLotId);
  const seenAncestorIds = new Set([rootId]);
  const seenDescendantIds = new Set([rootId]);
  const incoming = new Map();
  const outgoing = new Map();

  edges.forEach((edge) => {
    const parentId = String(edge.parentLotId || "");
    const childId = String(edge.childLotId || "");
    if (!parentId || !childId) return;
    incoming.set(childId, [...(incoming.get(childId) || []), edge]);
    outgoing.set(parentId, [...(outgoing.get(parentId) || []), edge]);
  });

  const ancestorLevels = [];
  let currentIds = [rootId];

  while (currentIds.length) {
    const level = [];
    const nextIds = [];

    currentIds.forEach((id) => {
      (incoming.get(id) || []).forEach((edge) => {
        const parentId = String(edge.parentLotId || "");
        const parentLot = lotsById.get(parentId);
        if (!parentId || !parentLot || seenAncestorIds.has(parentId)) return;
        seenAncestorIds.add(parentId);
        nextIds.push(parentId);
        level.push({
          ...parentLot,
          lotId: parentLot.id,
          parentLotId: edge.parentLotId,
          childLotId: edge.childLotId,
          linkId: edge.id,
          productionId: edge.productionId
        });
      });
    });

    if (!level.length) break;
    ancestorLevels.push(level);
    currentIds = nextIds;
  }

  const descendantLevels = [];
  currentIds = [rootId];

  while (currentIds.length) {
    const level = [];
    const nextIds = [];

    currentIds.forEach((id) => {
      (outgoing.get(id) || []).forEach((edge) => {
        const childId = String(edge.childLotId || "");
        const childLot = lotsById.get(childId);
        if (!childId || !childLot || seenDescendantIds.has(childId)) return;
        seenDescendantIds.add(childId);
        nextIds.push(childId);
        level.push({
          ...childLot,
          lotId: childLot.id,
          parentLotId: edge.parentLotId,
          childLotId: edge.childLotId,
          linkId: edge.id,
          productionId: edge.productionId
        });
      });
    });

    if (!level.length) break;
    descendantLevels.push(level);
    currentIds = nextIds;
  }

  return {
    maxDepth: Math.max(ancestorLevels.length, descendantLevels.length),
    nodes: [...lotsById.values()].map((lot) => ({
      ...lot,
      lotId: lot.id
    })),
    levels: [
      ...ancestorLevels.reverse().map((lots, index, source) => ({
        type: "ancestor",
        title: index === 0 ? "Origem industrial" : `Ancestral nivel ${source.length - index}`,
        count: lots.length,
        depth: source.length - index,
        lots
      })),
      {
        type: "current",
        title: "Lote selecionado",
        countLabel: "Selecionado",
        depth: 0,
        lots: [lotsById.get(rootId)].filter(Boolean)
      },
      ...descendantLevels.map((lots, index) => ({
        type: "descendant",
        title: index === 0 ? "Filhos/derivados" : `Derivados nivel ${index + 1}`,
        count: lots.length,
        depth: index + 1,
        lots
      }))
    ],
    lotIds: [...lotsById.keys()],
    edges: edges.map((edge) => ({
      id: edge.id,
      fromLotId: edge.parentLotId,
      toLotId: edge.childLotId,
      parentLotId: edge.parentLotId,
      childLotId: edge.childLotId,
      productionId: edge.productionId || "",
      linkType: edge.linkType || "TRANSFORMATION",
      productionDate: edge.productionDate || "",
      productionCreatedAt: edge.productionCreatedAt || null
    }))
  };
}

async function getTraceabilityGraph(client, lotId) {
  const result = await client.query(
    `
      with recursive ancestors as (
        select
          ll.id,
          ll.parent_lot_id,
          ll.child_lot_id,
          ll.production_id,
          ll.link_type,
          1 as depth,
          array[$1::uuid, ll.parent_lot_id] as path
        from lot_links ll
        where ll.child_lot_id = $1

        union all

        select
          ll.id,
          ll.parent_lot_id,
          ll.child_lot_id,
          ll.production_id,
          ll.link_type,
          ancestors.depth + 1,
          ancestors.path || ll.parent_lot_id
        from ancestors
        join lot_links ll on ll.child_lot_id = ancestors.parent_lot_id
        where ancestors.depth < 24
          and not ll.parent_lot_id = any(ancestors.path)
      ),
      descendants as (
        select
          ll.id,
          ll.parent_lot_id,
          ll.child_lot_id,
          ll.production_id,
          ll.link_type,
          1 as depth,
          array[$1::uuid, ll.child_lot_id] as path
        from lot_links ll
        where ll.parent_lot_id = $1

        union all

        select
          ll.id,
          ll.parent_lot_id,
          ll.child_lot_id,
          ll.production_id,
          ll.link_type,
          descendants.depth + 1,
          descendants.path || ll.child_lot_id
        from descendants
        join lot_links ll on ll.parent_lot_id = descendants.child_lot_id
        where descendants.depth < 24
          and not ll.child_lot_id = any(descendants.path)
      ),
      graph as (
        select * from ancestors
        union all
        select * from descendants
      ),
      unique_links as (
        select distinct on (id) *
        from graph
        order by id, depth asc
        limit 240
      ),
      lot_quantities as (
        select distinct on (lot_id)
          lot_id,
          quantity,
          secondary_quantity,
          unit,
          secondary_unit
        from (
          select
            pol.lot_id,
            sum(pol.quantity) as quantity,
            sum(pol.secondary_quantity) as secondary_quantity,
            (array_agg(pol.unit order by pol.id desc) filter (where pol.unit is not null))[1] as unit,
            (array_agg(pol.secondary_unit order by pol.id desc) filter (where pol.secondary_unit is not null))[1] as secondary_unit,
            1 as priority
          from production_output_lots pol
          group by pol.lot_id

          union all

          select
            sml.lot_id,
            sum(sml.quantity) as quantity,
            sum(sml.secondary_quantity) as secondary_quantity,
            (array_agg(smi.unit order by sm.created_at desc) filter (where smi.unit is not null))[1] as unit,
            (array_agg(smi.secondary_unit order by sm.created_at desc) filter (where smi.secondary_unit is not null))[1] as secondary_unit,
            2 as priority
          from stock_movement_lots sml
          join stock_movement_items smi on smi.id = sml.movement_item_id
          join stock_movements sm on sm.id = smi.movement_id
          where sm.movement_type = 'PURCHASE'
          group by sml.lot_id
        ) quantities
        order by lot_id, priority asc
      )
      select
        ul.id as "linkId",
        ul.parent_lot_id as "parentLotId",
        ul.child_lot_id as "childLotId",
        ul.production_id as "productionId",
        ul.link_type as "linkType",
        p.production_date as "productionDate",
        p.created_at as "productionCreatedAt",
        parent.id as "parentId",
        parent.lot_code as "parentLotCode",
        parent.material_id as "parentMaterialId",
        pm.code as "parentMaterialCode",
        pm.name as "parentMaterialName",
        pmt.id as "parentMaterialTypeId",
        pmt.name as "parentMaterialType",
        coalesce(pm.primary_unit, pm.unit) as "parentUnit",
        pm.secondary_unit as "parentSecondaryUnit",
        parent.origin_type as "parentOriginType",
        parent.origin_id as "parentOriginId",
        parent.current_location_id as "parentCurrentLocationId",
        ploc.name as "parentCurrentLocationName",
        parent.production_date as "parentProductionDate",
        parent.status as "parentStatus",
        pq.quantity as "parentQuantity",
        pq.secondary_quantity as "parentSecondaryQuantity",
        parent.created_at as "parentCreatedAt",
        parent.updated_at as "parentUpdatedAt",
        child.id as "childId",
        child.lot_code as "childLotCode",
        child.material_id as "childMaterialId",
        cm.code as "childMaterialCode",
        cm.name as "childMaterialName",
        cmt.id as "childMaterialTypeId",
        cmt.name as "childMaterialType",
        coalesce(cm.primary_unit, cm.unit) as "childUnit",
        cm.secondary_unit as "childSecondaryUnit",
        child.origin_type as "childOriginType",
        child.origin_id as "childOriginId",
        child.current_location_id as "childCurrentLocationId",
        cloc.name as "childCurrentLocationName",
        child.production_date as "childProductionDate",
        child.status as "childStatus",
        cq.quantity as "childQuantity",
        cq.secondary_quantity as "childSecondaryQuantity",
        child.created_at as "childCreatedAt",
        child.updated_at as "childUpdatedAt"
      from unique_links ul
      join lots parent on parent.id = ul.parent_lot_id
      join materials pm on pm.id = parent.material_id
      left join material_types pmt on pmt.id = pm.material_type_id
      left join locations ploc on ploc.id = parent.current_location_id
      left join lot_quantities pq on pq.lot_id = parent.id
      join lots child on child.id = ul.child_lot_id
      join materials cm on cm.id = child.material_id
      left join material_types cmt on cmt.id = cm.material_type_id
      left join locations cloc on cloc.id = child.current_location_id
      left join lot_quantities cq on cq.lot_id = child.id
      left join productions p on p.id = ul.production_id
      order by coalesce(p.production_date, p.created_at::date) asc, parent.lot_code asc, child.lot_code asc;
    `,
    [lotId]
  );

  const lotsById = new Map();
  const edges = [];

  result.rows.forEach((row) => {
    const parentLot = normalizeGraphLot(row, "parent");
    const childLot = normalizeGraphLot(row, "child");

    if (parentLot?.id && !lotsById.has(String(parentLot.id))) lotsById.set(String(parentLot.id), parentLot);
    if (childLot?.id && !lotsById.has(String(childLot.id))) lotsById.set(String(childLot.id), childLot);

    edges.push({
      id: row.linkId,
      parentLotId: row.parentLotId,
      childLotId: row.childLotId,
      productionId: row.productionId || "",
      linkType: row.linkType || "TRANSFORMATION",
      productionDate: toDateOnly(row.productionDate),
      productionCreatedAt: row.productionCreatedAt || null
    });
  });

  return { lotsById, edges };
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

async function getLaboratoryCertificates(client, lotId) {
  const table = await client.query("select to_regclass('public.laboratory_tests') as table_name");
  if (!table.rows[0]?.table_name) return [];

  const result = await client.query(
    `
      select
        id,
        certificate_code as "certificateCode",
        certificate_file_name as "certificateFileName",
        certificate_file_url as "certificateFileUrl",
        supplier_certificate_number as "supplierCertificateNumber",
        test_date as "testDate",
        status,
        variation_percent as "variationPercent",
        ratio_lr_le as "ratioLrLe"
      from laboratory_tests
      where lot_id = $1
      order by tested_at desc, created_at desc;
    `,
    [lotId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    certificateCode: row.certificateCode || "",
    certificateFileName: row.certificateFileName || "",
    certificateFileUrl: row.certificateFileUrl || "",
    supplierCertificateNumber: row.supplierCertificateNumber || "",
    testDate: toDateOnly(row.testDate),
    status: row.status || "",
    variationPercent: toNumber(row.variationPercent),
    ratioLrLe: toNumber(row.ratioLrLe)
  }));
}

async function getProductionsAsInput(client, lotId) {
  const result = await client.query(
    `
      select
        p.id,
        p.production_date as "productionDate",
        p.created_at as "createdAt",
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
        pcl.lot_id as "traceLotId",
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
              'secondaryQuantity', pol.secondary_quantity,
              'unit', pol.unit,
              'secondaryUnit', pol.secondary_unit
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
        p.created_at as "createdAt",
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
        pol.lot_id as "traceLotId",
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
              'secondaryQuantity', pcl.secondary_quantity,
              'unit', pcl.unit,
              'secondaryUnit', pcl.secondary_unit
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

function shouldConsolidateLotCreatedWithProduction(lot, production) {
  if (!lot || lot.originType !== "PRODUCTION" || !production?.id) return false;

  if (lot.originId && String(lot.originId) === String(production.id)) return true;

  // A production output row exists only when production_output_lots points to this lot.
  if (production.role === "output") return true;

  return areTraceabilityDatesClose(lot.createdAt || lot.productionDate, production.createdAt || production.productionDate);
}

function shouldConsolidateLotCreatedWithMovement(lot, movement) {
  if (!lot || !movement) return false;

  if (lot.originType === "PURCHASE" && movement.movementType === "PURCHASE") return true;

  return areTraceabilityDatesClose(lot.createdAt || lot.productionDate, movement.movementDate);
}

function areTraceabilityDatesClose(firstDate, secondDate) {
  if (!firstDate || !secondDate) return false;

  const firstTime = new Date(firstDate).getTime();
  const secondTime = new Date(secondDate).getTime();

  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) return false;

  return Math.abs(firstTime - secondTime) <= 5 * 60 * 1000;
}

function buildTimeline({ lot, parents, children, events, movements, productionsAsInput, productionsAsOutput }) {
  const timeline = [];
  const eventDateByProduction = new Map();
  const inputProductionIds = new Set(productionsAsInput.map((production) => String(production.id)));
  const outputProductionIds = new Set(productionsAsOutput.map((production) => String(production.id)));
  const childLotsByProduction = new Map();

  children.forEach((child) => {
    if (!child.productionId) return;
    const key = String(child.productionId);
    const lots = childLotsByProduction.get(key) || [];
    lots.push({
      lotId: child.lotId,
      lotCode: child.lotCode,
      quantity: child.quantity,
      secondaryQuantity: child.secondaryQuantity,
      unit: child.unit,
      secondaryUnit: child.secondaryUnit
    });
    childLotsByProduction.set(key, lots);
  });

  events.forEach((event) => {
    const type = mapEventType(event.eventType);
    if (String(event.referenceType || "").toLowerCase() === "production" && event.referenceId && event.eventDate) {
      eventDateByProduction.set(`${type}:${event.referenceId}`, event.eventDate);
    }
  });

  if (lot) {
    const outputOrigin = productionsAsOutput.find((production) => String(production.id) === String(lot.originId)) || productionsAsOutput[0];
    const movementOrigin = movements.find((movement) => shouldConsolidateLotCreatedWithMovement(lot, movement));
    const shouldConsolidateLotCreated =
      shouldConsolidateLotCreatedWithProduction(lot, outputOrigin) ||
      Boolean(movementOrigin);

    if (!shouldConsolidateLotCreated) {
      timeline.push(makeTimelineItem({
        id: `lot-${lot.id}`,
        date: lot.originType === "PRODUCTION" && outputOrigin
          ? eventDateByProduction.get(`PRODUCTION_OUTPUT:${outputOrigin.id}`) || outputOrigin.productionDate || outputOrigin.createdAt || lot.productionDate || lot.createdAt
          : lot.productionDate || lot.createdAt,
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
  }

  movements.forEach((movement) => {
    const type = movement.movementType === "PURCHASE" ? "PURCHASE_IN" : "STOCK_MOVEMENT";
    const [title, icon] = getTimelineMetaPt(type);
    timeline.push(makeTimelineItem({
      id: `movement-${movement.id}-${movement.lotCode || lot.lotCode}`,
      date: movement.movementDate,
      type,
      title,
      description: movement.movementType === "PURCHASE"
        ? `Lote criado pela entrada${movement.documentNumber ? ` da NF ${movement.documentNumber}` : ""}.`
        : `Movimentação ${movement.movementType || ""} registrada para o lote.`,
      status: movement.status,
      icon,
      referenceType: "stock_movement",
      referenceId: movement.id,
      quantity: movement.quantity,
      secondaryQuantity: movement.secondaryQuantity,
      unit: movement.unit,
      secondaryUnit: movement.secondaryUnit,
      locationName: movement.locationName,
      materialName: movement.materialName,
      lotCode: lot.lotCode
    }));
  });

  productionsAsInput.forEach((production) => {
    const childLots = production.outputLots.length ? production.outputLots : childLotsByProduction.get(String(production.id)) || [];
    const childCodes = childLots.map((child) => child.lotCode).filter(Boolean);
    const [title, icon] = getTimelineMetaPt("PRODUCTION_CONSUMED");

    timeline.push(makeTimelineItem({
      id: `production-input-${production.id}`,
      date: eventDateByProduction.get(`PRODUCTION_CONSUMED:${production.id}`) || production.productionDate || production.createdAt,
      type: "PRODUCTION_CONSUMED",
      title,
      description: `Consumiu ${formatQuantity(production.quantity, production.unit)} deste lote para gerar ${childCodes.length ? `os lotes ${childCodes.join(", ")}` : production.outputMaterialName || "material produzido"}.`,
      status: production.status,
      icon,
      referenceType: "production",
      referenceId: production.id,
      quantity: production.quantity * -1,
      secondaryQuantity: production.secondaryQuantity ? production.secondaryQuantity * -1 : production.secondaryQuantity,
      unit: production.unit,
      secondaryUnit: production.secondaryUnit,
      locationName: production.locationName,
      materialName: lot.materialName,
      lotCode: lot.lotCode,
      childLots,
      flowOrder: 30
    }));
  });

  productionsAsOutput.forEach((production) => {
    const isConsolidatedCreation = shouldConsolidateLotCreatedWithProduction(lot, production);

    timeline.push(makeTimelineItem({
      id: `production-output-${production.id}`,
      date: eventDateByProduction.get(`PRODUCTION_OUTPUT:${production.id}`) || production.productionDate || production.createdAt,
      type: "PRODUCTION_OUTPUT",
      title: "Lote gerado por produção",
      description: isConsolidatedCreation
        ? `Lote gerado automaticamente pela produção${production.productionModelName ? ` do modelo ${production.productionModelName}` : ""}.`
        : `Gerou o lote ${lot.lotCode}${production.productionModelName ? ` pelo modelo ${production.productionModelName}` : ""}.`,
      status: production.status,
      icon: "+",
      referenceType: "production",
      referenceId: production.id,
      quantity: production.quantity,
      secondaryQuantity: production.secondaryQuantity,
      unit: production.unit,
      secondaryUnit: production.secondaryUnit,
      locationName: production.locationName,
      materialName: production.outputMaterialName,
      lotCode: lot.lotCode
    }));
  });

  events.forEach((event) => {
    const type = mapEventType(event.eventType);
    const isCoveredProductionEvent = String(event.referenceType || "").toLowerCase() === "production" &&
      ((type === "PRODUCTION_CONSUMED" && inputProductionIds.has(String(event.referenceId))) ||
        (type === "PRODUCTION_OUTPUT" && outputProductionIds.has(String(event.referenceId))));

    if (isCoveredProductionEvent) return;

    const [title, icon] = getTimelineMetaPt(type);
    timeline.push(makeTimelineItem({
      id: `event-${event.id}`,
      date: event.eventDate,
      type,
      title,
      description: event.notes || title,
      status: getEventStatus(type),
      icon,
      referenceType: event.referenceType,
      referenceId: event.referenceId,
      quantity: event.quantity,
      secondaryQuantity: event.secondaryQuantity,
      unit: event.unit || lot.unit,
      secondaryUnit: event.secondaryUnit || lot.secondaryUnit,
      locationName: event.locationName,
      materialName: lot.materialName,
      lotCode: lot.lotCode
    }));
  });

  parents
    .filter((parent) => !parent.productionId || !outputProductionIds.has(String(parent.productionId)))
    .forEach((parent) => {
    timeline.push(makeTimelineItem({
      id: `parent-${parent.id}`,
      date: parent.productionDate || parent.productionCreatedAt || lot.productionDate || lot.createdAt,
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

  children
    .filter((child) => !child.productionId || !inputProductionIds.has(String(child.productionId)))
    .forEach((child) => {
    timeline.push(makeTimelineItem({
      id: `child-${child.id}`,
      date: child.productionDate || child.productionCreatedAt || lot.updatedAt || lot.createdAt || lot.productionDate,
      type: "LINK_CHILD",
      title: "Derivação vinculada",
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
    if (a.flowOrder !== b.flowOrder) return a.flowOrder - b.flowOrder;
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    return dateA - dateB;
  });
}

function groupByTraceLotId(items) {
  return items.reduce((map, item) => {
    const key = String(item.traceLotId || item.lotId || "");
    if (!key) return map;
    const group = map.get(key) || [];
    group.push(item);
    map.set(key, group);
    return map;
  }, new Map());
}

async function getEventsForLots(client, lotIds) {
  if (!lotIds.length) return [];

  const result = await client.query(
    `
      select
        le.lot_id as "traceLotId",
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
      where le.lot_id = any($1::uuid[])
      order by le.event_date asc, le.id asc;
    `,
    [lotIds]
  );

  return result.rows.map((row) => ({
    traceLotId: row.traceLotId,
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

async function getMovementsForLots(client, lotIds) {
  if (!lotIds.length) return [];

  const result = await client.query(
    `
      select
        sml.lot_id as "traceLotId",
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
      where sml.lot_id = any($1::uuid[])
      order by sm.movement_date asc, sm.created_at asc;
    `,
    [lotIds]
  );

  return result.rows.map((row) => ({
    ...normalizeMovement(row),
    traceLotId: row.traceLotId
  }));
}

async function getProductionsAsInputForLots(client, lotIds) {
  if (!lotIds.length) return [];

  const result = await client.query(
    `
      select
        p.id,
        p.production_date as "productionDate",
        p.created_at as "createdAt",
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
        pcl.lot_id as "traceLotId",
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
              'secondaryQuantity', pol.secondary_quantity,
              'unit', pol.unit,
              'secondaryUnit', pol.secondary_unit
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
      where pcl.lot_id = any($1::uuid[])
      group by p.id, loc.name, mach.name, om.code, om.name, pm.name, pcl.id
      order by p.production_date asc, p.created_at asc;
    `,
    [lotIds]
  );

  return result.rows.map((row) => normalizeProduction(row, "input"));
}

async function getProductionsAsOutputForLots(client, lotIds) {
  if (!lotIds.length) return [];

  const result = await client.query(
    `
      select
        p.id,
        p.production_date as "productionDate",
        p.created_at as "createdAt",
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
        pol.lot_id as "traceLotId",
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
              'secondaryQuantity', pcl.secondary_quantity,
              'unit', pcl.unit,
              'secondaryUnit', pcl.secondary_unit
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
      where pol.lot_id = any($1::uuid[])
      group by p.id, loc.name, mach.name, om.code, om.name, pm.name, pol.id
      order by p.production_date asc, p.created_at asc;
    `,
    [lotIds]
  );

  return result.rows.map((row) => normalizeProduction(row, "output"));
}

async function buildCompleteTimeline(client, industrialTree, lotsById) {
  const lotIds = industrialTree.lotIds.slice(0, 120);
  const [events, movements, productionsAsInput, productionsAsOutput] = await Promise.all([
    getEventsForLots(client, lotIds),
    getMovementsForLots(client, lotIds),
    getProductionsAsInputForLots(client, lotIds),
    getProductionsAsOutputForLots(client, lotIds)
  ]);

  const eventsByLot = groupByTraceLotId(events);
  const movementsByLot = groupByTraceLotId(movements);
  const inputByLot = groupByTraceLotId(productionsAsInput);
  const outputByLot = groupByTraceLotId(productionsAsOutput);
  const parentsByLot = new Map();
  const childrenByLot = new Map();

  industrialTree.edges.forEach((edge) => {
    const parentLot = lotsById.get(String(edge.parentLotId));
    const childLot = lotsById.get(String(edge.childLotId));
    if (!parentLot || !childLot) return;

    const parentRelation = makeGraphRelation(edge, "parent", parentLot);
    const childRelation = makeGraphRelation(edge, "child", childLot);
    parentsByLot.set(String(edge.childLotId), [...(parentsByLot.get(String(edge.childLotId)) || []), parentRelation]);
    childrenByLot.set(String(edge.parentLotId), [...(childrenByLot.get(String(edge.parentLotId)) || []), childRelation]);
  });

  const seen = new Set();
  const timeline = [];

  lotIds.forEach((lotId) => {
    const lot = lotsById.get(String(lotId));
    if (!lot) return;

    buildTimeline({
      lot,
      parents: parentsByLot.get(String(lotId)) || [],
      children: childrenByLot.get(String(lotId)) || [],
      events: eventsByLot.get(String(lotId)) || [],
      movements: movementsByLot.get(String(lotId)) || [],
      productionsAsInput: inputByLot.get(String(lotId)) || [],
      productionsAsOutput: outputByLot.get(String(lotId)) || []
    }).forEach((item) => {
      const key = [
        item.type,
        item.referenceType,
        item.referenceId,
        item.lotCode,
        item.quantity,
        item.secondaryQuantity,
        item.date
      ].join(":");
      if (seen.has(key)) return;
      seen.add(key);
      timeline.push(item);
    });
  });

  return timeline.sort((a, b) => {
    const dateA = a.date ? new Date(a.date).getTime() : 0;
    const dateB = b.date ? new Date(b.date).getTime() : 0;
    if (dateA !== dateB) return dateA - dateB;
    if (a.flowOrder !== b.flowOrder) return a.flowOrder - b.flowOrder;
    return String(a.lotCode || "").localeCompare(String(b.lotCode || ""));
  });
}

async function buildLotDetail(client, lot) {
  const [currentBalance, parents, children, events, movements, productionsAsInput, productionsAsOutput, laboratoryCertificates] = await Promise.all([
    getCurrentBalance(client, lot.id),
    getRelations(client, lot.id, "parents"),
    getRelations(client, lot.id, "children"),
    getEvents(client, lot.id),
    getMovements(client, lot.id),
    getProductionsAsInput(client, lot.id),
    getProductionsAsOutput(client, lot.id),
    getLaboratoryCertificates(client, lot.id)
  ]);

  const graph = await getTraceabilityGraph(client, lot.id);
  if (!graph.lotsById.has(String(lot.id))) graph.lotsById.set(String(lot.id), lot);
  const industrialTree = buildIndustrialTree({
    rootLotId: lot.id,
    lotsById: graph.lotsById,
    edges: graph.edges
  });

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

  const directTimeline = buildTimeline({
    lot,
    parents,
    children,
    events,
    movements,
    productionsAsInput,
    productionsAsOutput
  });
  const timeline = industrialTree.lotIds.length > 1
    ? await buildCompleteTimeline(client, industrialTree, graph.lotsById)
    : directTimeline;

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
    laboratoryCertificates,
    industrialTree,
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

    if (!lot) return res.status(404).json({ error: "Lote não encontrado." });

    return res.json(await buildLotDetail(client, lot));
  } catch (error) {
    console.error("Erro ao consultar lote por código:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.get("/lots/:lotId", async (req, res) => {
  const client = await pool.connect();

  try {
    const lot = await getLotBase(client, "lo.id = $1", [req.params.lotId]);

    if (!lot) return res.status(404).json({ error: "Lote não encontrado." });

    return res.json(await buildLotDetail(client, lot));
  } catch (error) {
    console.error("Erro ao consultar lote:", error);
    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

module.exports = router;
