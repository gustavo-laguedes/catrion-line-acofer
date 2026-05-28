-- Catrion Line - baseline oficial do schema homolog
--
-- Gerado a partir do schema REAL do Neon homolog.
-- Projeto Neon: catrion-line-acofer (red-glade-95874316).
-- Branch Neon: homolog (br-dawn-mode-acmkbxm9).
-- Banco: neondb.
-- PostgreSQL: PostgreSQL 17.10 (6a49db4) on x86_64-pc-linux-gnu, compiled by gcc (Debian 12.2.0-14+deb12u1) 12.2.0, 64-bit.
--
-- As migrations antigas neste diretorio sao historicas e podem estar defasadas.
-- NAO aplicar 001_core.sql em ambientes atuais.
-- Futuras mudancas devem ser migrations incrementais depois desta baseline.
-- Aplicar este arquivo somente em banco vazio/recem-criado.
-- Este baseline nao e idempotente para bancos que ja tenham estes objetos:
-- CREATE TABLE, ADD CONSTRAINT, CREATE INDEX e CREATE TRIGGER podem falhar
-- se objetos equivalentes ja existirem.
--
-- Observacao: este arquivo representa o estado estrutural atual do homolog;
-- nao corrige nomes, duplicidades ou decisoes historicas do schema.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;
SET search_path = public, pg_catalog;

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "plpgsql" WITH SCHEMA "pg_catalog";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";

-- Schemas
-- Only schema public is present in this baseline.

-- Functions
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.show_db_tree()
 RETURNS TABLE(tree_structure text)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- First show all databases
    RETURN QUERY
    SELECT ':file_folder: ' || datname || ' (DATABASE)'
    FROM pg_database 
    WHERE datistemplate = false;

    -- Then show current database structure
    RETURN QUERY
    WITH RECURSIVE 
    -- Get schemas
    schemas AS (
        SELECT 
            n.nspname AS object_name,
            1 AS level,
            n.nspname AS path,
            'SCHEMA' AS object_type
        FROM pg_namespace n
        WHERE n.nspname NOT LIKE 'pg_%' 
        AND n.nspname != 'information_schema'
    ),

    -- Get all objects (tables, views, functions, etc.)
    objects AS (
        SELECT 
            c.relname AS object_name,
            2 AS level,
            s.path || ' → ' || c.relname AS path,
            CASE c.relkind
                WHEN 'r' THEN 'TABLE'
                WHEN 'v' THEN 'VIEW'
                WHEN 'm' THEN 'MATERIALIZED VIEW'
                WHEN 'i' THEN 'INDEX'
                WHEN 'S' THEN 'SEQUENCE'
                WHEN 'f' THEN 'FOREIGN TABLE'
            END AS object_type
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN schemas s ON n.nspname = s.object_name
        WHERE c.relkind IN ('r','v','m','i','S','f')

        UNION ALL

        SELECT 
            p.proname AS object_name,
            2 AS level,
            s.path || ' → ' || p.proname AS path,
            'FUNCTION' AS object_type
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        JOIN schemas s ON n.nspname = s.object_name
    ),

    -- Combine schemas and objects
    combined AS (
        SELECT * FROM schemas
        UNION ALL
        SELECT * FROM objects
    )

    -- Final output with tree-like formatting
    SELECT 
        REPEAT('    ', level) || 
        CASE 
            WHEN level = 1 THEN '└── :open_file_folder: '
            ELSE '    └── ' || 
                CASE object_type
                    WHEN 'TABLE' THEN ':bar_chart: '
                    WHEN 'VIEW' THEN ':eye: '
                    WHEN 'MATERIALIZED VIEW' THEN ':newspaper: '
                    WHEN 'FUNCTION' THEN ':zap: '
                    WHEN 'INDEX' THEN ':mag: '
                    WHEN 'SEQUENCE' THEN ':1234: '
                    WHEN 'FOREIGN TABLE' THEN ':globe_with_meridians: '
                    ELSE ''
                END
        END || object_name || ' (' || object_type || ')'
    FROM combined
    ORDER BY path;
