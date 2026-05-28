export const lineStore = {
  locations: [],
  materialTypes: [],
  materials: [],
  machines: [],
  operators: [],
  operatorRoles: [],
  technicalParameters: [],
  suppliers: [],
  vehicles: [],
  expeditionParameters: [],
  expeditionHistory: [],
  stockBalances: [],
  stockLots: [],
  stockMovements: [],
  stockMovementItems: [],
  stockImportControls: [],
  productionOrders: [],
  productionRecords: [],
  productionRecordItems: [],
  productionGeneratedLots: [],
  industrialLossEvents: [],
  stockLossParameters: {
    globalLossPercent: 10,
    materialLossPercents: {}
  },
  productionLotPattern: {
    format: "DDMMAA + MATERIAL + MAQUINA + SEQUENCIAL",
    materialCodeLength: 3,
    machineCodeLength: 5,
    sequenceLength: 2,
    resetRule: "data + material + máquina"
  }
};

export const unitOptions = [
  "un",
  "kg",
  "m",
  "m²",
  "m³",
  "%",
  "fator",
  "mm",
  "cm",
  "pc",
  "cx",
  "pct",
  "rolo",
  "barra",
  "lote",
  "outro"
];

export function getActiveItems(items) {
  return items.filter(item => item.status !== "Inativo");
}

export function getLocationOptions() {
  return [
    "Selecione um local",
    ...getActiveItems(lineStore.locations).map(location => location.name)
  ];
}

export function getMaterialTypeOptions() {
  return [
    "Selecione um tipo",
    ...getActiveItems(lineStore.materialTypes).map(type => type.name)
  ];
}

export function getMachineOptions() {
  return getActiveItems(lineStore.machines).map(machine => machine.name);
}

export function getMaterialOptions() {
  return [
    "Não vincular material",
    ...getActiveItems(lineStore.materials).map(material => material.name)
  ];
}

export function getConsumedMaterialOptions(currentMaterialIndex = null) {
  const materials = getActiveItems(lineStore.materials).filter((material) => {
    return lineStore.materials.indexOf(material) !== currentMaterialIndex;
  });

  return materials;
}

export function getMaterialByName(name) {
  return lineStore.materials.find(material => material.name === name);
}

export function getStockBalances() {
  return lineStore.stockBalances || [];
}

export function saveStockBalances(stockBalances) {
  lineStore.stockBalances = stockBalances;
}

export function getStockLossParameters() {
  if (!lineStore.stockLossParameters) {
    lineStore.stockLossParameters = {};
  }

  lineStore.stockLossParameters = {
    globalLossPercent: Number(lineStore.stockLossParameters.globalLossPercent ?? 10),
    materialLossPercents: lineStore.stockLossParameters.materialLossPercents || {}
  };

  return lineStore.stockLossParameters;
}

export function saveStockLossParameters(parameters = {}) {
  lineStore.stockLossParameters = {
    globalLossPercent: Number(parameters.globalLossPercent ?? 10),
    materialLossPercents: parameters.materialLossPercents || {}
  };

  return lineStore.stockLossParameters;
}

export function getStockStatus(balance) {
  const quantity = Number(balance.quantity || 0)
  const minStock = Number(balance.minStock || 0)

  if (quantity <= 0) {
    return 'empty'
  }

  if (minStock > 0 && quantity <= minStock) {
    return 'low'
  }

  return 'normal'
}

export function getAvailableQuantity(balance) {
  const quantity = Number(balance.quantity || 0)
  const reserved = Number(balance.reservedQuantity || 0)

  return quantity - reserved
}
