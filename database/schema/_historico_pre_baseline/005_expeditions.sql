-- =========================
-- EXPEDIÇÃO
-- Carregamentos processados com baixa real de estoque por lote.
-- =========================

create extension if not exists "uuid-ossp";

create table if not exists expeditions (
  id uuid primary key default uuid_generate_v4(),
  date_time timestamptz not null default now(),
  location_id uuid references locations(id),
  vehicle_id text,
  vehicle_name text,
  status text not null default 'Processado' check (status in ('Processado', 'Cancelado', 'Reprocessado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expedition_orders (
  id uuid primary key default uuid_generate_v4(),
  expedition_id uuid not null references expeditions(id) on delete cascade,
  order_number text not null,
  notes text,
  sequence integer not null default 1
);

create table if not exists expedition_materials (
  id uuid primary key default uuid_generate_v4(),
  expedition_order_id uuid not null references expedition_orders(id) on delete cascade,
  material_id uuid references materials(id),
  material_code text,
  material_name text not null,
  sequence integer not null default 1
);

create table if not exists expedition_lots (
  id uuid primary key default uuid_generate_v4(),
  expedition_material_id uuid not null references expedition_materials(id) on delete cascade,
  lot_id uuid not null references lots(id),
  lot_code text not null,
  location_id uuid references locations(id),
  primary_quantity numeric(14,6) not null,
  primary_unit text,
  secondary_quantity numeric(14,6),
  secondary_unit text,
  created_at timestamptz not null default now()
);

create index if not exists idx_expeditions_date_time on expeditions(date_time desc);
create index if not exists idx_expedition_orders_expedition on expedition_orders(expedition_id);
create index if not exists idx_expedition_materials_order on expedition_materials(expedition_order_id);
create index if not exists idx_expedition_lots_material on expedition_lots(expedition_material_id);