END;
$function$;

-- Tables
CREATE TABLE "public"."app_settings" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "setting_key" text NOT NULL,
    "setting_value" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."expedition_lots" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "expedition_material_id" uuid NOT NULL,
    "lot_id" uuid NOT NULL,
    "lot_code" text NOT NULL,
    "location_id" uuid,
    "primary_quantity" numeric(14,6) NOT NULL,
    "primary_unit" text,
    "secondary_quantity" numeric(14,6),
    "secondary_unit" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."expedition_material_parameters" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "material_id" uuid NOT NULL,
    "can_be_shipped" boolean DEFAULT true NOT NULL,
    "requires_certificate" boolean DEFAULT false NOT NULL,
    "auto_print_certificate" boolean DEFAULT false NOT NULL,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."expedition_materials" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "expedition_order_id" uuid NOT NULL,
    "material_id" uuid,
    "material_code" text,
    "material_name" text NOT NULL,
    "sequence" integer DEFAULT 1 NOT NULL
);

CREATE TABLE "public"."expedition_orders" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "expedition_id" uuid NOT NULL,
    "order_number" text NOT NULL,
    "notes" text,
    "sequence" integer DEFAULT 1 NOT NULL
);

CREATE TABLE "public"."expedition_vehicles" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "name" text NOT NULL,
    "plate" text NOT NULL,
    "type" text NOT NULL,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."expeditions" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "date_time" timestamp with time zone DEFAULT now() NOT NULL,
    "location_id" uuid,
    "vehicle_id" text,
    "vehicle_name" text,
    "status" text DEFAULT 'Processado'::text NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."laboratory_tests" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "lot_id" uuid NOT NULL,
    "material_id" uuid,
    "material_type_id" uuid,
    "supplier_id" uuid,
    "technical_parameter_id" uuid,
    "test_date" date NOT NULL,
    "tested_at" timestamp with time zone DEFAULT now() NOT NULL,
    "nominal_value" numeric,
    "nominal_unit" text,
    "measured_specific_weight" numeric,
    "variation_percent" numeric,
    "tolerance_min_percent" numeric,
    "tolerance_max_percent" numeric,
    "apparent_diameter" numeric,
    "yield_strength_le" numeric,
    "tensile_strength_lr" numeric,
    "ratio_lr_le" numeric,
    "certificate_code" text,
    "supplier_certificate_number" text,
    "certificate_file_name" text NOT NULL,
    "certificate_file_url" text,
    "status" text DEFAULT 'Aprovado'::text NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "canceled_at" timestamp with time zone,
    "cancel_reason" text,
    "elongation_percent" numeric
);

CREATE TABLE "public"."locations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "type" text NOT NULL,
    "sale" boolean DEFAULT false NOT NULL,
    "production" boolean DEFAULT false NOT NULL,
    "storage" boolean DEFAULT true NOT NULL,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."lot_events" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lot_id" uuid NOT NULL,
    "event_type" text NOT NULL,
    "event_date" timestamp with time zone DEFAULT now() NOT NULL,
    "reference_type" text,
    "reference_id" uuid,
    "location_id" uuid,
    "quantity" numeric(14,4),
    "secondary_quantity" numeric(14,4),
    "unit" text,
    "secondary_unit" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."lot_links" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "parent_lot_id" uuid NOT NULL,
    "child_lot_id" uuid NOT NULL,
    "production_id" uuid,
    "link_type" text DEFAULT 'TRANSFORMATION'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."lots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lot_code" text NOT NULL,
    "material_id" uuid NOT NULL,
    "origin_type" text NOT NULL,
    "origin_id" uuid,
    "supplier_lot_code" text,
    "production_date" date,
    "current_location_id" uuid,
    "status" text DEFAULT 'Disponível'::text NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "supplier_certificate_number" text
);

