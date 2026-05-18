-- CATRION LINE
-- Schema inicial v1
-- Modelo: 1 banco por cliente / 1 repositório por cliente
-- Banco alvo: Neon / PostgreSQL

create extension if not exists "uuid-ossp";

-- =========================
-- CONFIGURAÇÃO DA EMPRESA / INSTÂNCIA
-- Cada banco representa uma empresa.
-- =========================

create table if not exists company_settings (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  trade_name text,
  document_number text,
  logo_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- PERFIS / USUÁRIOS
-- Clerk será a fonte de autenticação.
-- =========================

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  clerk_user_id text not null unique,
  full_name text not null,
  email text not null unique,
  avatar_url text,
  role text not null check (role in ('DEV', 'ADMIN', 'PCP', 'SUPER', 'OPER')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- LOCAIS / CENTROS DE CUSTO
-- Ex: Matriz, Centro, Feital, Trefila, Estoque
-- =========================

create table if not exists locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null unique,
  type text not null default 'storage',
  is_sale_location boolean not null default false,
  is_production_location boolean not null default false,
  is_storage_location boolean not null default true,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- TIPOS DE MATERIAL
-- Criado livremente pelo cliente.
-- =========================

create table if not exists material_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  code text not null unique,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- MATERIAIS
-- Produto, matéria-prima, semiacabado ou produto final.
-- =========================

create table if not exists materials (
  id uuid primary key default uuid_generate_v4(),
  material_type_id uuid references material_types(id),
  default_location_id uuid references locations(id),

  code text not null unique,
  name text not null,

  diameter_mm numeric(10,3),
  length_m numeric(10,3),
  nominal_factor_kg_m numeric(12,6),

  can_be_purchased boolean not null default false,
  can_be_produced boolean not null default false,
  controls_min_stock boolean not null default false,
  min_stock_quantity numeric(14,3),
  min_stock_weight_kg numeric(14,3),

  unit text not null default 'un',
  status text not null default 'active',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- MÁQUINAS
-- Criadas livremente pelo cliente.
-- =========================

create table if not exists machines (
  id uuid primary key default uuid_generate_v4(),
  location_id uuid references locations(id),
  code text not null unique,
  name text not null,
  type text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- OPERADORES / PESSOAS DE PRODUÇÃO
-- =========================

create table if not exists operators (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  registration_code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- FICHA TÉCNICA / COMPOSIÇÃO
-- Sempre olhando para o material de origem.
-- =========================

create table if not exists material_recipes (
  id uuid primary key default uuid_generate_v4(),
  output_material_id uuid not null references materials(id),
  name text not null,
  is_default boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists material_recipe_inputs (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid not null references material_recipes(id) on delete cascade,
  input_material_id uuid not null references materials(id),
  quantity_required numeric(14,3),
  weight_required_kg numeric(14,3),
  notes text
);

-- =========================
-- LOTES
-- Cada pacote produzido ou material comprado pode virar lote.
-- =========================

create table if not exists batches (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id),
  current_location_id uuid references locations(id),

  batch_code text not null unique,
  origin_type text not null default 'manual',
  status text not null default 'available',

  quantity numeric(14,3) not null default 0,
  weight_kg numeric(14,3),

  produced_at timestamptz,
  received_at timestamptz,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- MOVIMENTAÇÕES DE ESTOQUE
-- Compra, produção, consumo, transferência, venda, ajuste, inventário.
-- =========================

create table if not exists stock_movements (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid references batches(id),
  material_id uuid not null references materials(id),

  movement_type text not null check (
    movement_type in (
      'purchase_in',
      'production_in',
      'production_out',
      'transfer_out',
      'transfer_in',
      'sale_out',
      'adjustment',
      'inventory'
    )
  ),

  from_location_id uuid references locations(id),
  to_location_id uuid references locations(id),

  quantity numeric(14,3) not null default 0,
  weight_kg numeric(14,3),

  document_number text,
  external_reference text,
  notes text,

  created_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- =========================
-- ORDENS DE PRODUÇÃO
-- =========================

create table if not exists production_orders (
  id uuid primary key default uuid_generate_v4(),
  target_material_id uuid not null references materials(id),
  location_id uuid references locations(id),
  machine_id uuid references machines(id),

  order_code text not null unique,
  planned_quantity numeric(14,3),
  planned_weight_kg numeric(14,3),

  status text not null default 'open',
  planned_date date,
  started_at timestamptz,
  finished_at timestamptz,

  notes text,
  created_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================
-- APONTAMENTOS DE PRODUÇÃO
-- =========================

create table if not exists production_entries (
  id uuid primary key default uuid_generate_v4(),
  production_order_id uuid references production_orders(id),
  output_material_id uuid not null references materials(id),
  output_batch_id uuid references batches(id),
  location_id uuid references locations(id),
  machine_id uuid references machines(id),

  quantity_produced numeric(14,3) not null default 0,
  weight_produced_kg numeric(14,3),
  nominal_weight_kg numeric(14,3),
  nominal_variation_percent numeric(8,3),

  started_at timestamptz,
  finished_at timestamptz,

  notes text,
  created_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists production_entry_inputs (
  id uuid primary key default uuid_generate_v4(),
  production_entry_id uuid not null references production_entries(id) on delete cascade,
  input_batch_id uuid not null references batches(id),
  input_material_id uuid not null references materials(id),

  quantity_consumed numeric(14,3),
  weight_consumed_kg numeric(14,3),

  created_at timestamptz not null default now()
);

create table if not exists production_entry_operators (
  id uuid primary key default uuid_generate_v4(),
  production_entry_id uuid not null references production_entries(id) on delete cascade,
  operator_id uuid not null references operators(id)
);

-- =========================
-- RASTREABILIDADE
-- Evento genérico para montar linha do tempo.
-- =========================

create table if not exists traceability_events (
  id uuid primary key default uuid_generate_v4(),
  batch_id uuid references batches(id),
  material_id uuid references materials(id),

  event_type text not null,
  event_title text not null,
  event_description text,

  related_stock_movement_id uuid references stock_movements(id),
  related_production_entry_id uuid references production_entries(id),

  created_by_profile_id uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- =========================
-- ÍNDICES IMPORTANTES
-- =========================

create index if not exists idx_materials_type on materials(material_type_id);
create index if not exists idx_batches_material on batches(material_id);
create index if not exists idx_batches_code on batches(batch_code);
create index if not exists idx_stock_movements_batch on stock_movements(batch_id);
create index if not exists idx_stock_movements_material on stock_movements(material_id);
create index if not exists idx_traceability_batch on traceability_events(batch_id);
create index if not exists idx_traceability_material on traceability_events(material_id);