export function buildStockSnapshot(lineStore) {
  const groups = new Map();
  const lotsMap = new Map();

  getActiveMaterials(lineStore).forEach((material) => {
    const materialCode = material.code || material.name;

    groups.set(materialCode, {
  materialId: material.id || "",
  materialCode,
  materialName: material.name || "Material não informado",
  materialType: material.type || "Sem tipo",
  unit: material.unit || "-",
  secondaryUnit: material.secondaryUnit || "",
    minStock: parseStockNumber(material.minStock || 0),
      locations: Array.isArray(material.allowedLocations) ? [...material.allowedLocations] : [],
      quantity: 0,
secondaryQuantity: 0,
reservedQuantity: 0,
availableQuantity: 0,
locationBalances: [],
      locationNames: "-"
    });
  });

  const movements = [...(lineStore.stockMovements || [])]
    .filter((movement) => movement.status !== "Cancelado")
    .sort((a, b) => {
      return new Date(a.createdAt || a.dateTime || 0) - new Date(b.createdAt || b.dateTime || 0);
    });

  movements.forEach((movement) => {
    const items = (lineStore.stockMovementItems || []).filter((item) => {
      return item.movementId === movement.id;
    });

    items.forEach((item) => {
      processMovementItem({
        movement,
        item,
        groups,
        lotsMap,
        lineStore
      });
    });
  });

  const productionRecords = [...(lineStore.productionRecords || [])]
  .filter((record) => record.status !== "Cancelado")
  .sort((a, b) => {
    return new Date(a.createdAt || a.dateTime || 0) - new Date(b.createdAt || b.dateTime || 0);
  });

productionRecords.forEach((record) => {
  processProductionRecord({
    record,
    groups,
    lotsMap,
    lineStore
  });
});

  const lots = [...lotsMap.values()].filter((lot) => {
    return Number(lot.quantity || 0) > 0;
  });

  groups.forEach((group) => {
    lots
      .filter((lot) => lot.balanceMaterialCode === group.materialCode)
      .forEach((lot) => {
        if (!group.locations.includes(lot.locationName)) {
          group.locations.push(lot.locationName);
        }
      });

    group.locations.forEach((locationName) => {
      const locationLots = lots.filter((lot) => {
        return lot.balanceMaterialCode === group.materialCode && lot.locationName === locationName;
      });

     const quantity = locationLots.reduce((sum, lot) => sum + Number(lot.quantity || 0), 0);
const secondaryQuantity = locationLots.reduce((sum, lot) => sum + Number(lot.secondaryQuantity || 0), 0);
const reservedQuantity = locationLots.reduce((sum, lot) => sum + Number(lot.reservedQuantity || 0), 0);
const availableQuantity = quantity - reservedQuantity;

      group.locationBalances.push({
  locationName,
  quantity,
  secondaryQuantity,
  reservedQuantity,
  availableQuantity
});

      group.quantity += quantity;
group.secondaryQuantity += secondaryQuantity;
group.reservedQuantity += reservedQuantity;
group.availableQuantity += availableQuantity;
    });

group.locationNames = group.locations.length ? group.locations.join(" / ") : "-";
group.statusLabel = getStockStatus(group).label;
  });

  return {
    groups: [...groups.values()],
    lots
  };
}

