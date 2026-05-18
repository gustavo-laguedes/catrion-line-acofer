const roles = ["DEV", "ADMIN", "PCP", "SUPER", "OPER"];

export const acessosPage = {
  title: "👥 Gestão de Acessos",
  subtitle: "Usuários, fotos, cargos e permissões",
  render: renderAccessPage
};

function renderAccessPage() {
  const roleBadges = roles.map(role => `<span class="badge">${role}</span>`).join("");

  return `
    <div class="section-header">
      <h2>Usuários e permissões</h2>
      <button class="primary-btn">Novo usuário</button>
    </div>

    <div class="card">
      <div class="placeholder-list">
        <div class="placeholder-row">
          <span>Gestão de usuários será baseada no Clerk.</span>
          <span class="badge">Clerk</span>
        </div>

        <div class="placeholder-row">
          <span>Cargos disponíveis: ${roleBadges}</span>
        </div>

        <div class="placeholder-row">
          <span>Fotos, status, permissões e vínculo com empresa serão provisionados aqui.</span>
          <span class="badge">Acessos</span>
        </div>
      </div>
    </div>
  `;
}