CREATE TABLE "public"."machines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "lot_code" text,
    "resource_type" text,
    "default_location_id" uuid,
    "notes" text,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."material_allowed_locations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "material_id" uuid NOT NULL,
    "location_id" uuid NOT NULL
);

CREATE TABLE "public"."material_production_machines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "material_id" uuid NOT NULL,
    "machine_id" uuid NOT NULL
);

CREATE TABLE "public"."material_production_model_inputs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "production_model_id" uuid NOT NULL,
    "material_id" uuid NOT NULL,
    "quantity" numeric(14,4),
    "unit" text,
    "secondary_quantity" numeric(14,4),
    "secondary_unit" text,
    "notes" text,
    "input_material_id" uuid,
    "consumption_mode" text DEFAULT 'Fixo'::text NOT NULL
);

CREATE TABLE "public"."material_production_models" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "material_id" uuid NOT NULL,
    "name" text NOT NULL,
    "output_quantity" numeric(14,4),
    "output_unit" text,
    "source_location_id" uuid,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."material_recommended_operators" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "material_id" uuid NOT NULL,
    "operator_id" uuid NOT NULL
);

CREATE TABLE "public"."material_types" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."materials" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "material_type_id" uuid,
    "lot_code" text,
    "unit" text DEFAULT 'un'::text NOT NULL,
    "secondary_unit" text,
    "secondary_unit_mode" text DEFAULT 'manual'::text NOT NULL,
    "fixed_primary_quantity" numeric(14,4),
    "fixed_secondary_quantity" numeric(14,4),
    "can_be_purchased" boolean DEFAULT false NOT NULL,
    "can_be_produced" boolean DEFAULT false NOT NULL,
    "controls_min_stock" boolean DEFAULT false NOT NULL,
    "min_stock" numeric(14,4),
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "primary_unit" text DEFAULT 'un'::text NOT NULL,
    "controls_minimum_stock" boolean DEFAULT false NOT NULL,
    "minimum_stock_quantity" numeric(14,3),
    "purchasable" boolean DEFAULT false NOT NULL,
    "producible" boolean DEFAULT false NOT NULL,
    "traceable" boolean DEFAULT true NOT NULL,
    "notes" text
);

CREATE TABLE "public"."operator_roles" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."operators" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "role" text,
    "default_location_id" uuid,
    "notes" text,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."production_consumed_lots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "production_id" uuid NOT NULL,
    "lot_id" uuid NOT NULL,
    "quantity" numeric(14,4) NOT NULL,
    "unit" text NOT NULL,
    "secondary_quantity" numeric(14,4),
    "secondary_unit" text
);

CREATE TABLE "public"."production_operators" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "production_id" uuid NOT NULL,
    "operator_id" uuid NOT NULL
);

CREATE TABLE "public"."production_output_lots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "production_id" uuid NOT NULL,
    "lot_id" uuid NOT NULL,
    "lot_code" text NOT NULL,
    "quantity" numeric(14,4) NOT NULL,
    "unit" text NOT NULL,
    "secondary_quantity" numeric(14,4),
    "secondary_unit" text
);

CREATE TABLE "public"."productions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "production_date" date NOT NULL,
    "material_id" uuid NOT NULL,
    "production_model_id" uuid,
    "machine_id" uuid,
    "location_id" uuid,
    "consumed_lot_id" uuid,
    "status" text DEFAULT 'Processado'::text NOT NULL,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."stock_balances" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "lot_id" uuid NOT NULL,
    "material_id" uuid NOT NULL,
    "location_id" uuid NOT NULL,
    "quantity" numeric(14,4) DEFAULT 0 NOT NULL,
    "secondary_quantity" numeric(14,4),
    "unit" text NOT NULL,
    "secondary_unit" text,
    "status" text DEFAULT 'Disponível'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."stock_loss_parameters" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "global_loss_percent" numeric(10,2) DEFAULT 10 NOT NULL,
    "material_loss_percents" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "is_global" boolean DEFAULT true NOT NULL,
    "status" text DEFAULT 'ACTIVE'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."stock_movement_items" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "movement_id" uuid NOT NULL,
    "material_id" uuid NOT NULL,
    "quantity" numeric(14,4) NOT NULL,
    "unit" text NOT NULL,
    "secondary_quantity" numeric(14,4),
    "secondary_unit" text,
    "notes" text
);