function processMovementItem({ movement, item, groups, lotsMap, lineStore }) {
  const material = findMaterial(lineStore, item);
  const materialCode = item.materialCode || material?.code || item.materialName || "-";
  const materialName = item.materialName || material?.name || "Material não informado";
  const unit = item.unit || material?.unit || "-";
  const secondaryUnit = item.secondaryUnit || material?.secondaryUnit || "";

  ensureGroup(groups, {
    material,
    materialCode,
    materialName,
    unit
  });

  const lots = item.lots || [];

  lots.forEach((lot) => {
    const lotCode = lot.lotCode || lot.sourceLotCode || "SEM-LOTE";
    const quantity = getLotMovementQuantity(lot);
    const secondaryQuantity = getExplicitSecondaryQuantity(lot);

    if (movement.type === "PURCHASE") {
      addLot(lotsMap, {
        materialCode,
        materialName,
        unit,
        secondaryUnit,
        locationName: movement.locationName,
        lotCode,
        quantity,
        ...(secondaryQuantity !== null ? { secondaryQuantity } : {}),
        origin: movement.supplierName || "Compra",
        productionDate: movement.dateTime || movement.createdAt
      });
    }

    if (movement.type === "SALE") {
      subtractLot(lotsMap, {
        materialCode,
        locationName: movement.locationName,
        lotCode,
        quantity,
        ...(secondaryQuantity !== null ? { secondaryQuantity } : {})
      });
    }

    if (movement.type === "RETURN") {
      addLot(lotsMap, {
        materialCode,
        materialName,
        unit,
        secondaryUnit,
        locationName: movement.locationName,
        lotCode,
        quantity,
        ...(secondaryQuantity !== null ? { secondaryQuantity } : {}),
        origin: "Devolução",
        productionDate: movement.dateTime || movement.createdAt
      });
    }

    if (movement.type === "TRANSFER") {
      const removedSecondaryQuantity = subtractLot(lotsMap, {
        materialCode,
        locationName: movement.originLocation,
        lotCode,
        quantity,
        ...(secondaryQuantity !== null ? { secondaryQuantity } : {})
      });

      addLot(lotsMap, {
        materialCode,
        materialName,
        unit,
        secondaryUnit,
        locationName: movement.destinationLocation,
        lotCode,
        quantity,
        secondaryQuantity: removedSecondaryQuantity,
        origin: movement.originLocation ? `Transferência de ${movement.originLocation}` : "Transferência",
        productionDate: movement.dateTime || movement.createdAt
      });
    }

    if (movement.type === "ADJUSTMENT") {
      const adjustmentType = lot.adjustmentType || movement.adjustmentType || "INCREASE";
      const adjustmentQuantity = Number(lot.adjustmentQuantity ?? lot.quantity ?? quantity ?? 0);
      const adjustmentSecondaryQuantity = getExplicitSecondaryQuantity(lot);

      if (adjustmentType === "DECREASE") {
        subtractLot(lotsMap, {
          materialCode,
          locationName: movement.locationName,
          lotCode,
          quantity: adjustmentQuantity,
          ...(adjustmentSecondaryQuantity !== null ? { secondaryQuantity: adjustmentSecondaryQuantity } : {})
        });
      } else {
        addLot(lotsMap, {
          materialCode,
          materialName,
          unit,
          secondaryUnit,
          locationName: movement.locationName,
          lotCode,
          quantity: adjustmentQuantity,
          ...(adjustmentSecondaryQuantity !== null ? { secondaryQuantity: adjustmentSecondaryQuantity } : {}),
          origin: movement.reason || "Ajuste operacional",
          productionDate: movement.dateTime || movement.createdAt
        });
      }
    }

    if (movement.type === "INVENTORY") {
      setLotQuantity(lotsMap, {
        materialCode,
        materialName,
        unit,
        secondaryUnit,
        locationName: movement.locationName,
        lotCode,
        quantity: Number(lot.countedQuantity ?? lot.finalQuantity ?? lot.quantity ?? 0),
        ...(secondaryQuantity !== null ? { secondaryQuantity } : {}),
        origin: "Inventário",
        productionDate: movement.dateTime || movement.createdAt
      });
    }
  });
}

function processProductionRecord({ record, groups, lotsMap, lineStore }) {
  const outputMaterialCode = record.outputMaterialCode || record.outputMaterialName || "-";
  const outputMaterialName = record.outputMaterialName || "Material produzido";
  const outputUnit = record.outputUnit || "-";

  const outputMaterial = (lineStore.materials || []).find((material) => {
    return material.code === outputMaterialCode || material.name === outputMaterialName;
  });

  const outputSecondaryUnit = record.outputSecondaryUnit || outputMaterial?.secondaryUnit || "";

  ensureGroup(groups, {
    material: outputMaterial,
    materialCode: outputMaterialCode,
    materialName: outputMaterialName,
    unit: outputUnit
  });

  const consumedItems = (lineStore.productionRecordItems || []).filter((item) => {
    return item.productionRecordId === record.id;
  });

  consumedItems.forEach((item) => {
    const inputMaterialCode = item.inputCode || item.inputMaterial || "-";

    (item.consumedLots || []).forEach((lot) => {
      const secondaryQuantity = getExplicitSecondaryQuantity(lot);

      subtractLot(lotsMap, {
        materialCode: inputMaterialCode,
        locationName: item.sourceLocation || lot.locationName || "",
        lotCode: lot.lotCode,
        quantity: Number(lot.quantity || 0),
        ...(secondaryQuantity !== null ? { secondaryQuantity } : {})
      });
    });
  });

  const generatedLots = (lineStore.productionGeneratedLots || []).filter((lot) => {
    return lot.productionRecordId === record.id;
  });

  if (generatedLots.length) {
    generatedLots.forEach((lot) => {
      const secondaryQuantity = getExplicitSecondaryQuantity(lot);

      addLot(lotsMap, {
        materialCode: lot.materialCode || outputMaterialCode,
        materialName: lot.materialName || outputMaterialName,
        unit: lot.unit || outputUnit,
        secondaryUnit: lot.secondaryUnit || outputSecondaryUnit,
        locationName: lot.locationName || record.locationName,
        lotCode: lot.lotCode,
        quantity: Number(lot.quantity || 0),
        ...(secondaryQuantity !== null ? { secondaryQuantity } : {}),
        origin: "Produção",
        productionDate: lot.productionDate || record.productionDate || record.dateTime || record.createdAt
      });
    });

    return;
  }

  addLot(lotsMap, {
    materialCode: outputMaterialCode,
    materialName: outputMaterialName,
    unit: outputUnit,
    secondaryUnit: outputSecondaryUnit,
    locationName: record.locationName,
    lotCode: record.generatedLotCode,
    quantity: Number(record.outputQuantity || 0),
    secondaryQuantity: Number(record.outputSecondaryQuantity || 0),
    origin: "Produção",
    productionDate: record.productionDate || record.dateTime || record.createdAt
  });
}

