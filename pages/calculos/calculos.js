import { renderSimplePage } from "../common/simplePage.js";

export const calculosPage = {
  title: "📐 Cálculos PCP",
  subtitle: "Simulação de produção com base em demanda, estoque e composição",
  render: () => renderSimplePage("Cálculos PCP", [
    "Cálculo de malhas",
    "Necessidade de varetas",
    "Necessidade de bobinas",
    "Comparativo com estoque",
    "Sugestão de produção"
  ])
};