-- Apply explicitly before prepare/enforced. Does not activate protection.
-- Secrets are never stored in clear text. All state is shared across instances.
begin;

create table public.lookup_challenges (
    id uuid primary key,
    correo text not null check (length(correo) <= 254),
    browser_hash text not null check (length(browser_hash) = 64),
    code_hash text not null check (length(code_hash) = 64),
    ip_hash text not null check (length(ip_hash) = 64),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '10 minutes'),
    attempts integer not null default 0 check (attempts between 0 and 5),
    used boolean not null default false
);
create index lookup_challenges_correo_created on public.lookup_challenges(correo, created_at);
create index lookup_challenges_ip_created on public.lookup_challenges(ip_hash, created_at);

create table public.lookup_sessions (
    token_hash text primary key check (length(token_hash) = 64),
    correo text not null,
    expires_at timestamptz not null default (now() + interval '15 minutes')
);
create index lookup_sessions_expiry on public.lookup_sessions(expires_at);

alter table public.lookup_challenges enable row level security;
alter table public.lookup_sessions enable row level security;
revoke all on public.lookup_challenges, public.lookup_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.lookup_challenges, public.lookup_sessions to service_role;

-- Lock both quota dimensions in a deterministic order before counting/inserting.
-- Suppression does not disclose whether a Visitantes row exists (none is queried).
create function public.lookup_issue_challenge(
    p_id uuid, p_correo text, p_browser_hash text, p_code_hash text, p_ip_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare lock_key bigint;
begin
    for lock_key in
        select distinct key from (values
            (pg_catalog.hashtextextended('lookup:correo:' || p_correo, 0)),
            (pg_catalog.hashtextextended('lookup:ip:' || p_ip_hash, 0))
        ) as locks(key) order by key
    loop
        perform pg_catalog.pg_advisory_xact_lock(lock_key);
    end loop;
    if (select count(*) from public.lookup_challenges
        where correo = p_correo and created_at > now() - interval '1 hour') >= 3
       or (select count(*) from public.lookup_challenges
        where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 10 then
        return false;
    end if;
    insert into public.lookup_challenges(id, correo, browser_hash, code_hash, ip_hash)
        values (p_id, p_correo, p_browser_hash, p_code_hash, p_ip_hash);
    return true;
end;
$$;

create function public.lookup_verify_challenge(
    p_id uuid, p_browser_hash text, p_code_hash text, p_session_hash text
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare challenge public.lookup_challenges%rowtype;
begin
    select * into challenge from public.lookup_challenges where id = p_id for update;
    if not found then return false; end if;
    if challenge.used or challenge.expires_at <= clock_timestamp() or challenge.attempts >= 5
        or challenge.browser_hash <> p_browser_hash then return false; end if;
    update public.lookup_challenges set attempts = attempts + 1 where id = p_id;
    if challenge.code_hash <> p_code_hash then return false; end if;
    update public.lookup_challenges set used = true where id = p_id;
    insert into public.lookup_sessions(token_hash, correo, expires_at)
        values (p_session_hash, challenge.correo, clock_timestamp() + interval '15 minutes');
    return true;
end;
$$;

create function public.lookup_authorize_session(p_session_hash text, p_correo text)
returns boolean language sql security invoker set search_path = '' as $$
    select exists(select 1 from public.lookup_sessions
        where token_hash = p_session_hash and correo = p_correo and expires_at > clock_timestamp());
$$;

create function public.lookup_revoke_session(p_session_hash text)
returns void language sql security invoker set search_path = '' as $$
    delete from public.lookup_sessions where token_hash = p_session_hash;
$$;

revoke all on function public.lookup_issue_challenge(uuid,text,text,text,text),
    public.lookup_verify_challenge(uuid,text,text,text), public.lookup_authorize_session(text,text),
    public.lookup_revoke_session(text) from public, anon, authenticated;
grant execute on function public.lookup_issue_challenge(uuid,text,text,text,text),
    public.lookup_verify_challenge(uuid,text,text,text), public.lookup_authorize_session(text,text),
    public.lookup_revoke_session(text) to service_role;

commit;
