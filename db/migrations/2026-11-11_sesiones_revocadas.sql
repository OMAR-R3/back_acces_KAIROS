-- HU-7: sesiones de visitante revocadas al cerrar sesión (una fila por JWT).
create table
    if not exists public.sesiones_revocadas (
        jti uuid primary key,
        visitante_id bigint not null,
        expira_en timestamptz not null,
        revocada_en timestamptz not null default now ()
    );

create index if not exists sesiones_revocadas_expira_idx on public.sesiones_revocadas (expira_en);

alter table public.sesiones_revocadas enable row level security;

revoke all on public.sesiones_revocadas
from
    public,
    anon,
    authenticated;

grant
select
,
    insert,
    delete on public.sesiones_revocadas to service_role;