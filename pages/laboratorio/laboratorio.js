import { renderSimplePage } from "../common/simplePage.js";

export const laboratorioPage = {
  title: "🧪 Laboratório",
  subtitle: "Ensaios, inspeções, parâmetros técnicos e qualidade dos materiais",
  render: () => renderSimplePage("Laboratório", [
    "Ensaios por lote",
    "Resultados laboratoriais",
    "Conformidade técnica",
    "Histórico de inspeções",
    "Anexos e laudos"
  ])
};