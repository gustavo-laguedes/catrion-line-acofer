import { dashboardPage } from "./dashboard/dashboard.js";
import { cadastrosPage } from "./cadastros/cadastros.js";
import { locaisPage } from "./cadastros/locais.js";
import { tiposMaterialPage } from "./cadastros/tipos-material.js";
import { materiaisPage } from "./cadastros/materiais.js";
import { maquinasPage } from "./cadastros/maquinas.js";
import { operadoresPage } from "./cadastros/operadores.js";
import { fornecedoresPage } from "./cadastros/fornecedores.js";
import { veiculosPage } from "./cadastros/veiculos.js";
import { parametrosExpedicaoPage } from "./cadastros/parametros-expedicao.js";
import { parametrosPage } from "./cadastros/parametros.js";
import { estoquePage } from "./estoque/estoque.js?v=purchase-neon";
import { producaoPage } from "./producao/producao.js";
import { expedicaoPage } from "./expedicao/expedicao.js";
import { movimentacoesPage } from "./movimentacoes/movimentacoes.js?v=expedition-api";
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
  "cadastros-veiculos": veiculosPage,
  "cadastros-parametros-expedicao": parametrosExpedicaoPage,
  "cadastros-parametros": parametrosPage,
  estoque: estoquePage,
  producao: producaoPage,
  expedicao: expedicaoPage,
  movimentacoes: movimentacoesPage,
  calculos: calculosPage,
  rastreabilidade: rastreabilidadePage,
  relatorios: relatoriosPage,
  laboratorio: laboratorioPage,
  acessos: acessosPage
};
