-- CATRION LINE
-- Parametros globais e especificos de perda/alerta de estoque
-- Banco alvo: Neon / PostgreSQL

create extension if not exists "uuid-ossp";

create table if not exists stock_loss_parameters (
  id boolean primary key default true,
  global_loss_percent numeric(8,3) not null default 10,
  material_loss_percents jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stock_loss_parameters_singleton check (id)
);
