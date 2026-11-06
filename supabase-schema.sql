-- ============================================================================
-- BASE DE DATOS DEL SISTEMA DE TRAZABILIDAD - LAB. INGENIERÍA DE MÉTODOS
-- Ejecutar UNA sola vez en Supabase: menú "SQL Editor" -> "New query" -> Run
-- ============================================================================

-- 1) Estado vivo de la línea (1 sola fila: id = 'actual')
create table if not exists public.lab_estado (
  id            text primary key,
  sesion_clave  text,
  state         jsonb not null,
  updated_at    timestamptz not null default now()
);

-- 2) Una fila por cada simulación / práctica realizada
create table if not exists public.lab_sesiones (
  sesion_clave            text primary key,
  sesion_id               text,
  nombre                  text,
  estado                  text,
  creada_en               timestamptz,
  inicio_produccion       timestamptz,
  total_terminados        integer default 0,
  terminados_por_producto jsonb,
  state                   jsonb,
  updated_at              timestamptz not null default now()
);

-- 3) Bitácora completa de eventos (cada toque de cada operario)
create table if not exists public.lab_eventos (
  sesion_clave     text not null,
  id               text not null,
  ts               timestamptz,
  operario_id      text,
  operario_nombre  text,
  area             text,
  tipo_accion      text,
  etiqueta         text,
  cantidad         numeric,
  ciclo_seg        numeric,
  origen           text,
  destino          text,
  data             jsonb,
  primary key (sesion_clave, id)
);
create index if not exists idx_lab_eventos_sesion_ts on public.lab_eventos (sesion_clave, ts);

-- 4) Productos terminados (EST-001, PLUS-001, N-EST-001, N-PLUS-001...)
create table if not exists public.lab_productos (
  sesion_clave         text not null,
  id                   text not null,
  tipo                 text,
  nombre_producto      text,
  terminado_en         timestamptz,
  lead_time_seg        numeric,
  operario_ensamblado  text,
  pedido_destino       text,
  uso_amortiguador     boolean default false,
  data                 jsonb,
  primary key (sesion_clave, id)
);

-- 5) Pedidos del docente (PED-DOC-01...) incluyendo la nota dictada por voz
create table if not exists public.lab_pedidos (
  sesion_clave             text not null,
  id                       text not null,
  nombre                   text,
  estado                   text,
  creado_en                timestamptz,
  completado_en            timestamptz,
  tiempo_cumplimiento_seg  numeric,
  resumen                  text,
  nota_voz                 text,
  data                     jsonb,
  updated_at               timestamptz not null default now(),
  primary key (sesion_clave, id)
);

-- Seguridad: se activa RLS sin políticas públicas.
-- Solo el servidor (con la clave secreta "service_role") puede leer/escribir.
alter table public.lab_estado    enable row level security;
alter table public.lab_sesiones  enable row level security;
alter table public.lab_eventos   enable row level security;
alter table public.lab_productos enable row level security;
alter table public.lab_pedidos   enable row level security;
