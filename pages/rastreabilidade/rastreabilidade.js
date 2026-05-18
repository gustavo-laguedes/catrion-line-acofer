import { renderSimplePage } from "../common/simplePage.js";

export const rastreabilidadePage = {
  title: "🔎 Rastreabilidade",
  subtitle: "Linha do tempo completa dos lotes, da origem até o destino final",
  render: () => renderSimplePage("Rastreabilidade", [
    "Buscar lote",
    "Linha do tempo",
    "Origem do material",
    "Destino do material",
    "Histórico completo"
  ])
};