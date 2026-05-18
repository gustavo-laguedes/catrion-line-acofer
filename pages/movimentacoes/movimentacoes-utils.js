export function getNowInputValue() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());

  return date.toISOString().slice(0, 16);
}

export function getToday() {
  return new Date().toISOString().slice(0, 10);
}

export function getDateOnly(value) {
  if (!value) return getToday();

  return value.slice(0, 10);
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

export function parseDecimalNumber(value) {
  const text = String(value ?? "").trim();

  if (!text) return 0;

  if (text.includes(",")) {
    return Number(text.replace(/\./g, "").replace(",", "."));
  }

  return Number(text);
}

export function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  const formattedDate = date.toLocaleDateString("pt-BR");

  const formattedTime = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${formattedDate} ${formattedTime}`;
}

export function formatDateOnly(value) {
  if (!value) return "-";

  const [year, month, day] = value.slice(0, 10).split("-");

  if (!year || !month || !day) return value;

  return `${day}/${month}/${year}`;
}

export function toDateTimeInputValue(value) {
  if (!value) return getNowInputValue();

  return value.slice(0, 16);
}

export function getMaterialSecondaryData(material = {}) {
  return {
    secondaryUnit: material.secondaryUnit || "",
    secondaryUnitMode: material.secondaryUnitMode || "manual",
    fixedPrimaryQuantity: material.fixedPrimaryQuantity || "",
    fixedSecondaryQuantity: material.fixedSecondaryQuantity || ""
  };
}

export function calculateFixedSecondaryQuantity(item = {}, primaryQuantity = 0) {
  const basePrimary = parseDecimalNumber(item.fixedPrimaryQuantity);
  const baseSecondary = parseDecimalNumber(item.fixedSecondaryQuantity);

  if (!item.secondaryUnit || item.secondaryUnitMode !== "fixed" || basePrimary <= 0 || baseSecondary <= 0) {
    return Number(item.secondaryQuantity || 0);
  }

  return (Number(primaryQuantity || 0) * baseSecondary) / basePrimary;
}

export function getLotSecondaryQuantity(item = {}, lot = {}, primaryQuantity = 0) {
  if (!item.secondaryUnit) return "";

  if (item.secondaryUnitMode === "fixed") {
    return calculateFixedSecondaryQuantity(item, primaryQuantity);
  }

  return lot.secondaryQuantity ?? "";
}

export function applyLotSecondaryQuantity(item = {}, lot = {}, primaryQuantity = 0) {
  if (!item.secondaryUnit) {
    delete lot.secondaryQuantity;
    delete lot.secondaryUnit;
    return lot;
  }

  lot.secondaryUnit = item.secondaryUnit;

  if (item.secondaryUnitMode === "fixed") {
    lot.secondaryQuantity = calculateFixedSecondaryQuantity(item, primaryQuantity);
  } else if (lot.secondaryQuantity === undefined || lot.secondaryQuantity === null) {
    lot.secondaryQuantity = "";
  }

  return lot;
}

export function renderLotSecondaryField({
  item,
  lot,
  itemIndex,
  itemId = "",
  lotIndex,
  primaryQuantity,
  inputClass = "lot-secondary-quantity",
  label = "Qtd. secundária",
  disabled = false
}) {
  if (!item?.secondaryUnit) return "";

  const isFixed = item.secondaryUnitMode === "fixed";
  const value = getLotSecondaryQuantity(item, lot, primaryQuantity);

  return `
    <label class="lot-secondary-qty ${isFixed ? "fixed-mode" : ""}">
      ${label} (${item.secondaryUnit})
      <input
        class="${inputClass} lot-secondary-quantity"
        data-index="${itemIndex}"
        ${itemId ? `data-item-id="${itemId}"` : ""}
        data-lot-index="${lotIndex}"
        type="number"
        min="0"
        step="0.001"
        value="${value}"
        ${isFixed || disabled ? "disabled" : ""}
      />
    </label>
  `;
}
