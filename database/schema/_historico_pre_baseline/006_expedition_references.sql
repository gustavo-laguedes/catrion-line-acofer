-- =========================
-- EXPEDICAO - REFERENCIAS OPERACIONAIS
-- Veiculos e parametros permanentes usados nos carregamentos.
-- =========================

create extension if not exists "uuid-ossp";

create table if not exists expedition_vehicles (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plate text not null,
  type text not null,
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_expedition_vehicles_plate
  on expedition_vehicles (upper(plate));

create table if not exists expedition_material_parameters (
  id uuid primary key default uuid_generate_v4(),
  material_id uuid not null references materials(id) on delete cascade,
  can_be_shipped boolean not null default true,
  requires_certificate boolean not null default false,
  auto_print_certificate boolean not null default false,
  status text not null default 'Ativo' check (status in ('Ativo', 'Inativo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (material_id)
);

create index if not exists idx_expedition_material_parameters_material
  on expedition_material_parameters(material_id);
