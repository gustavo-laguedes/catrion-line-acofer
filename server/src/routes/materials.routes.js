const express = require("express");
const { pool, query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao processar materiais." };

function normalizeDecimal(value) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = String(value).trim().replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function normalizePayload(body) {
  return {
    code: String(body.code || "").trim().toUpperCase(),
    name: String(body.name || "").trim(),
    materialTypeId: body.materialTypeId || null,
    type: normalizeText(body.type),
    lotCode: normalizeText(body.lotCode)?.toUpperCase() || null,
    unit: normalizeText(body.unit || body.primaryUnit) || "un",
    secondaryUnit: normalizeText(body.secondaryUnit),
    secondaryUnitMode: normalizeText(body.secondaryUnitMode) || "manual",
    fixedPrimaryQuantity: normalizeDecimal(body.fixedPrimaryQuantity),
    fixedSecondaryQuantity: normalizeDecimal(body.fixedSecondaryQuantity),
    controlsMinimumStock: Boolean(body.controlsMinimumStock ?? body.controlsMinStock),
    minimumStockQuantity: normalizeDecimal(body.minimumStockQuantity ?? body.minStock),
    purchasable: Boolean(body.purchasable ?? body.canBePurchased),
    producible: Boolean(body.producible ?? body.canBeProduced),
    traceable: body.traceable === undefined ? true : Boolean(body.traceable),
    notes: normalizeText(body.notes),
    status: normalizeText(body.status) || "Ativo",
    allowedLocationIds: Array.isArray(body.allowedLocationIds) ? body.allowedLocationIds : [],
    allowedLocations: Array.isArray(body.allowedLocations) ? body.allowedLocations : [],
    productionMachineIds: Array.isArray(body.productionMachineIds) ? body.productionMachineIds : [],
    productionMachines: Array.isArray(body.productionMachines) ? body.productionMachines : [],
    recommendedOperatorIds: Array.isArray(body.recommendedOperatorIds) ? body.recommendedOperatorIds : [],
    productionModels: Array.isArray(body.productionModels) ? body.productionModels : []
  };
}

function validatePayload(payload, res) {
  if (!payload.code) {
    res.status(400).json({ error: "Código é obrigatório." });
    return false;
  }

  if (!payload.name) {
    res.status(400).json({ error: "Nome é obrigatório." });
    return false;
  }

    if (!payload.materialTypeId && !payload.type) {
    res.status(400).json({ error: "Tipo de material é obrigatório." });
    return false;
  }

  if (payload.controlsMinimumStock && payload.minimumStockQuantity === null) {
    res.status(400).json({ error: "Estoque mínimo é obrigatório quando o controle estiver ativo." });
    return false;
  }

  if (payload.secondaryUnitMode === "fixed" && (
    payload.fixedPrimaryQuantity === null || payload.fixedSecondaryQuantity === null
  )) {
    res.status(400).json({ error: "Conversão fixa exige as duas quantidades." });
    return false;
  }

  if (!payload.purchasable && !payload.producible) {
    res.status(400).json({ error: "Selecione pelo menos uma origem: compra ou produção." });
    return false;
  }

  return true;
}

function isDuplicateCodeError(error) {
  return error && error.code === "23505";
}

function logMaterialSaveError(error) {
  console.error("Erro ao salvar material:", error);

  if (error?.message || error?.detail || error?.code || error?.constraint) {
    console.error("Detalhes do erro ao salvar material:", {
      message: error.message,
      detail: error.detail,
      code: error.code,
      constraint: error.constraint
    });
  }
}

function materialSaveErrorResponse(error) {
  return {
    error: error?.message || null,
    detail: error?.detail || null,
    code: error?.code || null,
    constraint: error?.constraint || null
  };
}

async function getTableColumns(client, tableName) {
  const result = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = $1;
    `,
    [tableName]
  );

  return new Set(result.rows.map((row) => row.column_name));
}

async function getProductionModelInputColumns(client) {
  const columns = await getTableColumns(client, "material_production_model_inputs");

  if (!columns.has("consumption_mode")) {
    await client.query(
      "alter table material_production_model_inputs add column if not exists consumption_mode text not null default 'Fixo'"
    );
    columns.add("consumption_mode");
  }

  await client.query(
    `
      update material_production_model_inputs
      set consumption_mode = 'Variável na produção'
      where quantity is null
        and coalesce(consumption_mode, 'Fixo') = 'Fixo';
    `
  );

  return columns;
}

async function resolveOne(client, table, id, name, label) {
  if (id) {
    const result = await client.query(`select id from ${table} where id = $1 limit 1`, [id]);
    if (result.rows.length) return result.rows[0].id;
  }

  if (name) {
    const result = await client.query(`select id from ${table} where name = $1 limit 1`, [name]);
    if (result.rows.length) return result.rows[0].id;
  }

  throw Object.assign(new Error(`${label} não encontrado.`), { status: 400 });
}

async function resolveMany(client, table, ids, names, label) {
  const resolved = [];

  for (const id of ids) {
    resolved.push(await resolveOne(client, table, id, null, label));
  }

  for (const name of names) {
    resolved.push(await resolveOne(client, table, null, name, label));
  }

  return [...new Set(resolved)];
}

async function getMaterialById(client, id, includeInactive = true) {
  const result = await client.query(
    `
      select
        m.id,
        m.code,
        m.name,
        m.material_type_id as "materialTypeId",
        mt.name as type,
        m.lot_code as "lotCode",
        m.unit,
        m.secondary_unit as "secondaryUnit",
        m.secondary_unit_mode as "secondaryUnitMode",
        m.fixed_primary_quantity as "fixedPrimaryQuantity",
        m.fixed_secondary_quantity as "fixedSecondaryQuantity",
        m.controls_min_stock as "controlsMinStock",
        m.min_stock as "minimumStockQuantity",
        m.purchasable as "canBePurchased",
        m.producible as "canBeProduced",
        m.traceable,
        m.notes,
        m.status,
        m.created_at as "createdAt",
        m.updated_at as "updatedAt",
        coalesce(
          json_agg(distinct l.name) filter (where l.id is not null),
          '[]'
        ) as "allowedLocations",
        coalesce(
          json_agg(distinct mach.name) filter (where mach.id is not null),
          '[]'
        ) as "productionMachines",
        coalesce(
          json_agg(distinct op.name) filter (where op.id is not null),
          '[]'
        ) as "recommendedOperatorNames"
      from materials m
      left join material_types mt on mt.id = m.material_type_id
      left join material_allowed_locations mal on mal.material_id = m.id
      left join locations l on l.id = mal.location_id
      left join material_production_machines mpm on mpm.material_id = m.id
      left join machines mach on mach.id = mpm.machine_id
      left join material_recommended_operators mro on mro.material_id = m.id
      left join operators op on op.id = mro.operator_id
      where m.id = $1
        ${includeInactive ? "" : "and m.status = 'Ativo'"}
      group by m.id, mt.name
      limit 1;
    `,
    [id]
  );

  if (!result.rows.length) return null;

  const material = result.rows[0];
  material.productionModels = await getProductionModels(client, material.id);

  return material;
}

async function getProductionModels(client, materialId) {
  const inputColumns = await getProductionModelInputColumns(client);
  const inputMaterialExpression = inputColumns.has("material_id") && inputColumns.has("input_material_id")
    ? "coalesce(mpi.input_material_id, mpi.material_id)"
    : inputColumns.has("input_material_id")
      ? "mpi.input_material_id"
      : "mpi.material_id";

  const result = await client.query(
    `
      select
        pm.id,
        pm.name,
        null as description,
        pm.output_quantity as "outputQuantity",
        pm.output_unit as "outputUnit",
        l.name as "sourceLocation",
        'Ativo' as status
      from material_production_models pm
      left join locations l on l.id = pm.source_location_id
      where pm.material_id = $1
      order by pm.name asc;
    `,
    [materialId]
  );

  for (const model of result.rows) {
    const inputs = await client.query(
      `
        select
          mpi.id,
          im.name as "inputMaterial",
          im.code as "inputCode",
          mpi.quantity as "inputQuantity",
          mpi.unit as "inputUnit",
          coalesce(mpi.consumption_mode, 'Fixo') as "consumptionMode",
          mpi.notes
        from material_production_model_inputs mpi
        join materials im on im.id = ${inputMaterialExpression}
        where mpi.production_model_id = $1
        order by im.name asc;
      `,
      [model.id]
    );

    model.inputs = inputs.rows;
  }

  return result.rows;
}

router.get("/", async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const result = await query(`
      select id
      from materials
      ${includeInactive ? "" : "where status = 'Ativo'"}
      order by name asc;
    `);

    const client = await pool.connect();

    try {
      const materials = [];

      for (const row of result.rows) {
        materials.push(await getMaterialById(client, row.id, includeInactive));
      }

      return res.json(materials.filter(Boolean));
    } finally {
      client.release();
    }
  } catch (error) {
    logMaterialSaveError(error);
    return res.status(500).json(INTERNAL_ERROR);
  }
});

router.post("/", async (req, res) => {
  const client = await pool.connect();

  try {
    const payload = normalizePayload(req.body || {});
    if (!validatePayload(payload, res)) return null;

    await client.query("begin");
    const materialTypeId = await resolveOne(client, "material_types", payload.materialTypeId, payload.type, "Tipo de material");
    const allowedLocationIds = await resolveMany(client, "locations", payload.allowedLocationIds, payload.allowedLocations, "Local");
    const machineIds = await resolveMany(client, "machines", payload.productionMachineIds, payload.productionMachines, "Máquina");
    const operatorIds = await resolveMany(client, "operators", payload.recommendedOperatorIds, [], "Operador");

    const result = await client.query(
      `
        insert into materials (
          code,
          name,
          material_type_id,
          lot_code,
          unit,
          secondary_unit,
          secondary_unit_mode,
          fixed_primary_quantity,
          fixed_secondary_quantity,
          controls_min_stock,
          min_stock,
          purchasable,
          producible,
          traceable,
          notes,
          status
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        returning id;
      `,
      [
        payload.code,
        payload.name,
        materialTypeId,
        payload.lotCode,
        payload.unit,
        payload.secondaryUnit,
        payload.secondaryUnitMode,
        payload.secondaryUnitMode === "fixed" ? payload.fixedPrimaryQuantity : null,
        payload.secondaryUnitMode === "fixed" ? payload.fixedSecondaryQuantity : null,
        payload.controlsMinimumStock,
        payload.controlsMinimumStock ? payload.minimumStockQuantity : null,
        payload.purchasable,
        payload.producible,
        payload.traceable,
        payload.notes,
        payload.status
      ]
    );

    const materialId = result.rows[0].id;
    await replaceMaterialRelations(client, materialId, allowedLocationIds, machineIds, operatorIds);
    await replaceProductionModels(client, materialId, payload.productionModels);

    const material = await getMaterialById(client, materialId);
    await client.query("commit");

    return res.status(201).json(material);
  } catch (error) {
    await client.query("rollback");
    logMaterialSaveError(error);

    if (error.status) {
      return res.status(error.status).json(materialSaveErrorResponse(error));
    }

    return res.status(isDuplicateCodeError(error) ? 409 : 500).json(materialSaveErrorResponse(error));

    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe um material com este código." });
    }

    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const payload = normalizePayload(req.body || {});

    if (!id) return res.status(400).json({ error: "ID é obrigatório." });
    if (!validatePayload(payload, res)) return null;

    await client.query("begin");
    const materialTypeId = await resolveOne(client, "material_types", payload.materialTypeId, payload.type, "Tipo de material");
    const allowedLocationIds = await resolveMany(client, "locations", payload.allowedLocationIds, payload.allowedLocations, "Local");
    const machineIds = await resolveMany(client, "machines", payload.productionMachineIds, payload.productionMachines, "Máquina");
    const operatorIds = await resolveMany(client, "operators", payload.recommendedOperatorIds, [], "Operador");

    const result = await client.query(
      `
        update materials
        set
          code = $1,
          name = $2,
          material_type_id = $3,
          lot_code = $4,
          unit = $5,
          secondary_unit = $6,
          secondary_unit_mode = $7,
          fixed_primary_quantity = $8,
          fixed_secondary_quantity = $9,
          controls_min_stock = $10,
          min_stock = $11,
          purchasable = $12,
          producible = $13,
          traceable = $14,
          notes = $15,
          status = $16,
          updated_at = now()
        where id = $17
        returning id;
      `,
      [
        payload.code,
        payload.name,
        materialTypeId,
        payload.lotCode,
        payload.unit,
        payload.secondaryUnit,
        payload.secondaryUnitMode,
        payload.secondaryUnitMode === "fixed" ? payload.fixedPrimaryQuantity : null,
        payload.secondaryUnitMode === "fixed" ? payload.fixedSecondaryQuantity : null,
        payload.controlsMinimumStock,
        payload.controlsMinimumStock ? payload.minimumStockQuantity : null,
        payload.purchasable,
        payload.producible,
        payload.traceable,
        payload.notes,
        payload.status,
        id
      ]
    );

    if (!result.rows.length) {
      await client.query("rollback");
      return res.status(404).json({ error: "Material não encontrado." });
    }

    await replaceMaterialRelations(client, id, allowedLocationIds, machineIds, operatorIds);
    await replaceProductionModels(client, id, payload.productionModels);

    const material = await getMaterialById(client, id);
    await client.query("commit");

    return res.json(material);
  } catch (error) {
    await client.query("rollback");

    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }

    if (isDuplicateCodeError(error)) {
      return res.status(409).json({ error: "Já existe outro material com este código." });
    }

    return res.status(500).json(INTERNAL_ERROR);
  } finally {
    client.release();
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
        update materials
        set status = 'Inativo', updated_at = now()
        where id = $1
        returning id;
      `,
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Material não encontrado." });
    }

    const client = await pool.connect();

    try {
      const material = await getMaterialById(client, id);
      return res.json(material);
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(500).json(INTERNAL_ERROR);
  }
});

