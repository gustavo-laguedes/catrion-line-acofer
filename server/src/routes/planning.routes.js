const express = require("express");
const { pool, query } = require("../db");

const router = express.Router();

const PLAN_STATUSES = ["Rascunho", "Liberado", "Em andamento", "Concluído", "Produzido parcialmente", "Cancelado", "Replanejado"];
const MANUAL_PLAN_STATUSES = ["Rascunho", "Liberado", "Cancelado"];
const MANUAL_ITEM_STATUSES = ["Rascunho", "Liberado", "Cancelado"];
const PLAN_TYPES = ["Produção", "Replanejamento", "Simulação", "Emergencial", "Manutenção"];
const PRIORITIES = ["Baixa", "Normal", "Alta", "Crítica"];
const RESERVATION_STATUSES = ["Planejada", "Confirmada", "Cancelada"];
const MAINTENANCE_TYPES = ["Preventiva", "Corretiva", "Parada programada"];
const MAINTENANCE_STATUSES = ["Rascunho", "Programada", "Planejada", "Em andamento", "Concluída", "Cancelada"];


const INTERNAL_ERROR = { error: "Erro interno ao processar planejamento." };

function logPlanningError(operation, error, extra = {}) {
  console.error("Erro no planejamento:", {
    operation,
    message: error.message,
    code: error.code,
    constraint: error.constraint,
    detail: error.detail,
    ...extra
  });
}

function sendError(res, error, fallback = INTERNAL_ERROR.error) {
  if (error.code === "23505") {
    return res.status(409).json({
      error: "Registro duplicado para uma chave única do planejamento.",
      detail: error.detail || null,
      code: error.code,
      constraint: error.constraint || null
    });
  }

  return res.status(error.status || 500).json({
    error: error.status ? error.message : fallback,
    detail: error.status ? null : error.detail || error.message,
    code: error.code || null,
    constraint: error.constraint || null
  });
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

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

function normalizeNullableDecimal(value) {
  if (value === null || value === undefined || value === "") return null;
  return normalizeDecimal(value);
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeDate(value, label) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value || "").slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw fail(`${label} é obrigatória.`);
  }

  return text;
}

function normalizeTimestamp(value, label) {
  const text = String(value || "").trim();
  const date = new Date(text);

  if (!text || Number.isNaN(date.getTime())) {
    throw fail(`${label} é obrigatória.`);
  }

  return date.toISOString();
}

function assertDateRange(startDate, endDate) {
  if (endDate < startDate) {
    throw fail("Data final deve ser maior ou igual à data inicial.");
  }
}

function assertTimestampRange(startDate, endDate) {
  if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
    throw fail("Data final deve ser maior ou igual à data inicial.");
  }
}

function assertInList(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw fail(`${label} inválido.`);
  }
}

function assertNonNegative(value, label) {
  if (value < 0) {
    throw fail(`${label} deve ser maior ou igual a zero.`);
  }
}

const PLANNING_METRICS_CTE = `
  with production_totals as (
    select
      p.material_id,
      p.production_date,
      coalesce(sum(pol.quantity) filter (where coalesce(output_lot.status, 'Disponível') <> 'Cancelado'), 0) as produced_quantity,
      coalesce(sum(pol.secondary_quantity) filter (where coalesce(output_lot.status, 'Disponível') <> 'Cancelado'), 0) as produced_secondary_quantity
    from productions p
    join production_output_lots pol on pol.production_id = p.id
    join lots output_lot on output_lot.id = pol.lot_id
    where p.status in ('Processado', 'Reprocessado')
    group by p.id, p.material_id, p.production_date
  ),
  planning_item_metrics as (
    select
      pi.id,
      pi.plan_id,
      pi.planned_quantity,
      coalesce(sum(pt.produced_quantity), 0) as produced_quantity,
      coalesce(sum(pt.produced_secondary_quantity), 0) as produced_secondary_quantity,
      case
        when pi.planned_quantity > 0 then (coalesce(sum(pt.produced_quantity), 0) / pi.planned_quantity) * 100
        else 0
      end as progress_percent,
      case
        when pi.status = 'Cancelado' then 'Cancelado'
        when pi.status = 'Rascunho' then 'Rascunho'
        when pi.planned_quantity > 0 and coalesce(sum(pt.produced_quantity), 0) >= pi.planned_quantity then 'Concluído'
        when coalesce(sum(pt.produced_quantity), 0) > 0 and pp.period_end < current_date then 'Produzido parcialmente'
        when coalesce(sum(pt.produced_quantity), 0) > 0 then 'Em andamento'
        else pi.status
      end as status
    from planning_production_items pi
    join planning_production_plans pp on pp.id = pi.plan_id
    left join production_totals pt
      on pt.material_id = pi.material_id
      and pt.production_date >= pp.period_start
      and pt.production_date < (pp.period_end + interval '1 day')
    group by pi.id, pp.period_end
  ),
  planning_plan_metrics as (
    select
      pp.id,
      case
        when pp.status in ('Cancelado', 'Replanejado') then pp.status
        when pp.status = 'Rascunho' then 'Rascunho'
        when count(pim.id) = 0 then pp.status
        when bool_and(pim.status = 'Concluído') then 'Concluído'
        when bool_or(pim.status = 'Produzido parcialmente') then 'Produzido parcialmente'
        when bool_or(pim.produced_quantity > 0) then 'Em andamento'
        else pp.status
      end as status,
      count(pim.id)::int as items_count,
      coalesce(avg(pim.progress_percent), 0) as average_progress,
      coalesce(sum(pim.planned_quantity), 0) as planned_quantity_total,
      coalesce(sum(pim.produced_quantity), 0) as produced_quantity_total
    from planning_production_plans pp
    left join planning_item_metrics pim on pim.plan_id = pp.id
    group by pp.id
  )
`;

function generatePlanCode() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `PLAN-${stamp}`;
}

