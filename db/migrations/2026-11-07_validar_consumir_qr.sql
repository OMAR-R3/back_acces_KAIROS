-- Requires the already applied Accesos_QR migration. Apply separately.
begin;

create function public.validate_and_consume_visit_qr(p_token text)
returns text language plpgsql security invoker set search_path = '' as $$
declare
    visit public."Visitas"%rowtype;
    scheduled_at timestamptz;
    server_now timestamptz;
    inserted_id bigint;
begin
    if p_token is null or p_token !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        return 'invalido';
    end if;

    -- INTO STRICT fails closed if legacy data contains duplicate QR tokens.
    begin
        select * into strict visit from public."Visitas"
            where qr_code = p_token for update;
    exception when no_data_found then
        return 'invalido';
    end;
    if visit.estado is distinct from 'aprobada' then return 'invalido'; end if;
    if exists(select 1 from public."Accesos_QR" where visita_id = visit.id) then
        return 'utilizado';
    end if;
    if visit.fecha is null or visit.hora_inicio is null then return 'invalido'; end if;

    scheduled_at := (visit.fecha::date + visit.hora_inicio::time) at time zone 'America/Mexico_City';
    -- Capture AFTER waiting for the row lock; transaction start time can be stale.
    server_now := clock_timestamp();
    if server_now < scheduled_at - interval '30 minutes' then return 'invalido'; end if;
    if server_now > scheduled_at + interval '30 minutes' then return 'expirado'; end if;

    -- ON CONFLICT DO NOTHING is an INSERT, never an UPSERT. Only the unique
    -- visita_id conflict is mapped to used; all other storage errors propagate.
    insert into public."Accesos_QR"(visita_id, qr_code, checador, created_at)
        values (visit.id, p_token, 'checker-api', server_now)
        on conflict (visita_id) do nothing returning id into inserted_id;
    if inserted_id is null then return 'utilizado'; end if;
    return 'valido';
end;
$$;

revoke all on function public.validate_and_consume_visit_qr(text) from public, anon, authenticated;
grant execute on function public.validate_and_consume_visit_qr(text) to service_role;
-- SECURITY INVOKER: only the backend service role has these privileges and
-- bypasses RLS. No public policy or SECURITY DEFINER privilege escalation.
grant select, update on public."Visitas" to service_role;
grant select, insert on public."Accesos_QR" to service_role;
grant usage, select on sequence public."Accesos_QR_id_seq" to service_role;

commit;