CREATE TABLE "public"."stock_movement_lots" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "movement_item_id" uuid NOT NULL,
    "lot_id" uuid,
    "lot_code" text NOT NULL,
    "quantity" numeric(14,4) NOT NULL,
    "secondary_quantity" numeric(14,4),
    "current_location_id" uuid,
    "destination_location_id" uuid,
    "notes" text,
    "supplier_certificate_number" text
);

CREATE TABLE "public"."stock_movements" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "movement_type" text NOT NULL,
    "movement_date" timestamp with time zone DEFAULT now() NOT NULL,
    "status" text DEFAULT 'Processado'::text NOT NULL,
    "origin_location_id" uuid,
    "destination_location_id" uuid,
    "supplier_id" uuid,
    "document_number" text,
    "notes" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "supplier_certificate_number" text
);

CREATE TABLE "public"."suppliers" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "document" text,
    "contact" text,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "public"."technical_parameters" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "material_id" uuid,
    "unit" text,
    "base_value" numeric(14,6),
    "tolerance_mode" text,
    "min_tolerance_percent" numeric(10,4),
    "min_tolerance_number" numeric(14,6),
    "max_tolerance_percent" numeric(10,4),
    "max_tolerance_number" numeric(14,6),
    "notes" text,
    "status" text DEFAULT 'Ativo'::text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Constraints
-- Primary keys
ALTER TABLE ONLY "public"."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."expedition_lots" ADD CONSTRAINT "expedition_lots_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."expedition_material_parameters" ADD CONSTRAINT "expedition_material_parameters_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."expedition_materials" ADD CONSTRAINT "expedition_materials_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."expedition_orders" ADD CONSTRAINT "expedition_orders_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."expedition_vehicles" ADD CONSTRAINT "expedition_vehicles_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."expeditions" ADD CONSTRAINT "expeditions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."laboratory_tests" ADD CONSTRAINT "laboratory_tests_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."locations" ADD CONSTRAINT "locations_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lot_events" ADD CONSTRAINT "lot_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lot_links" ADD CONSTRAINT "lot_links_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."lots" ADD CONSTRAINT "lots_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."machines" ADD CONSTRAINT "machines_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."material_allowed_locations" ADD CONSTRAINT "material_allowed_locations_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."material_production_machines" ADD CONSTRAINT "material_production_machines_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."material_production_model_inputs" ADD CONSTRAINT "material_production_model_inputs_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."material_production_models" ADD CONSTRAINT "material_production_models_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."material_recommended_operators" ADD CONSTRAINT "material_recommended_operators_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."material_types" ADD CONSTRAINT "material_types_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."materials" ADD CONSTRAINT "materials_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."operator_roles" ADD CONSTRAINT "operator_roles_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."operators" ADD CONSTRAINT "operators_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."production_consumed_lots" ADD CONSTRAINT "production_consumed_lots_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."production_operators" ADD CONSTRAINT "production_operators_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."production_output_lots" ADD CONSTRAINT "production_output_lots_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."productions" ADD CONSTRAINT "productions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."stock_balances" ADD CONSTRAINT "stock_balances_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."stock_loss_parameters" ADD CONSTRAINT "stock_loss_parameters_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."stock_movement_items" ADD CONSTRAINT "stock_movement_items_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."stock_movement_lots" ADD CONSTRAINT "stock_movement_lots_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."stock_movements" ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."suppliers" ADD CONSTRAINT "suppliers_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY "public"."technical_parameters" ADD CONSTRAINT "technical_parameters_pkey" PRIMARY KEY (id);

