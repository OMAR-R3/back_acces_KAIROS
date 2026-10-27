-- Sprint 6 (HU-05): tokens push de los dispositivos del visitante.
-- Reversa: drop table public."Dispositivos_Push";
create table
    public."Dispositivos_Push" (
        id bigint generated always as identity primary key,
        created_at timestamptz not null default now (),
        updated_at timestamptz not null default now (),
        visitante_id bigint not null references public."Visitantes" (id) on delete cascade,
        token varchar not null,
        plataforma varchar not null,
        constraint dispositivos_push_token_unico unique (token),
        constraint dispositivos_push_plataforma_valida check (plataforma in ('android', 'ios'))
    );

create index dispositivos_push_visitante_idx on public."Dispositivos_Push" (visitante_id);

alter table public."Dispositivos_Push" enable row level security;