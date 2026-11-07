-- Registro de accesos validados con QR (HU-06).
-- Un acceso por visita: visita_id unico garantiza el uso unico del codigo.
create table public."Accesos_QR" (
    id bigint generated always as identity primary key,
    created_at timestamptz not null default now(),
    visita_id bigint not null unique references public."Visitas"(id) on delete cascade,
    qr_code varchar not null,
    checador text
);

alter table public."Accesos_QR" enable row level security;

-- Reversa:
-- drop table public."Accesos_QR";