-- Unique constraints
ALTER TABLE ONLY "public"."app_settings" ADD CONSTRAINT "app_settings_setting_key_key" UNIQUE (setting_key);
ALTER TABLE ONLY "public"."expedition_material_parameters" ADD CONSTRAINT "expedition_material_parameters_material_id_key" UNIQUE (material_id);
ALTER TABLE ONLY "public"."laboratory_tests" ADD CONSTRAINT "laboratory_tests_certificate_code_key" UNIQUE (certificate_code);
ALTER TABLE ONLY "public"."locations" ADD CONSTRAINT "locations_code_key" UNIQUE (code);
ALTER TABLE ONLY "public"."lot_links" ADD CONSTRAINT "lot_links_parent_lot_id_child_lot_id_production_id_key" UNIQUE (parent_lot_id, child_lot_id, production_id);
ALTER TABLE ONLY "public"."lots" ADD CONSTRAINT "lots_lot_code_key" UNIQUE (lot_code);
ALTER TABLE ONLY "public"."machines" ADD CONSTRAINT "machines_code_key" UNIQUE (code);
ALTER TABLE ONLY "public"."material_allowed_locations" ADD CONSTRAINT "material_allowed_locations_material_id_location_id_key" UNIQUE (material_id, location_id);
ALTER TABLE ONLY "public"."material_production_machines" ADD CONSTRAINT "material_production_machines_material_id_machine_id_key" UNIQUE (material_id, machine_id);
ALTER TABLE ONLY "public"."material_recommended_operators" ADD CONSTRAINT "material_recommended_operators_material_id_operator_id_key" UNIQUE (material_id, operator_id);
ALTER TABLE ONLY "public"."material_types" ADD CONSTRAINT "material_types_code_key" UNIQUE (code);
ALTER TABLE ONLY "public"."materials" ADD CONSTRAINT "materials_code_key" UNIQUE (code);
ALTER TABLE ONLY "public"."operator_roles" ADD CONSTRAINT "operator_roles_name_key" UNIQUE (name);
ALTER TABLE ONLY "public"."operators" ADD CONSTRAINT "operators_code_key" UNIQUE (code);
ALTER TABLE ONLY "public"."production_operators" ADD CONSTRAINT "production_operators_production_id_operator_id_key" UNIQUE (production_id, operator_id);
ALTER TABLE ONLY "public"."production_output_lots" ADD CONSTRAINT "production_output_lots_lot_code_key" UNIQUE (lot_code);
ALTER TABLE ONLY "public"."stock_balances" ADD CONSTRAINT "stock_balances_lot_id_location_id_key" UNIQUE (lot_id, location_id);
ALTER TABLE ONLY "public"."technical_parameters" ADD CONSTRAINT "technical_parameters_code_key" UNIQUE (code);

-- Check constraints
ALTER TABLE ONLY "public"."expedition_material_parameters" ADD CONSTRAINT "expedition_material_parameters_status_check" CHECK (status = ANY (ARRAY['Ativo'::text, 'Inativo'::text]));
ALTER TABLE ONLY "public"."expedition_vehicles" ADD CONSTRAINT "expedition_vehicles_status_check" CHECK (status = ANY (ARRAY['Ativo'::text, 'Inativo'::text]));
ALTER TABLE ONLY "public"."expeditions" ADD CONSTRAINT "expeditions_status_check" CHECK (status = ANY (ARRAY['Processado'::text, 'Cancelado'::text, 'Reprocessado'::text]));
ALTER TABLE ONLY "public"."machines" ADD CONSTRAINT "machines_lot_code_length" CHECK (lot_code IS NULL OR char_length(lot_code) = 5);
ALTER TABLE ONLY "public"."materials" ADD CONSTRAINT "materials_lot_code_length" CHECK (lot_code IS NULL OR char_length(lot_code) = 3);
ALTER TABLE ONLY "public"."materials" ADD CONSTRAINT "materials_secondary_mode_check" CHECK (secondary_unit_mode = ANY (ARRAY['manual'::text, 'fixed'::text]));

