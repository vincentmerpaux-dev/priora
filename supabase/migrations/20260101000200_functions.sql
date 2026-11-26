-- Priora : création d'organisation (atomique) et cohérence des données

-- Un utilisateur authentifié crée son organisation et en devient admin.
-- SECURITY DEFINER car le RLS interdit d'insérer dans "organizations" / "members" directement.
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Authentification requise' using errcode = '28000';
  end if;
  if exists (select 1 from public.members where user_id = v_uid) then
    raise exception 'Ce compte appartient déjà à une organisation' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = v_uid;

  insert into public.organizations (name, slug) values (trim(p_name), lower(trim(p_slug))) returning id into v_org;
  insert into public.members (org_id, user_id, role, email) values (v_org, v_uid, 'admin', v_email);
  insert into public.icp_config (org_id) values (v_org);
  insert into public.lead_sources (org_id, type, label, enabled) values
    (v_org, 'formulaire', 'Formulaire public', true),
    (v_org, 'webhook', 'Webhook', true),
    (v_org, 'csv', 'Import CSV', true),
    (v_org, 'saisie', 'Saisie manuelle', true),
    (v_org, 'email', 'Email entrant', false),
    (v_org, 'crm', 'CRM', false);
  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- Le lead et ses enfants doivent appartenir à la même organisation (empêche un org_id incohérent).
create or replace function public.enforce_child_org()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.leads l where l.id = new.lead_id and l.org_id = new.org_id) then
    raise exception 'org_id incohérent avec le lead' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lead_scores_org_check before insert or update on public.lead_scores
  for each row execute function public.enforce_child_org();
create trigger lead_analyses_org_check before insert or update on public.lead_analyses
  for each row execute function public.enforce_child_org();
create trigger activities_org_check before insert or update on public.activities
  for each row execute function public.enforce_child_org();
create trigger outcomes_org_check before insert or update on public.outcomes
  for each row execute function public.enforce_child_org();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();
create trigger icp_touch before update on public.icp_config for each row execute function public.touch_updated_at();
