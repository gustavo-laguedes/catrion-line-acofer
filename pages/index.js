import { dashboardPage } from "./dashboard/dashboard.js";
import { cadastrosPage } from "./cadastros/cadastros.js";
import { locaisPage } from "./cadastros/locais.js";
import { tiposMaterialPage } from "./cadastros/tipos-material.js";
import { materiaisPage } from "./cadastros/materiais.js";
import { maquinasPage } from "./cadastros/maquinas.js";
import { operadoresPage } from "./cadastros/operadores.js";
import { fornecedoresPage } from "./cadastros/fornecedores.js";
import { parametrosPage } from "./cadastros/parametros.js";
import { estoquePage } from "./estoque/estoque.js?v=purchase-neon";
import { producaoPage } from "./producao/producao.js";
import { movimentacoesPage } from "./movimentacoes/movimentacoes.js?v=purchase-neon";
import { calculosPage } from "./calculos/calculos.js";
import { rastreabilidadePage } from "./rastreabilidade/rastreabilidade.js";
import { relatoriosPage } from "./relatorios/relatorios.js";
import { laboratorioPage } from "./laboratorio/laboratorio.js";
import { acessosPage } from "./acessos/acessos.js";

export const pages = {
  dashboard: dashboardPage,
  cadastros: cadastrosPage,
  "cadastros-locais": locaisPage,
  "cadastros-tipos-material": tiposMaterialPage,
  "cadastros-materiais": materiaisPage,
  "cadastros-maquinas": maquinasPage,
  "cadastros-operadores": operadoresPage,
  "cadastros-fornecedores": fornecedoresPage,
  "cadastros-parametros": parametrosPage,
  estoque: estoquePage,
  producao: producaoPage,
  movimentacoes: movimentacoesPage,
  calculos: calculosPage,
  rastreabilidade: rastreabilidadePage,
  relatorios: relatoriosPage,
  laboratorio: laboratorioPage,
  acessos: acessosPage
};
