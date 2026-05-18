import { renderSimplePage } from "../common/simplePage.js";

export const relatoriosPage = {
  title: "📈 Relatórios",
  subtitle: "Indicadores industriais, estoque, produção, rendimento e perdas",
  render: () => renderSimplePage("Relatórios", [
    "Produção por período",
    "Consumo por material",
    "Rendimento por bitola",
    "Variação de fator nominal",
    "Movimentações por local",
    "Rastreabilidade por lote"
  ])
};