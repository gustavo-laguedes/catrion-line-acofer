export const movementTabs = [
  { key: "PURCHASE", label: "Compra", icon: "🧾" },
  { key: "SALE", label: "Venda", icon: "🛒" },
  { key: "RETURN", label: "Devolução", icon: "↩️" },
  { key: "TRANSFER", label: "Transferência", icon: "🚚" },
  { key: "ADJUSTMENT", label: "Ajuste", icon: "🛠️" },
  { key: "INVENTORY", label: "Inventário", icon: "📋" }
];

export function getTabDescription(type) {
  const descriptions = {
    PURCHASE: "Registre compras com NF, anexo e entrada em local de estoque.",
    SALE: "Baixe materiais vendidos de forma manual ou por importação.",
    RETURN: "Registre devoluções de venda de forma manual ou por importação.",
    TRANSFER: "Transfira materiais entre unidades ou setores, com NF e anexo.",
    ADJUSTMENT: "Corrija divergências operacionais com motivo registrado.",
    INVENTORY: "Registre contagens oficiais de inventário por local."
  };

  return descriptions[type] || "";
}

export function getMovementBadgeClass(type) {
  const classes = {
    PURCHASE: "badge-success",
    SALE: "badge-danger",
    RETURN: "badge-info",
    TRANSFER: "badge-warning",
    ADJUSTMENT: "badge-warning",
    INVENTORY: "badge-info"
  };

  return classes[type] || "badge-info";
}