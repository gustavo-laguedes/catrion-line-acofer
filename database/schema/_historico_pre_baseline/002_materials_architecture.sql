-- CATRION LINE
-- Materiais: arquitetura industrial generica
-- Banco alvo: Neon / PostgreSQL

create extension if not exists "uuid-ossp";

-- =========================
-- MATERIAIS
-- Item industrial generico: comprado, produzido ou ambos.
-- =========================

alter table materials
  add column if not exists lot_code text,
  add column if not exists primary_unit text not null default 'un',
  add column if not exists secondary_unit text,
  add column if not exists secondary_unit_mode text not null default 'manual',
  add column if not exists fixed_primary_quantity numeric(14,3),
  add column if not exists fixed_secondary_quantity numeric(14,3),
  add column if not exists controls_minimum_stock boolean not null default false,
  add column if not exists minimum_stock_quantity numeric(14,3),
  add column if not exists purchasable boolean not null default false,
  add column if not exists producible boolean not null default false,
  add column if not exists traceable boolean not null default true,
  add column if not exists notes text;

update materials
set
  primary_unit = coalesce(primary_unit, unit, 'un'),
  controls_minimum_stock = coalesce(controls_minimum_stock, controls_min_stock, false),
  minimum_stock_quantity = coalesce(minimum_stock_quantity, min_stock_quantity),
  purchasable = coalesce(purchasable, can_be_purchased, false),
  producible = coalesce(producible, can_be_produced, false)
where true;

update materials set status = 'Ativo' where lower(status) = 'active';
update materials set status = 'Inativo' where lower(status) = 'inactive';

create unique index if not exists ux_materials_code on materials(code);
create index if not exists idx_materials_status on materials(status);
create index if not exists idx_materials_material_type on materials(material_type_id);

-- =========================
-- LOCAIS PERMITIDOS
-- Define onde um material pode existir fisicamente.
-- =========================

create table if not exists material_allowed_locations (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id) on delete cascade,
  location_id uuid not null references locations(id),
  status text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, location_id)
);

create index if not exists idx_material_allowed_locations_material
  on material_allowed_locations(material_id);

create index if not exists idx_material_allowed_locations_location
  on material_allowed_locations(location_id);

-- =========================
-- MODELOS DE PRODUCAO
-- Representam rotas/processos genericos para produzir um material.
-- Exemplos conceituais: corte, mistura, montagem, transformacao, beneficiamento,
-- envase, conformacao e processamento.
-- =========================

create table if not exists material_production_models (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id) on delete cascade,
  name text not null,
  description text,
  output_quantity numeric(14,3),
  output_unit text,
  source_location_id uuid references locations(id),
  status text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_production_models_material
  on material_production_models(material_id);

-- =========================
-- INSUMOS POR MODELO
-- Materiais consumidos por um modelo de producao.
-- =========================

create table if not exists material_production_model_inputs (
  id uuid primary key default uuid_generate_v4(),
  production_model_id uuid not null references material_production_models(id) on delete cascade,
  input_material_id uuid not null references materials(id),
  quantity numeric(14,3),
  unit text,
  consumption_mode text not null default 'Fixo',
  notes text,
  status text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_production_model_inputs_model
  on material_production_model_inputs(production_model_id);

create index if not exists idx_material_production_model_inputs_material
  on material_production_model_inputs(input_material_id);

-- =========================
-- MAQUINAS PERMITIDAS
-- Recursos aceitos para produzir o material.
-- =========================

create table if not exists material_production_machines (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id) on delete cascade,
  machine_id uuid not null references machines(id),
  status text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, machine_id)
);

create index if not exists idx_material_production_machines_material
  on material_production_machines(material_id);

create index if not exists idx_material_production_machines_machine
  on material_production_machines(machine_id);

-- =========================
-- OPERADORES RECOMENDADOS
-- Pessoas habilitadas ou preferenciais para produzir o material.
-- =========================

create table if not exists material_recommended_operators (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id) on delete cascade,
  operator_id uuid not null references operators(id),
  status text not null default 'Ativo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id, operator_id)
);

create index if not exists idx_material_recommended_operators_material
  on material_recommended_operators(material_id);

create index if not exists idx_material_recommended_operators_operator
  on material_recommended_operators(operator_id);
