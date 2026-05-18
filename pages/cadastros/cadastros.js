export const cadastrosPage = {
  title: "🗂️ Cadastros",
  subtitle: "Base configurável do Line: locais, materiais, máquinas, pessoas e processos",
  render: renderCadastros
};

function renderCadastros() {
  const cards = [
  {
  icon: "📍",
  title: "Locais / Centros",
  description: "Matriz, filiais, estoques, setores produtivos e locais de venda.",
  tag: "Base",
  route: "cadastros-locais"
},
  {
  icon: "🏷️",
  title: "Tipos de material",
  description: "Classificações livres para organizar materiais conforme a realidade da empresa.",
  tag: "Livre",
  route: "cadastros-tipos-material"
},
  {
  icon: "🧱",
  title: "Materiais",
  description: "Produtos, matérias-primas, semiacabados e itens finais.",
  tag: "Principal",
  route: "cadastros-materiais"
},
  {
  icon: "⚙️",
  title: "Máquinas",
  description: "Equipamentos, linhas ou recursos produtivos usados nos processos da empresa.",
  tag: "Produção",
  route: "cadastros-maquinas"
},
  {
  icon: "👷",
  title: "Operadores",
  description: "Pessoas envolvidas nos apontamentos e etapas de produção.",
  tag: "Equipe",
  route: "cadastros-operadores"
},
{
  icon: "🏢",
  title: "Fornecedores",
  description: "Empresas, usinas, distribuidores e parceiros que fornecem materiais.",
  tag: "Compras",
  route: "cadastros-fornecedores"
},
  {
  icon: "📐",
  title: "Parâmetros técnicos",
  description: "Regras, fatores, tolerâncias e configurações técnicas usadas nos cálculos.",
  tag: "Técnico",
  route: "cadastros-parametros"
},
];
  return `
    <div class="cadastros-grid">
      ${cards.map(renderCadastroCard).join("")}
    </div>
  `;
}

function renderCadastroCard(card) {
  return `
    <button class="cadastro-card" type="button" ${card.route ? `data-route="${card.route}"` : ""}>
      <div class="cadastro-card-top">
        <div class="cadastro-icon">${card.icon}</div>
        <span class="badge">${card.tag}</span>
      </div>

      <div class="cadastro-card-body">
        <h3>${card.title}</h3>
        <p>${card.description}</p>
      </div>

      <div class="cadastro-card-footer">
        <span>Gerenciar cadastro</span>
        <strong>→</strong>
      </div>
    </button>
  `;
}