async function replaceMaterialRelations(client, materialId, locationIds, machineIds, operatorIds) {
  await client.query("delete from material_allowed_locations where material_id = $1", [materialId]);
  await client.query("delete from material_production_machines where material_id = $1", [materialId]);
  await client.query("delete from material_recommended_operators where material_id = $1", [materialId]);

  for (const locationId of locationIds) {
    await client.query(
      "insert into material_allowed_locations (material_id, location_id) values ($1, $2)",
      [materialId, locationId]
    );
  }

  for (const machineId of machineIds) {
    await client.query(
      "insert into material_production_machines (material_id, machine_id) values ($1, $2)",
      [materialId, machineId]
    );
  }

  for (const operatorId of operatorIds) {
    await client.query(
      "insert into material_recommended_operators (material_id, operator_id) values ($1, $2)",
      [materialId, operatorId]
    );
  }
}

async function replaceProductionModels(client, materialId, models) {
  const inputColumns = await getProductionModelInputColumns(client);
  await client.query("delete from material_production_models where material_id = $1", [materialId]);

  for (const model of models) {
    const sourceLocationId = model.sourceLocation && model.sourceLocation !== "Selecione um local"
      ? await resolveOne(client, "locations", model.sourceLocationId || null, model.sourceLocation, "Local de origem")
      : null;

    const modelResult = await client.query(
      `
        insert into material_production_models (
          material_id,
          name,
          output_quantity,
          output_unit,
          source_location_id,
          status
        )
        values ($1, $2, $3, $4, $5, $6)
        returning id;
      `,
      [
        materialId,
        normalizeText(model.name),
        normalizeDecimal(model.outputQuantity),
        normalizeText(model.outputUnit),
        sourceLocationId,
        normalizeText(model.status) || "Ativo"
      ]
    );

    const productionModelId = modelResult.rows[0].id;
    const inputs = Array.isArray(model.inputs) ? model.inputs : [];

    for (const input of inputs) {
      const inputMaterialId = await resolveOne(
        client,
        "materials",
        input.inputMaterialId || null,
        input.inputMaterial,
        "Material consumido"
      );

      const insertColumns = ["production_model_id"];
      const values = [productionModelId];

      if (inputColumns.has("material_id")) {
        insertColumns.push("material_id");
        values.push(inputMaterialId);
      }

      if (inputColumns.has("input_material_id")) {
        insertColumns.push("input_material_id");
        values.push(inputMaterialId);
      }

      insertColumns.push("quantity", "unit", "consumption_mode", "notes");
      values.push(
        normalizeDecimal(input.quantity ?? input.inputQuantity),
        normalizeText(input.unit || input.inputUnit),
        normalizeText(input.consumptionMode) || "Fixo",
        normalizeText(input.notes)
      );

      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

      await client.query(
        `
          insert into material_production_model_inputs (${insertColumns.join(", ")})
          values (${placeholders});
        `,
        values
      );
    }
  }
}

module.exports = router;
