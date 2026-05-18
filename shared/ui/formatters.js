export function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value || 0);
}

export function formatWeightKg(value) {
  return `${formatNumber(value)} kg`;
}

export function formatDateBR(dateValue) {
  if (!dateValue) return "-";

  const date = new Date(dateValue);

  return new Intl.DateTimeFormat("pt-BR").format(date);
}