function ensureGroup(groups, { material, materialCode, materialName, unit }) {
  if (groups.has(materialCode)) return;

  groups.set(materialCode, {
    materialId: material?.id || "",
    materialCode,
    materialName,
    materialType: material?.type || "Sem tipo",
    unit,
    secondaryUnit: material?.secondaryUnit || "",
    minStock: parseStockNumber(material?.minStock || 0),
    locations: Array.isArray(material?.allowedLocations) ? [...material.allowedLocations] : [],
    quantity: 0,
    secondaryQuantity: 0,
    reservedQuantity: 0,
    availableQuantity: 0,
    locationBalances: [],
    locationNames: "-"
  });
}

function addLot(lotsMap, payload) {
  if (!payload.locationName || !payload.lotCode) return;

  const key = getLotKey(payload.materialCode, payload.locationName, payload.lotCode);
  const current = lotsMap.get(key) || createLot(payload);

  current.quantity += Number(payload.quantity || 0);
  current.secondaryQuantity += Number(payload.secondaryQuantity || 0);
  current.reservedQuantity = Number(current.reservedQuantity || 0);

  if (payload.secondaryUnit) {
    current.secondaryUnit = payload.secondaryUnit;
  }

  lotsMap.set(key, current);
}

function subtractLot(lotsMap, payload) {
  if (!payload.locationName || !payload.lotCode) return 0;

  const key = getLotKey(payload.materialCode, payload.locationName, payload.lotCode);
  const current = lotsMap.get(key) || createLot(payload);

  const quantityToRemove = Number(payload.quantity || 0);
  const secondaryToRemove = getExplicitSecondaryQuantity(payload) ?? 0;

  current.quantity -= quantityToRemove;
  current.secondaryQuantity -= secondaryToRemove;

  if (current.quantity < 0) current.quantity = 0;
  if (current.secondaryQuantity < 0) current.secondaryQuantity = 0;

  lotsMap.set(key, current);

  return secondaryToRemove;
}

function setLotQuantity(lotsMap, payload) {
  if (!payload.locationName || !payload.lotCode) return;

  const key = getLotKey(payload.materialCode, payload.locationName, payload.lotCode);
  const current = lotsMap.get(key) || createLot(payload);

  current.quantity = Number(payload.quantity || 0);
  if (hasExplicitSecondaryQuantity(payload)) {
    current.secondaryQuantity = getExplicitSecondaryQuantity(payload);
  }
  current.reservedQuantity = Number(current.reservedQuantity || 0);
  current.origin = payload.origin || current.origin;

  if (payload.secondaryUnit) {
    current.secondaryUnit = payload.secondaryUnit;
  }

  lotsMap.set(key, current);
}

function createLot(payload) {
  return {
    id: crypto.randomUUID(),
    balanceMaterialCode: payload.materialCode,
    materialName: payload.materialName || "",
    locationName: payload.locationName || "",
    lotCode: payload.lotCode || "",
    origin: payload.origin || "Movimentação",
    productionDate: payload.productionDate || "",
    quantity: 0,
    secondaryQuantity: 0,
    reservedQuantity: 0,
    unit: payload.unit || "-",
    secondaryUnit: payload.secondaryUnit || ""
  };
}

function getLotMovementQuantity(lot) {
  return Number(
    lot.movementQuantity ??
    lot.quantity ??
    lot.exitQuantity ??
    lot.adjustmentQuantity ??
    lot.countedQuantity ??
    0
  );
}

function hasExplicitSecondaryQuantity(source) {
  return (
    Object.prototype.hasOwnProperty.call(source, "secondaryQuantity") &&
    source.secondaryQuantity !== undefined &&
    source.secondaryQuantity !== null &&
    source.secondaryQuantity !== ""
  );
}

function getExplicitSecondaryQuantity(source) {
  if (!hasExplicitSecondaryQuantity(source)) return null;

  const value = Number(source.secondaryQuantity);

  return Number.isFinite(value) ? value : 0;
}

function getLotKey(materialCode, locationName, lotCode) {
  return `${materialCode}__${locationName}__${lotCode}`;
}

function getActiveMaterials(lineStore) {
  return (lineStore.materials || []).filter((material) => {
    return material.status !== "Inativo";
  });
}

function findMaterial(lineStore, item) {
  return (lineStore.materials || []).find((material) => {
    return material.code === item.materialCode || material.name === item.materialName;
  });
}

function parseStockNumber(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;

  return Number(String(value).replace(/\./g, "").replace(",", ".")) || 0;
}

function getStockStatus(balance) {
  const quantity = Number(balance.quantity || 0);
  const minStock = Number(balance.minStock || 0);

  if (quantity <= 0) {
    return {
      key: "empty",
      label: "Sem saldo",
      className: "badge-danger"
    };
  }

  if (minStock > 0 && quantity <= minStock) {
    return {
      key: "low",
      label: "Baixo estoque",
      className: "badge-warning"
    };
  }

  return {
    key: "normal",
    label: "Normal",
    className: "badge-success"
  };
}
