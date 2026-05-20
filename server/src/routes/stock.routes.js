const express = require("express");
const { query } = require("../db");

const router = express.Router();
const INTERNAL_ERROR = { error: "Erro interno ao consultar estoque." };

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;

  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getStatusLabel(group) {
  const quantity = toNumber(group.quantity);
  const minStock = toNumber(group.minStock);

  if (quantity <= 0) return "Sem saldo";
  if (minStock > 0 && quantity <= minStock) return "Baixo estoque";

  return "Normal";
}

function createEmptyGroup(material) {
  const locations = Array.isArray(material.allowedLocations) ? material.allowedLocations : [];

  return {
    materialId: material.id,
    materialCode: material.code,
    materialName: material.name,
    materialType: material.materialType || "Sem tipo",
    unit: material.unit || "-",
    secondaryUnit: material.secondaryUnit || "",
    minStock: toNumber(material.minStock),
    quantity: 0,
    secondaryQuantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
    locations: [...locations],
    locationNames: locations.length ? locations.join(" / ") : "-",
    locationBalances: locations.map((locationName) => ({
      locationName,
      quantity: 0,
      secondaryQuantity: 0,
      reservedQuantity: 0,
      availableQuantity: 0,
      status: "Sem saldo"
    })),
    statusLabel: "Sem saldo"
  };
}

router.get("/", async (req, res) => {
  try {
    const materialsResult = await query(`
      select
        m.id,
        m.code,
        m.name,
        mt.name as "materialType",
        coalesce(m.primary_unit, m.unit) as unit,
        m.secondary_unit as "secondaryUnit",
        coalesce(m.minimum_stock_quantity, m.min_stock, 0) as "minStock",
        coalesce(
          json_agg(distinct l.name) filter (where l.id is not null),
          '[]'
        ) as "allowedLocations"
      from materials m
      left join material_types mt on mt.id = m.material_type_id
      left join material_allowed_locations mal on mal.material_id = m.id
      left join locations l on l.id = mal.location_id
      where m.status = 'Ativo'
      group by m.id, mt.name
      order by m.name asc;
    `);

    const balancesResult = await query(`
      select
        sb.id as "balanceId",
        sb.material_id as "materialId",
        m.code as "materialCode",
        m.name as "materialName",
        mt.name as "materialType",
        coalesce(m.primary_unit, m.unit, sb.unit) as "materialUnit",
        m.secondary_unit as "materialSecondaryUnit",
        coalesce(m.minimum_stock_quantity, m.min_stock, 0) as "minStock",
        sb.location_id as "locationId",
        loc.name as "locationName",
        sb.lot_id as "lotId",
        lots.lot_code as "lotCode",
        lots.origin_type as origin,
        lots.production_date as "productionDate",
        lots.created_at as "createdAt",
        lots.status as "lotStatus",
        sb.quantity,
        sb.secondary_quantity as "secondaryQuantity",
        sb.unit,
        sb.secondary_unit as "secondaryUnit",
        sb.status as "balanceStatus",
        sb.updated_at as "updatedAt"
      from stock_balances sb
      join materials m on m.id = sb.material_id
      left join material_types mt on mt.id = m.material_type_id
      join locations loc on loc.id = sb.location_id
      join lots on lots.id = sb.lot_id
      where m.status = 'Ativo'
        and sb.quantity > 0
      order by m.name asc, loc.name asc, lots.lot_code asc;
    `);

    const groupsByMaterial = new Map();
    const lots = [];

    materialsResult.rows.forEach((material) => {
      groupsByMaterial.set(material.id, createEmptyGroup(material));
    });

    balancesResult.rows.forEach((balance) => {
      const materialId = balance.materialId;
      const quantity = toNumber(balance.quantity);
      const secondaryQuantity = toNumber(balance.secondaryQuantity);
      const reservedQuantity = 0;
      const availableQuantity = quantity - reservedQuantity;

      if (!groupsByMaterial.has(materialId)) {
        groupsByMaterial.set(materialId, createEmptyGroup({
          id: materialId,
          code: balance.materialCode,
          name: balance.materialName,
          materialType: balance.materialType,
          unit: balance.materialUnit || balance.unit,
          secondaryUnit: balance.materialSecondaryUnit || balance.secondaryUnit,
          minStock: balance.minStock,
          allowedLocations: []
        }));
      }

      const group = groupsByMaterial.get(materialId);
      const locationName = balance.locationName || "Local nao informado";

      if (!group.locations.includes(locationName)) {
        group.locations.push(locationName);
      }

      let locationBalance = group.locationBalances.find((item) => item.locationName === locationName);

      if (!locationBalance) {
        locationBalance = {
          locationName,
          quantity: 0,
          secondaryQuantity: 0,
          reservedQuantity: 0,
          availableQuantity: 0,
          status: balance.balanceStatus || "Disponivel"
        };
        group.locationBalances.push(locationBalance);
      }

      locationBalance.quantity += quantity;
      locationBalance.secondaryQuantity += secondaryQuantity;
      locationBalance.reservedQuantity += reservedQuantity;
      locationBalance.availableQuantity += availableQuantity;
      locationBalance.status = balance.balanceStatus || locationBalance.status;

      group.quantity += quantity;
      group.secondaryQuantity += secondaryQuantity;
      group.reservedQuantity += reservedQuantity;
      group.availableQuantity += availableQuantity;

      lots.push({
        id: balance.lotId,
        balanceId: balance.balanceId,
        balanceMaterialCode: balance.materialCode,
        materialId,
        materialName: balance.materialName,
        locationId: balance.locationId,
        locationName,
        lotCode: balance.lotCode,
        origin: balance.origin || "Origem nao informada",
        productionDate: balance.productionDate,
        createdAt: balance.createdAt,
        quantity,
        secondaryQuantity,
        reservedQuantity,
        availableQuantity,
        unit: balance.unit || balance.materialUnit || "-",
        secondaryUnit: balance.secondaryUnit || balance.materialSecondaryUnit || "",
        status: balance.lotStatus || balance.balanceStatus || "Disponivel",
        updatedAt: balance.updatedAt
      });
    });

    const groups = [...groupsByMaterial.values()].map((group) => {
      group.locationNames = group.locations.length ? group.locations.join(" / ") : "-";
      group.statusLabel = getStatusLabel(group);
      group.status = group.statusLabel;
      return group;
    });

    return res.json({ groups, lots });
  } catch (error) {
    console.error("Erro ao consultar estoque:", error);
    return res.status(500).json(INTERNAL_ERROR);
  }
});

module.exports = router;
