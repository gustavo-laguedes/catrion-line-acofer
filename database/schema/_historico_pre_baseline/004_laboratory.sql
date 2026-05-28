-- CATRION LINE
-- Laboratório v1: ensaios técnicos, certificados e vínculo por lote
-- Banco alvo: Neon / PostgreSQL

create extension if not exists "uuid-ossp";

alter table stock_movements
  add column if not exists supplier_certificate_number text;

alter table stock_movement_lots
  add column if not exists supplier_certificate_number text;

alter table lots
  add column if not exists supplier_certificate_number text;

create table if not exists laboratory_tests (
  id uuid primary key default uuid_generate_v4(),
  lot_id uuid not null references lots(id),
  material_id uuid references materials(id),
  material_type_id uuid references material_types(id),
  supplier_id uuid references suppliers(id),
  technical_parameter_id uuid references technical_parameters(id),
  test_date date not null,
  tested_at timestamptz not null default now(),
  nominal_value numeric,
  nominal_unit text,
  measured_specific_weight numeric,
  variation_percent numeric,
  tolerance_min_percent numeric,
  tolerance_max_percent numeric,
  apparent_diameter numeric,
  yield_strength_le numeric,
  tensile_strength_lr numeric,
  ratio_lr_le numeric,
  certificate_code text unique,
  supplier_certificate_number text,
  certificate_file_name text not null,
  certificate_file_url text,
  status text not null default 'Aprovado',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  canceled_at timestamptz,
  cancel_reason text,
  constraint laboratory_tests_status_check
    check (status in ('Aprovado', 'Reprovado', 'Cancelado'))
);

create index if not exists idx_laboratory_tests_lot
  on laboratory_tests(lot_id);

create index if not exists idx_laboratory_tests_material
  on laboratory_tests(material_id);

create index if not exists idx_laboratory_tests_parameter
  on laboratory_tests(technical_parameter_id);
