import { metricCard, placeholderRow, sectionHeader } from "../../shared/ui/components.js";

export const dashboardPage = {
  title: "🏭 Dashboard",
  subtitle: "Visão geral da produção, estoque, lotes e alertas industriais",
  render: renderDashboard
};

function renderDashboard() {
  return `
    <div class="page-grid">
      ${metricCard({
        title: "Produções hoje",
        value: "0",
        hint: "Apontamentos registrados no dia"
      })}

      ${metricCard({
        title: "Alertas de estoque",
        value: "0",
        hint: "Materiais abaixo do mínimo"
      })}

      ${metricCard({
        title: "Lotes rastreáveis",
        value: "0",
        hint: "Lotes ativos no sistema"
      })}

      ${metricCard({
        title: "Ordens em andamento",
        value: "0",
        hint: "Produções abertas"
      })}
    </div>

    <div class="section">
      ${sectionHeader({
        title: "Visão industrial",
        actionLabel: "Nova produção"
      })}

      <div class="card">
        <div class="placeholder-list">
          ${placeholderRow({
  text: "Produção por materiais, processos, máquinas e lotes será exibida aqui conforme os cadastros da empresa.",
  status: "Em construção"
})}

          ${placeholderRow({
            text: "Alertas de fator nominal, perda de peso e rendimento serão conectados ao Neon.",
            status: "Provisionado"
          })}

          ${placeholderRow({
            text: "Rastreabilidade ponta a ponta: compra → produção → estoque → venda.",
            status: "Line Core"
          })}
        </div>
      </div>
    </div>
  `;
}