function generateReplanCode(sourceCode) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${sourceCode}-RP-${stamp}-${String(Date.now()).slice(-5)}`;
}

function normalizePlanPayload(body = {}, current = null) {
  const periodStart = normalizeDate(body.periodStart ?? body.period_start ?? current?.periodStart, "Data inicial");
  const periodEnd = normalizeDate(body.periodEnd ?? body.period_end ?? current?.periodEnd, "Data final");
  const status = normalizeText(body.status ?? current?.status) || "Rascunho";
  const planType = normalizeText(body.planType ?? body.plan_type ?? current?.planType) || "Produção";

  assertDateRange(periodStart, periodEnd);
  assertInList(status, PLAN_STATUSES, "Status");
  if (body.status !== undefined) assertInList(status, MANUAL_PLAN_STATUSES, "Status manual");
  assertInList(planType, PLAN_TYPES, "Tipo de plano");

  return {
    code: (normalizeText(body.code ?? current?.code) || generatePlanCode()).toUpperCase(),
    planType,
    periodStart,
    periodEnd,
    status,
    notes: normalizeText(body.notes ?? body.observation ?? current?.notes)
  };
}

function normalizeItemPayload(body = {}, current = null) {
  const suggestedConsumedLotId = Object.prototype.hasOwnProperty.call(body, "suggestedConsumedLotId")
    ? body.suggestedConsumedLotId
    : Object.prototype.hasOwnProperty.call(body, "suggested_consumed_lot_id")
      ? body.suggested_consumed_lot_id
      : current?.suggestedConsumedLotId ?? null;
  const plannedQuantity = normalizeDecimal(body.plannedQuantity ?? body.planned_quantity ?? current?.plannedQuantity);
  const plannedSecondaryQuantity = normalizeNullableDecimal(
    body.plannedSecondaryQuantity ?? body.planned_secondary_quantity ?? current?.plannedSecondaryQuantity
  );
  const priority = normalizeText(body.priority ?? current?.priority) || "Normal";
  const status = normalizeText(body.status ?? current?.status) || "Rascunho";

  assertNonNegative(plannedQuantity, "Quantidade planejada");
  if (plannedSecondaryQuantity !== null) assertNonNegative(plannedSecondaryQuantity, "Quantidade secundária planejada");
  assertInList(priority, PRIORITIES, "Prioridade");
  assertInList(status, PLAN_STATUSES, "Status");
  if (body.status !== undefined) assertInList(status, MANUAL_ITEM_STATUSES, "Status manual");

  const sequence = Number(body.sequence ?? current?.sequence);

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw fail("Sequência deve ser um número inteiro maior que zero.");
  }

  const materialId = body.materialId ?? body.material_id ?? current?.materialId;

  if (!materialId) {
    throw fail("Material é obrigatório.");
  }

  return {
    sequence,
    materialId,
    plannedQuantity,
    plannedSecondaryQuantity,
    locationId: body.locationId ?? body.location_id ?? current?.locationId ?? null,
    machineId: body.machineId ?? body.machine_id ?? current?.machineId ?? null,
    suggestedConsumedLotId,
    plannedOutputLotCode: normalizeText(body.plannedOutputLotCode ?? body.planned_output_lot_code ?? current?.plannedOutputLotCode),
    priority,
    status,
    notes: normalizeText(body.notes ?? body.observation ?? current?.notes),
    operatorIds: Array.isArray(body.operatorIds) ? body.operatorIds.filter(Boolean) : null,
    reservations: Array.isArray(body.reservations) ? body.reservations : null,
  };
}
function normalizeReservationPayload(reservation = {}, itemMaterialId = null, itemLocationId = null) {
  const quantity = normalizeDecimal(reservation.quantity);
  const secondaryQuantity = normalizeNullableDecimal(reservation.secondaryQuantity ?? reservation.secondary_quantity);
  const status = normalizeText(reservation.status) || "Planejada";

  assertNonNegative(quantity, "Quantidade reservada");
  if (secondaryQuantity !== null) assertNonNegative(secondaryQuantity, "Quantidade secundária reservada");
  assertInList(status, RESERVATION_STATUSES, "Status da reserva");

  return {
    materialId: reservation.materialId ?? reservation.material_id ?? itemMaterialId,
    lotId: reservation.lotId ?? reservation.lot_id ?? null,
    locationId: reservation.locationId ?? reservation.location_id ?? itemLocationId,
    quantity,
    secondaryQuantity,
    status,
    notes: normalizeText(reservation.notes)
  };
}

function normalizeMaintenancePayload(body = {}, current = null) {
  const machineId = body.machineId ?? body.machine_id ?? current?.machineId;
  const periodStart = normalizeTimestamp(body.periodStart ?? body.period_start ?? current?.periodStart, "Data inicial");
  const periodEnd = normalizeTimestamp(body.periodEnd ?? body.period_end ?? current?.periodEnd, "Data final");
  const maintenanceType = normalizeText(body.maintenanceType ?? body.maintenance_type ?? current?.maintenanceType) || "Preventiva";
  const status = normalizeText(body.status ?? current?.status) || "Rascunho";

  if (!machineId) {
    throw fail("Máquina é obrigatória.");
  }

  assertTimestampRange(periodStart, periodEnd);
  assertInList(maintenanceType, MAINTENANCE_TYPES, "Tipo de manutenção");
  assertInList(status, MAINTENANCE_STATUSES, "Status");

  return {
    machineId,
    maintenanceType,
    periodStart,
    periodEnd,
    responsible: normalizeText(body.responsible ?? current?.responsible),
    status,
    notes: normalizeText(body.notes ?? body.observation ?? current?.notes)
  };
}

async function writeHistory(client, { planId = null, itemId = null, eventType, description }) {
  await client.query(
    `
      insert into planning_history (
        plan_id,
        planning_item_id,
        event_type,
        description
      )
      values ($1, $2, $3, $4);
    `,
    [planId, itemId, eventType, description]
  );
}

async function getPlanHeader(client, planId, lock = false) {
  const result = await client.query(
    `
      select
        id,
        code,
        plan_type as "planType",
        period_start as "periodStart",
        period_end as "periodEnd",
        status,
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from planning_production_plans
      where id = $1
      ${lock ? "for update" : ""};
    `,
    [planId]
  );

  return result.rows[0] || null;
}

async function getItemHeader(client, itemId, lock = false) {
  const result = await client.query(
    `
      select
        id,
        plan_id as "planId",
        sequence,
        material_id as "materialId",
        planned_quantity as "plannedQuantity",
        planned_secondary_quantity as "plannedSecondaryQuantity",
        produced_quantity as "producedQuantity",
        produced_secondary_quantity as "producedSecondaryQuantity",
        progress_percent as "progressPercent",
        location_id as "locationId",
        machine_id as "machineId",
        suggested_consumed_lot_id as "suggestedConsumedLotId",
        planned_output_lot_code as "plannedOutputLotCode",
        priority,
        status,
        notes,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from planning_production_items
      where id = $1
      ${lock ? "for update" : ""};
    `,
    [itemId]
  );

  return result.rows[0] || null;
}

async function ensureEntityExists(client, table, id, label) {
  if (!id) return;

  const allowedTables = {
    materials: "materials",
    locations: "locations",
    machines: "machines",
    lots: "lots",
    operators: "operators",
    productions: "productions"
  };
  const tableName = allowedTables[table];

  if (!tableName) {
    throw fail("Tabela de referência inválida.");
  }

  const result = await client.query(`select id from ${tableName} where id = $1 limit 1`, [id]);

  if (!result.rows.length) {
    throw fail(`${label} não encontrado.`);
  }
}

async function assertMaintenanceAvailableForItem(client, plan, machineId, ignoredMaintenanceId = null) {
  if (!machineId) return;

  const result = await client.query(
    `
      select mm.id, mm.period_start as "periodStart", mm.period_end as "periodEnd", m.name as "machineName"
      from planning_machine_maintenance mm
      join machines m on m.id = mm.machine_id
      where mm.machine_id = $1
        and mm.status <> 'Cancelada'
        and ($4::uuid is null or mm.id <> $4::uuid)
        and mm.period_start < ($3::date + interval '1 day')
        and mm.period_end >= $2::date
      order by mm.period_start asc
      limit 1;
    `,
    [machineId, plan.periodStart, plan.periodEnd, ignoredMaintenanceId]
  );

  if (result.rows.length) {
    throw fail("Máquina está em manutenção no período do planejamento.", 409);
  }
}

async function assertMaintenanceDoesNotOverlap(client, payload, ignoredId = null) {
  const result = await client.query(
    `
      select id
      from planning_machine_maintenance
      where machine_id = $1
        and status <> 'Cancelada'
        and ($4::uuid is null or id <> $4::uuid)
        and period_start < $3::timestamptz
        and period_end > $2::timestamptz
      limit 1;
    `,
    [payload.machineId, payload.periodStart, payload.periodEnd, ignoredId]
  );

  if (result.rows.length) {
    throw fail("Já existe manutenção planejada para esta máquina no período informado.", 409);
  }
}

async function assertNoPlannedItemUsesMaintenanceWindow(client, payload) {
  if (payload.status === "Cancelada") return;

  const result = await client.query(
    `
      select pi.id
      from planning_production_items pi
      join planning_production_plans pp on pp.id = pi.plan_id
      where pi.machine_id = $1
        and pi.status not in ('Cancelado', 'Concluído')
        and pp.status <> 'Cancelado'
        and $2::timestamptz < (pp.period_end + interval '1 day')
        and $3::timestamptz >= pp.period_start
      limit 1;
    `,
    [payload.machineId, payload.periodStart, payload.periodEnd]
  );

  if (result.rows.length) {
    throw fail("Existe item planejado usando esta máquina no período da manutenção.", 409);
  }
}

async function replaceItemOperators(client, itemId, operatorIds) {
  if (!operatorIds) return;

  await client.query("delete from planning_production_item_operators where planning_item_id = $1", [itemId]);

  for (const operatorId of [...new Set(operatorIds)]) {
    await ensureEntityExists(client, "operators", operatorId, "Operador");
    await client.query(
      `
        insert into planning_production_item_operators (planning_item_id, operator_id)
        values ($1, $2)
        on conflict do nothing;
      `,
      [itemId, operatorId]
    );
  }
}

async function getSuggestedLotForReservation(client, lotId) {
  if (!lotId) return null;

  const result = await client.query(
    `
      select
        lo.id as "lotId",
        lo.material_id as "materialId",
        coalesce(lo.current_location_id, sb.location_id) as "locationId",
        coalesce(sb.quantity, 0) as quantity
      from lots lo
      left join stock_balances sb on sb.lot_id = lo.id and sb.quantity > 0
      where lo.id = $1
      order by sb.quantity desc nulls last, sb.updated_at desc nulls last
      limit 1;
    `,
    [lotId]
  );

  return result.rows[0] || null;
}

async function replaceAutomaticItemReservation(client, itemId, item, { planId = null, planStatus = null, writeEvent = false, skipInvalid = false } = {}) {
  const deleted = await client.query("delete from planning_stock_reservations where planning_item_id = $1", [itemId]);

  if (
    !item.suggestedConsumedLotId ||
    item.status === "Cancelado" ||
    planStatus === "Cancelado" ||
    planStatus === "Concluído"
  ) {
    if (writeEvent && deleted.rowCount > 0) {
      await writeHistory(client, {
        planId,
        itemId,
        eventType: "RESERVATION_UPDATED",
        description: `Reserva visual removida do item planejado ${item.sequence}.`
      });
    }
    return;
  }

  const lot = await getSuggestedLotForReservation(client, item.suggestedConsumedLotId);
  if (!lot?.materialId || !lot?.locationId) {
    if (skipInvalid) return false;
    throw fail("Lote sugerido sem saldo/local disponível para reserva visual.");
  }

  const otherReservations = await client.query(
    `
      select coalesce(sum(quantity), 0) as quantity
      from planning_stock_reservations
      where lot_id = $1
        and location_id = $2
        and status in ('Planejada', 'Confirmada');
    `,
    [lot.lotId, lot.locationId]
  );
  const availableForItem = normalizeDecimal(lot.quantity) - normalizeDecimal(otherReservations.rows[0]?.quantity);

  if (normalizeDecimal(item.plannedQuantity) > availableForItem) {
    if (skipInvalid) return false;
    throw fail("A quantidade planejada ultrapassa o saldo estimado do lote considerando as outras reservas.");
  }

  await client.query(
    `
      insert into planning_stock_reservations (
        planning_item_id,
        material_id,
        lot_id,
        location_id,
        quantity,
        secondary_quantity,
        status,
        notes
      )
      values ($1, $2, $3, $4, $5, null, 'Planejada', 'Reserva visual automática do Planejamento.');
    `,
    [itemId, lot.materialId, lot.lotId, lot.locationId, item.plannedQuantity]
  );

  if (writeEvent) {
    await writeHistory(client, {
      planId,
      itemId,
      eventType: "RESERVATION_UPDATED",
      description: `Reserva visual atualizada para o item planejado ${item.sequence}.`
    });
  }

  return true;
}

async function removePlanReservations(client, planId) {
  await client.query(
    `
      delete from planning_stock_reservations psr
      using planning_production_items pi
      where psr.planning_item_id = pi.id
        and pi.plan_id = $1;
    `,
    [planId]
  );
}

async function getPlanById(client, planId) {
  const plan = await getPlanHeader(client, planId);

  if (!plan) return null;

  const items = await client.query(
    `${PLANNING_METRICS_CTE}
      select
        pi.id,
        pi.plan_id as "planId",
        pi.sequence,
        pi.material_id as "materialId",
        mat.code as "materialCode",
        mat.name as "materialName",
        coalesce(mat.primary_unit, mat.unit) as "unit",
        mat.secondary_unit as "secondaryUnit",
        pi.planned_quantity as "plannedQuantity",
        pi.planned_secondary_quantity as "plannedSecondaryQuantity",
        pim.produced_quantity as "producedQuantity",
        pim.produced_secondary_quantity as "producedSecondaryQuantity",
        pim.progress_percent as "progressPercent",
        greatest(pim.produced_quantity - pi.planned_quantity, 0) as "excessQuantity",
        pi.location_id as "locationId",
        loc.name as "locationName",
        pi.machine_id as "machineId",
        mach.name as "machineName",
        pi.suggested_consumed_lot_id as "suggestedConsumedLotId",
        lot.lot_code as "suggestedConsumedLotCode",
        pi.planned_output_lot_code as "plannedOutputLotCode",
        pi.priority,
        pim.status,
        pi.status as "storedStatus",
        pi.notes,
        pi.created_at as "createdAt",
        pi.updated_at as "updatedAt"
      from planning_production_items pi
      join planning_item_metrics pim on pim.id = pi.id
      join materials mat on mat.id = pi.material_id
      left join locations loc on loc.id = pi.location_id
      left join machines mach on mach.id = pi.machine_id
      left join lots lot on lot.id = pi.suggested_consumed_lot_id
      where pi.plan_id = $1
      order by pi.sequence asc, pi.created_at asc;
    `,
    [planId]
  );

  const itemIds = items.rows.map((item) => item.id);
  const operators = itemIds.length
    ? await client.query(
      `
        select
          pio.planning_item_id as "itemId",
          op.id,
          op.code,
          op.name
        from planning_production_item_operators pio
        join operators op on op.id = pio.operator_id
        where pio.planning_item_id = any($1::uuid[])
        order by op.name asc;
      `,
      [itemIds]
    )
    : { rows: [] };

  const reservations = itemIds.length
    ? await client.query(
      `
        select
          psr.id,
          psr.planning_item_id as "itemId",
          psr.material_id as "materialId",
          mat.code as "materialCode",
          mat.name as "materialName",
          psr.lot_id as "lotId",
          lot.lot_code as "lotCode",
          psr.location_id as "locationId",
          loc.name as "locationName",
          psr.quantity,
          psr.secondary_quantity as "secondaryQuantity",
          psr.status,
          psr.notes,
          psr.created_at as "createdAt",
          psr.updated_at as "updatedAt"
        from planning_stock_reservations psr
        join materials mat on mat.id = psr.material_id
        left join lots lot on lot.id = psr.lot_id
        left join locations loc on loc.id = psr.location_id
        where psr.planning_item_id = any($1::uuid[])
        order by mat.name asc, lot.lot_code asc nulls last;
      `,
      [itemIds]
    )
    : { rows: [] };

  const productionEvents = itemIds.length
    ? await client.query(
      `
        select
          pi.id as "itemId",
          p.id as "productionId",
          pol.id as "outputLotId",
          p.production_date as "productionDate",
          p.created_at as "createdAt",
          pol.quantity as "producedQuantity",
          coalesce(consumed.lot_codes, '-') as "consumedLotCodes",
          case
            when pi.suggested_consumed_lot_id is null then null
            when pi.suggested_consumed_lot_id = any(coalesce(consumed.lot_ids, array[]::uuid[])) then 'Lote planejado'
            else 'Lote divergente'
          end as "lotComparisonStatus"
        from planning_production_items pi
        join planning_production_plans pp on pp.id = pi.plan_id
        join productions p
          on p.material_id = pi.material_id
          and p.production_date >= pp.period_start
          and p.production_date < (pp.period_end + interval '1 day')
          and p.status in ('Processado', 'Reprocessado')
        join production_output_lots pol on pol.production_id = p.id
        join lots output_lot on output_lot.id = pol.lot_id
          and coalesce(output_lot.status, 'Disponível') <> 'Cancelado'
        left join lateral (
          select
            array_agg(distinct pcl.lot_id) as lot_ids,
            string_agg(distinct consumed_lot.lot_code, ', ' order by consumed_lot.lot_code) as lot_codes
          from production_consumed_lots pcl
          join lots consumed_lot on consumed_lot.id = pcl.lot_id
          where pcl.production_id = p.id
        ) consumed on true
        where pi.id = any($1::uuid[])
        order by p.created_at desc;
      `,
      [itemIds]
    )
    : { rows: [] };

  const history = await client.query(
    `
      select
        id,
        plan_id as "planId",
        planning_item_id as "itemId",
        event_type as "eventType",
        description,
        created_at as "createdAt"
      from planning_history
      where plan_id = $1
      order by created_at desc;
    `,
    [planId]
  );

  const operatorsByItem = groupBy(operators.rows, "itemId");
  const reservationsByItem = groupBy(reservations.rows, "itemId");
  const productionEventsByItem = groupBy(productionEvents.rows, "itemId");
  const metricPlan = await client.query(
    `${PLANNING_METRICS_CTE}
      select status
      from planning_plan_metrics
      where id = $1;`,
    [planId]
  );

  return {
    ...plan,
    storedStatus: plan.status,
    status: metricPlan.rows[0]?.status || plan.status,
    periodStart: toDateOnly(plan.periodStart),
    periodEnd: toDateOnly(plan.periodEnd),
    items: items.rows.map((item) => ({
      ...item,
      operators: operatorsByItem.get(item.id) || [],
      reservations: reservationsByItem.get(item.id) || [],
      productionEvents: productionEventsByItem.get(item.id) || []
    })),
    history: history.rows
  };
}

function groupBy(rows, key) {
  return rows.reduce((groups, row) => {
    const groupKey = row[key];
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(row);
    return groups;
  }, new Map());
}

router.get("/references", async (_req, res) => {
  try {
    const [materials, machines, operators, locations, lots, productionModels] = await Promise.all([
      query(`
        select
          id,
          code,
          name,
          coalesce(primary_unit, unit) as unit,
          secondary_unit as "secondaryUnit",
          can_be_produced as "canBeProduced",
          producible,
          status
        from materials
        where status = 'Ativo'
        order by name asc;
      `),
      query(`
        select id, code, name, lot_code as "lotCode", resource_type as "resourceType", status
        from machines
        where status = 'Ativo'
        order by name asc;
      `),
      query(`
        select id, code, name, role, status
        from operators
        where status = 'Ativo'
        order by name asc;
      `),
      query(`
        select id, code, name, type, production, storage, status
        from locations
        where status in ('Ativo', 'active')
        order by name asc;
      `),
      query(`
        select
          sb.lot_id as "lotId",
          lo.lot_code as "lotCode",
          sb.material_id as "materialId",
          mat.code as "materialCode",
          mat.name as "materialName",
          sb.location_id as "locationId",
          loc.name as "locationName",
          sb.quantity,
          sb.secondary_quantity as "secondaryQuantity",
          coalesce(res.reserved_quantity, 0) as "visualReservedQuantity",
          coalesce(res.reserved_secondary_quantity, 0) as "visualReservedSecondaryQuantity",
          sb.quantity - coalesce(res.reserved_quantity, 0) as "visualAvailableQuantity",
          sb.unit,
          sb.secondary_unit as "secondaryUnit",
          lo.status as "lotStatus",
          sb.status as "balanceStatus"
        from stock_balances sb
        join lots lo on lo.id = sb.lot_id
        join materials mat on mat.id = sb.material_id
        join locations loc on loc.id = sb.location_id
        left join (
          select
            lot_id,
            location_id,
            sum(quantity) as reserved_quantity,
            sum(coalesce(secondary_quantity, 0)) as reserved_secondary_quantity
          from planning_stock_reservations
          where status in ('Planejada', 'Confirmada')
          group by lot_id, location_id
        ) res on res.lot_id = sb.lot_id and res.location_id = sb.location_id
        where sb.quantity > 0
          and mat.status = 'Ativo'
          and coalesce(lo.status, 'Disponível') in ('Disponível', 'Disponivel', 'Ativo')
          and coalesce(sb.status, 'Disponível') in ('Disponível', 'Disponivel', 'Ativo')
        order by mat.name asc, loc.name asc, lo.lot_code asc;
      `),
      query(`
        select
          pm.id as "modelId",
          pm.material_id as "materialId",
          pm.name as "modelName",
          pm.output_quantity as "outputQuantity",
          pm.output_unit as "outputUnit",
          pm.status as "modelStatus",
          mpi.id as "inputId",
          mpi.input_material_id as "inputMaterialId",
          input_mat.code as "inputMaterialCode",
          input_mat.name as "inputMaterialName",
          coalesce(input_mat.primary_unit, input_mat.unit, mpi.unit) as "inputUnit",
          mpi.quantity as "inputQuantity",
          mpi.unit as "modelInputUnit",
          mpi.consumption_mode as "consumptionMode"
        from material_production_models pm
        left join material_production_model_inputs mpi on mpi.production_model_id = pm.id
        left join materials input_mat on input_mat.id = mpi.input_material_id
        where coalesce(pm.status, 'Ativo') <> 'Inativo'
        order by pm.name asc, input_mat.name asc;
      `)
    ]);

    return res.json({
      materials: materials.rows,
      machines: machines.rows,
      operators: operators.rows,
      locations: locations.rows,
      lots: lots.rows,
      productionModels: productionModels.rows
    });
  } catch (error) {
    logPlanningError("references", error);
    return sendError(res, error);
  }
});

router.get("/production-plans", async (req, res) => {
  try {
    const values = [];
    const filters = [];

    if (req.query.status) {
      values.push(String(req.query.status));
      filters.push(`ppm.status = $${values.length}`);
    }

    if (req.query.periodStart) {
      values.push(normalizeDate(req.query.periodStart, "Data inicial"));
      filters.push(`pp.period_end >= $${values.length}::date`);
    }

    if (req.query.periodEnd) {
      values.push(normalizeDate(req.query.periodEnd, "Data final"));
      filters.push(`pp.period_start <= $${values.length}::date`);
    }

    const result = await query(
      `${PLANNING_METRICS_CTE}
        select
          pp.id,
          pp.code,
          pp.plan_type as "planType",
          pp.period_start as "periodStart",
          pp.period_end as "periodEnd",
          ppm.status,
          pp.notes,
          pp.created_at as "createdAt",
          pp.updated_at as "updatedAt",
          ppm.items_count as "itemsCount",
          ppm.average_progress as "averageProgress",
          ppm.planned_quantity_total as "plannedQuantityTotal",
          ppm.produced_quantity_total as "producedQuantityTotal"
        from planning_production_plans pp
        join planning_plan_metrics ppm on ppm.id = pp.id
        ${filters.length ? `where ${filters.join(" and ")}` : ""}
        order by pp.period_start desc, pp.created_at desc;
      `,
      values
    );

    return res.json(result.rows.map((plan) => ({
      ...plan,
      periodStart: toDateOnly(plan.periodStart),
      periodEnd: toDateOnly(plan.periodEnd)
    })));
  } catch (error) {
    logPlanningError("listProductionPlans", error);
    return sendError(res, error);
  }
});
router.get("/production-plans/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    const plan = await getPlanById(client, req.params.id);

    if (!plan) {
      return res.status(404).json({ error: "Planejamento não encontrado." });
    }

    return res.json(plan);
  } catch (error) {
    logPlanningError("getProductionPlan", error, { planId: req.params.id });
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.post("/production-plans", async (req, res) => {
  const client = await pool.connect();

  try {
    const payload = normalizePlanPayload(req.body || {});

    await client.query("begin");

    const result = await client.query(
      `
        insert into planning_production_plans (
          code,
          plan_type,
          period_start,
          period_end,
          status,
          notes
        )
        values ($1, $2, $3::date, $4::date, $5, $6)
        returning id;
      `,
      [payload.code, payload.planType, payload.periodStart, payload.periodEnd, payload.status, payload.notes]
    );

    const planId = result.rows[0].id;
    await writeHistory(client, {
      planId,
      eventType: "PLAN_CREATED",
      description: `Planejamento ${payload.code} criado.`
    });

    const plan = await getPlanById(client, planId);
    await client.query("commit");

    return res.status(201).json(plan);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("createProductionPlan", error);
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.put("/production-plans/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const current = await getPlanHeader(client, req.params.id, true);
    if (!current) {
      await client.query("rollback");
      return res.status(404).json({ error: "Planejamento não encontrado." });
    }

    const payload = normalizePlanPayload(req.body || {}, current);

    const maintenanceConflict = await client.query(
      `
        select pi.id
        from planning_production_items pi
        join planning_machine_maintenance mm on mm.machine_id = pi.machine_id
        where pi.plan_id = $1
          and pi.machine_id is not null
          and mm.status <> 'Cancelada'
          and mm.period_start < ($3::date + interval '1 day')
          and mm.period_end >= $2::date
        limit 1;
      `,
      [req.params.id, payload.periodStart, payload.periodEnd]
    );

    if (maintenanceConflict.rows.length) {
      throw fail("Novo período conflita com manutenção de máquina usada em item planejado.", 409);
    }

    await client.query(
      `
        update planning_production_plans
        set
          code = $1,
          plan_type = $2,
          period_start = $3::date,
          period_end = $4::date,
          status = $5,
          notes = $6
        where id = $7;
      `,
      [payload.code, payload.planType, payload.periodStart, payload.periodEnd, payload.status, payload.notes, req.params.id]
    );

    await writeHistory(client, {
      planId: req.params.id,
      eventType: "PLAN_UPDATED",
      description: `Planejamento ${payload.code} atualizado.`
    });

    const plan = await getPlanById(client, req.params.id);
    await client.query("commit");

    return res.json(plan);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("updateProductionPlan", error, { planId: req.params.id });
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.post("/production-plans/:id/status", async (req, res) => {
  const client = await pool.connect();

  try {
    const status = normalizeText(req.body?.status);
    assertInList(status, MANUAL_PLAN_STATUSES, "Status manual");

    await client.query("begin");

    const current = await getPlanHeader(client, req.params.id, true);
    if (!current) {
      await client.query("rollback");
      return res.status(404).json({ error: "Planejamento não encontrado." });
    }

    await client.query("update planning_production_plans set status = $1 where id = $2", [status, req.params.id]);
    if (status === "Cancelado" || status === "Concluído") {
      await removePlanReservations(client, req.params.id);
      await writeHistory(client, {
        planId: req.params.id,
        eventType: "RESERVATION_UPDATED",
        description: `Reservas visuais removidas porque o planejamento foi ${status}.`
      });
    }
    await writeHistory(client, {
      planId: req.params.id,
      eventType: "PLAN_STATUS_CHANGED",
      description: `Status alterado de ${current.status} para ${status}.`
    });

    const plan = await getPlanById(client, req.params.id);
    await client.query("commit");

    return res.json(plan);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("changeProductionPlanStatus", error, { planId: req.params.id });
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.post("/production-plans/:id/replan", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const sourcePlan = await getPlanHeader(client, req.params.id, true);
    if (!sourcePlan) {
      await client.query("rollback");
      return res.status(404).json({ error: "Planejamento não encontrado." });
    }

    const operationalPlan = await getPlanById(client, sourcePlan.id);
    if (!["Cancelado", "Produzido parcialmente"].includes(operationalPlan.status)) {
      throw fail("Somente planejamentos cancelados ou produzidos parcialmente podem ser replanejados.", 409);
    }

    const sourceItems = await client.query(
      `
        select
          pi.id,
          pi.sequence,
          pi.material_id as "materialId",
          pi.planned_quantity as "plannedQuantity",
          pi.planned_secondary_quantity as "plannedSecondaryQuantity",
          pi.location_id as "locationId",
          pi.machine_id as "machineId",
          pi.suggested_consumed_lot_id as "suggestedConsumedLotId",
          pi.planned_output_lot_code as "plannedOutputLotCode",
          pi.priority,
          pi.notes,
          coalesce(array_agg(pio.operator_id) filter (where pio.operator_id is not null), array[]::uuid[]) as "operatorIds"
        from planning_production_items pi
        left join planning_production_item_operators pio on pio.planning_item_id = pi.id
        where pi.plan_id = $1
        group by pi.id
        order by pi.sequence asc, pi.created_at asc;
      `,
      [sourcePlan.id]
    );

    const notes = [
      `Replanejado a partir de ${sourcePlan.code}.`,
      sourcePlan.notes
    ].filter(Boolean).join("\n");
    const newPlanResult = await client.query(
      `
        insert into planning_production_plans (
          code,
          plan_type,
          period_start,
          period_end,
          status,
          notes
        )
        values ($1, 'Replanejamento', $2::date, $3::date, 'Rascunho', $4)
        returning id;
      `,
      [generateReplanCode(sourcePlan.code), sourcePlan.periodStart, sourcePlan.periodEnd, notes]
    );
    const newPlanId = newPlanResult.rows[0].id;

    await writeHistory(client, {
      planId: newPlanId,
      eventType: "PLAN_CREATED",
      description: `Planejamento criado a partir de ${sourcePlan.code}.`
    });

    for (const sourceItem of sourceItems.rows) {
      const itemResult = await client.query(
        `
          insert into planning_production_items (
            plan_id,
            sequence,
            material_id,
            planned_quantity,
            planned_secondary_quantity,
            produced_quantity,
            produced_secondary_quantity,
            progress_percent,
            location_id,
            machine_id,
            suggested_consumed_lot_id,
            planned_output_lot_code,
            priority,
            status,
            notes
          )
          values ($1, $2, $3, $4, $5, 0, 0, 0, $6, $7, $8, $9, $10, 'Rascunho', $11)
          returning id;
        `,
        [
          newPlanId,
          sourceItem.sequence,
          sourceItem.materialId,
          sourceItem.plannedQuantity,
          sourceItem.plannedSecondaryQuantity,
          sourceItem.locationId,
          sourceItem.machineId,
          sourceItem.suggestedConsumedLotId,
          sourceItem.plannedOutputLotCode,
          sourceItem.priority,
          sourceItem.notes
        ]
      );
      const newItemId = itemResult.rows[0].id;

      await replaceItemOperators(client, newItemId, sourceItem.operatorIds);
      const reservationCreated = await replaceAutomaticItemReservation(client, newItemId, {
        ...sourceItem,
        status: "Rascunho"
      }, {
        planId: newPlanId,
        planStatus: "Rascunho",
        writeEvent: true,
        skipInvalid: true
      });

      await writeHistory(client, {
        planId: newPlanId,
        itemId: newItemId,
        eventType: "ITEM_CREATED",
        description: `Item planejado ${sourceItem.sequence} copiado de ${sourcePlan.code}.`
      });

      if (sourceItem.suggestedConsumedLotId && !reservationCreated) {
        await writeHistory(client, {
          planId: newPlanId,
          itemId: newItemId,
          eventType: "RESERVATION_UPDATED",
          description: `Reserva visual não recriada para o item ${sourceItem.sequence}: lote sugerido sem disponibilidade válida.`
        });
      }
    }

    const replanned = await getPlanById(client, newPlanId);
    await client.query("commit");

    return res.status(201).json(replanned);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("replanProductionPlan", error, { planId: req.params.id });
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.post("/production-plans/:id/items", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const plan = await getPlanHeader(client, req.params.id, true);
    if (!plan) {
      await client.query("rollback");
      return res.status(404).json({ error: "Planejamento não encontrado." });
    }

    const payload = normalizeItemPayload(req.body || {});
    await ensureEntityExists(client, "materials", payload.materialId, "Material");
    await ensureEntityExists(client, "locations", payload.locationId, "Local");
    await ensureEntityExists(client, "machines", payload.machineId, "Máquina");
    await ensureEntityExists(client, "lots", payload.suggestedConsumedLotId, "Lote sugerido");
    await assertMaintenanceAvailableForItem(client, plan, payload.machineId);

    const result = await client.query(
      `
        insert into planning_production_items (
          plan_id,
          sequence,
          material_id,
          planned_quantity,
          planned_secondary_quantity,
          produced_quantity,
          produced_secondary_quantity,
          progress_percent,
          location_id,
          machine_id,
          suggested_consumed_lot_id,
          planned_output_lot_code,
          priority,
          status,
          notes
        )
        values ($1, $2, $3, $4, $5, 0, 0, 0, $6, $7, $8, $9, $10, $11, $12)
        returning id;
      `,
      [
        plan.id,
        payload.sequence,
        payload.materialId,
        payload.plannedQuantity,
        payload.plannedSecondaryQuantity,
        payload.locationId,
        payload.machineId,
        payload.suggestedConsumedLotId,
        payload.plannedOutputLotCode,
        payload.priority,
        payload.status,
        payload.notes
      ]
    );

    const itemId = result.rows[0].id;
    await replaceItemOperators(client, itemId, payload.operatorIds || []);
    await replaceAutomaticItemReservation(client, itemId, payload, { planId: plan.id, planStatus: plan.status, writeEvent: true });
    await writeHistory(client, {
      planId: plan.id,
      itemId,
      eventType: "ITEM_CREATED",
      description: `Item planejado ${payload.sequence} criado.`
    });

    const updatedPlan = await getPlanById(client, plan.id);
    await client.query("commit");

    return res.status(201).json(updatedPlan);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("createProductionPlanItem", error, { planId: req.params.id });
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.put("/production-plans/:id/items/:itemId", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const plan = await getPlanHeader(client, req.params.id, true);
    if (!plan) {
      await client.query("rollback");
      return res.status(404).json({ error: "Planejamento não encontrado." });
    }

    const current = await getItemHeader(client, req.params.itemId, true);
    if (!current || current.planId !== plan.id) {
      await client.query("rollback");
      return res.status(404).json({ error: "Item planejado não encontrado." });
    }

    const payload = normalizeItemPayload(req.body || {}, current);
    await ensureEntityExists(client, "materials", payload.materialId, "Material");
    await ensureEntityExists(client, "locations", payload.locationId, "Local");
    await ensureEntityExists(client, "machines", payload.machineId, "Máquina");
    await ensureEntityExists(client, "lots", payload.suggestedConsumedLotId, "Lote sugerido");
    await assertMaintenanceAvailableForItem(client, plan, payload.machineId);

    await client.query(
      `
        update planning_production_items
        set
          sequence = $1,
          material_id = $2,
          planned_quantity = $3,
          planned_secondary_quantity = $4,
          location_id = $5,
          machine_id = $6,
          suggested_consumed_lot_id = $7,
          planned_output_lot_code = $8,
          priority = $9,
          status = $10,
          notes = $11
        where id = $12;
      `,
      [
        payload.sequence,
        payload.materialId,
        payload.plannedQuantity,
        payload.plannedSecondaryQuantity,
        payload.locationId,
        payload.machineId,
        payload.suggestedConsumedLotId,
        payload.plannedOutputLotCode,
        payload.priority,
        payload.status,
        payload.notes,
        req.params.itemId
      ]
    );

    await replaceItemOperators(client, req.params.itemId, payload.operatorIds);
    await replaceAutomaticItemReservation(client, req.params.itemId, payload, { planId: plan.id, planStatus: plan.status, writeEvent: true });
    await writeHistory(client, {
      planId: plan.id,
      itemId: req.params.itemId,
      eventType: "ITEM_UPDATED",
      description: `Item planejado ${payload.sequence} atualizado.`
    });

    const updatedPlan = await getPlanById(client, plan.id);
    await client.query("commit");

    return res.json(updatedPlan);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("updateProductionPlanItem", error, { planId: req.params.id, itemId: req.params.itemId });
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.get("/maintenance", async (req, res) => {
  try {
    const values = [];
    const filters = [];

    if (req.query.machineId) {
      values.push(String(req.query.machineId));
      filters.push(`mm.machine_id = $${values.length}`);
    }

    if (req.query.status) {
      values.push(String(req.query.status));
      filters.push(`(mm.status = $${values.length} or ($${values.length} = 'Programada' and mm.status = 'Planejada'))`);
    }

    if (req.query.periodStart) {
      values.push(normalizeTimestamp(req.query.periodStart, "Data inicial"));
      filters.push(`mm.period_end >= $${values.length}::timestamptz`);
    }

    if (req.query.periodEnd) {
      values.push(normalizeTimestamp(req.query.periodEnd, "Data final"));
      filters.push(`mm.period_start <= $${values.length}::timestamptz`);
    }

    const result = await query(
      `
        select
          mm.id,
          mm.machine_id as "machineId",
          m.code as "machineCode",
          m.name as "machineName",
          mm.maintenance_type as "maintenanceType",
          mm.period_start as "periodStart",
          mm.period_end as "periodEnd",
          mm.responsible,
          mm.status,
          mm.notes,
          mm.created_at as "createdAt",
          mm.updated_at as "updatedAt"
        from planning_machine_maintenance mm
        join machines m on m.id = mm.machine_id
        ${filters.length ? `where ${filters.join(" and ")}` : ""}
        order by mm.period_start desc;
      `,
      values
    );

    return res.json(result.rows);
  } catch (error) {
    logPlanningError("listMaintenance", error);
    return sendError(res, error);
  }
});

router.post("/maintenance", async (req, res) => {
  const client = await pool.connect();

  try {
    const payload = normalizeMaintenancePayload(req.body || {});

    await client.query("begin");
    await ensureEntityExists(client, "machines", payload.machineId, "Máquina");
    if (payload.status !== "Cancelada") {
      await assertMaintenanceDoesNotOverlap(client, payload);
    }
    await assertNoPlannedItemUsesMaintenanceWindow(client, payload);

    const result = await client.query(
      `
        insert into planning_machine_maintenance (
          machine_id,
          maintenance_type,
          period_start,
          period_end,
          responsible,
          status,
          notes
        )
        values ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7)
        returning
          id,
          machine_id as "machineId",
          maintenance_type as "maintenanceType",
          period_start as "periodStart",
          period_end as "periodEnd",
          responsible,
          status,
          notes,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [
        payload.machineId,
        payload.maintenanceType,
        payload.periodStart,
        payload.periodEnd,
        payload.responsible,
        payload.status,
        payload.notes
      ]
    );

    await writeHistory(client, {
      eventType: "MAINTENANCE_CREATED",
      description: `Manutenção ${payload.maintenanceType} criada para máquina ${payload.machineId}.`
    });

    await client.query("commit");
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("createMaintenance", error);
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.put("/maintenance/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const currentResult = await client.query(
      `
        select
          id,
          machine_id as "machineId",
          maintenance_type as "maintenanceType",
          period_start as "periodStart",
          period_end as "periodEnd",
          responsible,
          status,
          notes
        from planning_machine_maintenance
        where id = $1
        for update;
      `,
      [req.params.id]
    );

    if (!currentResult.rows.length) {
      await client.query("rollback");
      return res.status(404).json({ error: "Manutenção não encontrada." });
    }

    const payload = normalizeMaintenancePayload(req.body || {}, currentResult.rows[0]);
    await ensureEntityExists(client, "machines", payload.machineId, "Máquina");
    if (payload.status !== "Cancelada") {
      await assertMaintenanceDoesNotOverlap(client, payload, req.params.id);
    }
    await assertNoPlannedItemUsesMaintenanceWindow(client, payload);

    const result = await client.query(
      `
        update planning_machine_maintenance
        set
          machine_id = $1,
          maintenance_type = $2,
          period_start = $3::timestamptz,
          period_end = $4::timestamptz,
          responsible = $5,
          status = $6,
          notes = $7
        where id = $8
        returning
          id,
          machine_id as "machineId",
          maintenance_type as "maintenanceType",
          period_start as "periodStart",
          period_end as "periodEnd",
          responsible,
          status,
          notes,
          created_at as "createdAt",
          updated_at as "updatedAt";
      `,
      [
        payload.machineId,
        payload.maintenanceType,
        payload.periodStart,
        payload.periodEnd,
        payload.responsible,
        payload.status,
        payload.notes,
        req.params.id
      ]
    );

    await writeHistory(client, {
      eventType: "MAINTENANCE_UPDATED",
      description: `Manutenção ${req.params.id} atualizada.`
    });

    await client.query("commit");
    return res.json(result.rows[0]);
  } catch (error) {
    await client.query("rollback");
    logPlanningError("updateMaintenance", error, { maintenanceId: req.params.id });
    return sendError(res, error);
  } finally {
    client.release();
  }
});

