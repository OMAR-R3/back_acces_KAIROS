-- Run only on a disposable PostgreSQL database with the migration applied.
-- All test rows are rolled back. ON_ERROR_STOP must be enabled by the caller.
begin;
do $$
declare
    challenge_id uuid := 'af37a6bc-2b53-481b-ae61-e42b14265898';
    browser text := repeat('b', 64);
    code text := repeat('c', 64);
    session text := repeat('d', 64);
    i integer;
begin
    if has_table_privilege('anon', 'public.lookup_challenges', 'select')
        or has_table_privilege('authenticated', 'public.lookup_sessions', 'select')
        or has_function_privilege('anon', 'public.lookup_authorize_session(text,text)', 'execute')
        or has_function_privilege('authenticated', 'public.lookup_verify_challenge(uuid,text,text,text)', 'execute') then
        raise exception 'Lookup state or functions exposed to public roles';
    end if;

    set local role service_role;
    if not public.lookup_issue_challenge(challenge_id, 'lookup-test@example.com', browser, code, repeat('a',64)) then
        raise exception 'First challenge denied'; end if;
    if public.lookup_verify_challenge(challenge_id, repeat('x',64), code, session) then
        raise exception 'Wrong browser accepted'; end if;
    if public.lookup_verify_challenge('00000000-0000-4000-8000-000000000000', browser, code, session) then
        raise exception 'Unknown challenge accepted'; end if;
    if not public.lookup_verify_challenge(challenge_id, browser, code, session) then
        raise exception 'Valid proof denied'; end if;
    if public.lookup_verify_challenge(challenge_id, browser, code, repeat('e',64)) then
        raise exception 'Replay accepted'; end if;
    if not public.lookup_authorize_session(session, 'lookup-test@example.com') then
        raise exception 'Session denied'; end if;
    if public.lookup_authorize_session(session, 'other@example.com') then
        raise exception 'Cross-mailbox history authorized'; end if;
    if public.lookup_authorize_session(repeat('f',64), 'lookup-test@example.com') then
        raise exception 'Unknown session accepted'; end if;
    update public.lookup_sessions set expires_at = clock_timestamp() - interval '1 second' where token_hash = session;
    if public.lookup_authorize_session(session, 'lookup-test@example.com') then
        raise exception 'Expired session accepted'; end if;
    update public.lookup_sessions set expires_at = clock_timestamp() + interval '1 minute' where token_hash = session;
    perform public.lookup_revoke_session(session);
    perform public.lookup_revoke_session(session);
    if public.lookup_authorize_session(session, 'lookup-test@example.com') then
        raise exception 'Revoked session accepted'; end if;

    -- Five wrong attempts permanently exhaust this challenge, even with correct proof later.
    update public.lookup_challenges set used = false, attempts = 0 where lookup_challenges.id = challenge_id;
    for i in 1..5 loop
        if public.lookup_verify_challenge(challenge_id, browser, repeat('x',64), session) then
            raise exception 'Wrong code accepted'; end if;
    end loop;
    if public.lookup_verify_challenge(challenge_id, browser, code, session) then
        raise exception 'Exhausted challenge accepted'; end if;
    update public.lookup_challenges set attempts = 0, expires_at = clock_timestamp() - interval '1 second'
        where lookup_challenges.id = challenge_id;
    if public.lookup_verify_challenge(challenge_id, browser, code, session) then
        raise exception 'Expired challenge accepted'; end if;

    -- Shared mailbox quota holds across IP changes.
    for i in 1..2 loop
        if not public.lookup_issue_challenge(gen_random_uuid(), 'lookup-test@example.com', browser, code, repeat(i::text,64)) then
            raise exception 'Mailbox quota exhausted too early'; end if;
    end loop;
    if public.lookup_issue_challenge(gen_random_uuid(), 'lookup-test@example.com', browser, code, repeat('9',64)) then
        raise exception 'Mailbox quota bypassed by changing IP'; end if;

    -- Shared IP quota holds across mailbox changes.
    for i in 1..10 loop
        if not public.lookup_issue_challenge(gen_random_uuid(), 'quota-' || i || '@example.com', browser, code, repeat('z',64)) then
            raise exception 'IP quota exhausted too early'; end if;
    end loop;
    if public.lookup_issue_challenge(gen_random_uuid(), 'quota-extra@example.com', browser, code, repeat('z',64)) then
        raise exception 'IP quota bypassed by changing email'; end if;
    update public.lookup_challenges set created_at = clock_timestamp() - interval '61 minutes';
    if not public.lookup_issue_challenge(gen_random_uuid(), 'quota-extra@example.com', browser, code, repeat('z',64)) then
        raise exception 'Quota did not expire'; end if;
end;
$$;
rollback;