-- Foreign keys
ALTER TABLE ONLY "public"."expedition_lots" ADD CONSTRAINT "expedition_lots_expedition_material_id_fkey" FOREIGN KEY (expedition_material_id) REFERENCES expedition_materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."expedition_lots" ADD CONSTRAINT "expedition_lots_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."expedition_lots" ADD CONSTRAINT "expedition_lots_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id);
ALTER TABLE ONLY "public"."expedition_material_parameters" ADD CONSTRAINT "expedition_material_parameters_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."expedition_materials" ADD CONSTRAINT "expedition_materials_expedition_order_id_fkey" FOREIGN KEY (expedition_order_id) REFERENCES expedition_orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."expedition_materials" ADD CONSTRAINT "expedition_materials_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."expedition_orders" ADD CONSTRAINT "expedition_orders_expedition_id_fkey" FOREIGN KEY (expedition_id) REFERENCES expeditions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."expeditions" ADD CONSTRAINT "expeditions_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."laboratory_tests" ADD CONSTRAINT "laboratory_tests_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id);
ALTER TABLE ONLY "public"."laboratory_tests" ADD CONSTRAINT "laboratory_tests_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."laboratory_tests" ADD CONSTRAINT "laboratory_tests_material_type_id_fkey" FOREIGN KEY (material_type_id) REFERENCES material_types(id);
ALTER TABLE ONLY "public"."laboratory_tests" ADD CONSTRAINT "laboratory_tests_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE ONLY "public"."laboratory_tests" ADD CONSTRAINT "laboratory_tests_technical_parameter_id_fkey" FOREIGN KEY (technical_parameter_id) REFERENCES technical_parameters(id);
ALTER TABLE ONLY "public"."lot_events" ADD CONSTRAINT "lot_events_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."lot_events" ADD CONSTRAINT "lot_events_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lot_links" ADD CONSTRAINT "lot_links_child_lot_id_fkey" FOREIGN KEY (child_lot_id) REFERENCES lots(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lot_links" ADD CONSTRAINT "lot_links_parent_lot_id_fkey" FOREIGN KEY (parent_lot_id) REFERENCES lots(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."lot_links" ADD CONSTRAINT "lot_links_production_id_fkey" FOREIGN KEY (production_id) REFERENCES productions(id);
ALTER TABLE ONLY "public"."lots" ADD CONSTRAINT "lots_current_location_id_fkey" FOREIGN KEY (current_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."lots" ADD CONSTRAINT "lots_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."machines" ADD CONSTRAINT "machines_default_location_id_fkey" FOREIGN KEY (default_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."material_allowed_locations" ADD CONSTRAINT "material_allowed_locations_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_allowed_locations" ADD CONSTRAINT "material_allowed_locations_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_production_machines" ADD CONSTRAINT "material_production_machines_machine_id_fkey" FOREIGN KEY (machine_id) REFERENCES machines(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_production_machines" ADD CONSTRAINT "material_production_machines_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_production_model_inputs" ADD CONSTRAINT "material_production_model_inputs_input_material_id_fkey" FOREIGN KEY (input_material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."material_production_model_inputs" ADD CONSTRAINT "material_production_model_inputs_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."material_production_model_inputs" ADD CONSTRAINT "material_production_model_inputs_production_model_id_fkey" FOREIGN KEY (production_model_id) REFERENCES material_production_models(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_production_models" ADD CONSTRAINT "material_production_models_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_production_models" ADD CONSTRAINT "material_production_models_source_location_id_fkey" FOREIGN KEY (source_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."material_recommended_operators" ADD CONSTRAINT "material_recommended_operators_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."material_recommended_operators" ADD CONSTRAINT "material_recommended_operators_operator_id_fkey" FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."materials" ADD CONSTRAINT "materials_material_type_id_fkey" FOREIGN KEY (material_type_id) REFERENCES material_types(id);
ALTER TABLE ONLY "public"."operators" ADD CONSTRAINT "operators_default_location_id_fkey" FOREIGN KEY (default_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."production_consumed_lots" ADD CONSTRAINT "production_consumed_lots_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id);
ALTER TABLE ONLY "public"."production_consumed_lots" ADD CONSTRAINT "production_consumed_lots_production_id_fkey" FOREIGN KEY (production_id) REFERENCES productions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."production_operators" ADD CONSTRAINT "production_operators_operator_id_fkey" FOREIGN KEY (operator_id) REFERENCES operators(id);
ALTER TABLE ONLY "public"."production_operators" ADD CONSTRAINT "production_operators_production_id_fkey" FOREIGN KEY (production_id) REFERENCES productions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."production_output_lots" ADD CONSTRAINT "production_output_lots_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id);
ALTER TABLE ONLY "public"."production_output_lots" ADD CONSTRAINT "production_output_lots_production_id_fkey" FOREIGN KEY (production_id) REFERENCES productions(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."productions" ADD CONSTRAINT "productions_consumed_lot_id_fkey" FOREIGN KEY (consumed_lot_id) REFERENCES lots(id);
ALTER TABLE ONLY "public"."productions" ADD CONSTRAINT "productions_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."productions" ADD CONSTRAINT "productions_machine_id_fkey" FOREIGN KEY (machine_id) REFERENCES machines(id);
ALTER TABLE ONLY "public"."productions" ADD CONSTRAINT "productions_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."productions" ADD CONSTRAINT "productions_production_model_id_fkey" FOREIGN KEY (production_model_id) REFERENCES material_production_models(id);
ALTER TABLE ONLY "public"."stock_balances" ADD CONSTRAINT "stock_balances_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."stock_balances" ADD CONSTRAINT "stock_balances_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."stock_balances" ADD CONSTRAINT "stock_balances_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."stock_movement_items" ADD CONSTRAINT "stock_movement_items_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
ALTER TABLE ONLY "public"."stock_movement_items" ADD CONSTRAINT "stock_movement_items_movement_id_fkey" FOREIGN KEY (movement_id) REFERENCES stock_movements(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."stock_movement_lots" ADD CONSTRAINT "stock_movement_lots_current_location_id_fkey" FOREIGN KEY (current_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."stock_movement_lots" ADD CONSTRAINT "stock_movement_lots_destination_location_id_fkey" FOREIGN KEY (destination_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."stock_movement_lots" ADD CONSTRAINT "stock_movement_lots_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id);
ALTER TABLE ONLY "public"."stock_movement_lots" ADD CONSTRAINT "stock_movement_lots_movement_item_id_fkey" FOREIGN KEY (movement_item_id) REFERENCES stock_movement_items(id) ON DELETE CASCADE;
ALTER TABLE ONLY "public"."stock_movements" ADD CONSTRAINT "stock_movements_destination_location_id_fkey" FOREIGN KEY (destination_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."stock_movements" ADD CONSTRAINT "stock_movements_origin_location_id_fkey" FOREIGN KEY (origin_location_id) REFERENCES locations(id);
ALTER TABLE ONLY "public"."stock_movements" ADD CONSTRAINT "stock_movements_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE ONLY "public"."technical_parameters" ADD CONSTRAINT "technical_parameters_material_id_fkey" FOREIGN KEY (material_id) REFERENCES materials(id);
-- Indexes not backed by table constraints
CREATE INDEX idx_expedition_lots_material ON public.expedition_lots USING btree (expedition_material_id);
CREATE INDEX idx_expedition_material_parameters_material ON public.expedition_material_parameters USING btree (material_id);
CREATE INDEX idx_expedition_materials_order ON public.expedition_materials USING btree (expedition_order_id);
CREATE INDEX idx_expedition_orders_expedition ON public.expedition_orders USING btree (expedition_id);
CREATE UNIQUE INDEX idx_expedition_vehicles_plate ON public.expedition_vehicles USING btree (upper(plate));
CREATE INDEX idx_expeditions_date_time ON public.expeditions USING btree (date_time DESC);
CREATE INDEX idx_laboratory_tests_lot ON public.laboratory_tests USING btree (lot_id);
CREATE INDEX idx_laboratory_tests_material ON public.laboratory_tests USING btree (material_id);
CREATE INDEX idx_lot_events_lot ON public.lot_events USING btree (lot_id);
CREATE INDEX idx_lot_links_child ON public.lot_links USING btree (child_lot_id);
CREATE INDEX idx_lot_links_parent ON public.lot_links USING btree (parent_lot_id);
CREATE INDEX idx_lots_code ON public.lots USING btree (lot_code);
CREATE INDEX idx_lots_location ON public.lots USING btree (current_location_id);
CREATE INDEX idx_lots_material ON public.lots USING btree (material_id);
CREATE INDEX idx_machines_lot_code ON public.machines USING btree (lot_code);
CREATE INDEX idx_material_allowed_locations_location ON public.material_allowed_locations USING btree (location_id);
CREATE INDEX idx_material_allowed_locations_material ON public.material_allowed_locations USING btree (material_id);
CREATE INDEX idx_material_production_machines_material ON public.material_production_machines USING btree (material_id);
CREATE INDEX idx_material_production_model_inputs_input_material ON public.material_production_model_inputs USING btree (input_material_id);
CREATE INDEX idx_material_production_model_inputs_model ON public.material_production_model_inputs USING btree (production_model_id);
CREATE INDEX idx_material_production_models_material ON public.material_production_models USING btree (material_id);
CREATE INDEX idx_production_models_material ON public.material_production_models USING btree (material_id);
CREATE INDEX idx_material_recommended_operators_material ON public.material_recommended_operators USING btree (material_id);
CREATE INDEX idx_materials_lot_code ON public.materials USING btree (lot_code);
CREATE INDEX idx_materials_material_type ON public.materials USING btree (material_type_id);
CREATE INDEX idx_materials_status ON public.materials USING btree (status);
CREATE INDEX idx_materials_type_id ON public.materials USING btree (material_type_id);
CREATE INDEX idx_operator_roles_name ON public.operator_roles USING btree (name);
CREATE INDEX idx_productions_date ON public.productions USING btree (production_date);
CREATE INDEX idx_productions_material ON public.productions USING btree (material_id);
CREATE INDEX idx_stock_balances_material_location ON public.stock_balances USING btree (material_id, location_id);
CREATE INDEX idx_stock_movement_items_movement ON public.stock_movement_items USING btree (movement_id);
CREATE INDEX idx_stock_movement_lots_item ON public.stock_movement_lots USING btree (movement_item_id);
CREATE INDEX idx_stock_movements_type_date ON public.stock_movements USING btree (movement_type, movement_date);
CREATE UNIQUE INDEX ux_materials_code ON public.materials USING btree (code);

-- Triggers
CREATE TRIGGER trg_app_settings_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lots_updated_at BEFORE UPDATE ON lots FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_material_production_models_updated_at BEFORE UPDATE ON material_production_models FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_material_types_updated_at BEFORE UPDATE ON material_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_materials_updated_at BEFORE UPDATE ON materials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_operator_roles_updated_at BEFORE UPDATE ON operator_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_operators_updated_at BEFORE UPDATE ON operators FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_productions_updated_at BEFORE UPDATE ON productions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stock_balances_updated_at BEFORE UPDATE ON stock_balances FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_stock_movements_updated_at BEFORE UPDATE ON stock_movements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_technical_parameters_updated_at BEFORE UPDATE ON technical_parameters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Extraction summary
-- Extensions: 3
-- Non-extension functions: 2
-- Tables: 33
-- Columns: 303
-- Constraints: 115
-- Standalone indexes: 35
-- Triggers: 14