router.get("/summary", async (_req, res) => {
  try {
    const [planningMetrics, machinesInMaintenance] = await Promise.all([
      query(`${PLANNING_METRICS_CTE}
        select
          (
            select coalesce(json_agg(status_count order by status), '[]'::json)
            from (
              select status, count(*)::int as count
              from planning_plan_metrics
              group by status
            ) status_count
          ) as "plansByStatus",
          (select count(*)::int from planning_item_metrics where status = 'Em andamento') as "itemsInProgress",
          coalesce(avg(progress_percent), 0) as "averageProgress",
          coalesce(sum(planned_quantity), 0) as "plannedQuantityTotal",
          coalesce(sum(produced_quantity), 0) as "producedQuantityTotal"
        from planning_item_metrics;
      `),
      query(`
        select count(distinct machine_id)::int as count
        from planning_machine_maintenance
        where status in ('Programada', 'Planejada', 'Em andamento')
          and period_start <= now()
          and period_end >= now();
      `)
    ]);
    const metrics = planningMetrics.rows[0] || {};

    return res.json({
      plansByStatus: metrics.plansByStatus || [],
      itemsInProgress: metrics.itemsInProgress || 0,
      machinesInMaintenance: machinesInMaintenance.rows[0]?.count || 0,
      averageProgress: Number(metrics.averageProgress || 0),
      plannedQuantityTotal: Number(metrics.plannedQuantityTotal || 0),
      producedQuantityTotal: Number(metrics.producedQuantityTotal || 0)
    });
  } catch (error) {
    logPlanningError("summary", error);
    return sendError(res, error);
  }
});

module.exports = router;





