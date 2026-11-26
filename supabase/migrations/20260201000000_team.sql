-- Priora : S2 équipe (rôles, attribution, speed-to-lead, RLS par rôle)
-- À appliquer APRES schema, rls et functions (ordre des horodatages).
-- Droits cibles (identiques à src/lib/team/permissions.ts) :
--   admin       : tout (réglages, équipe, critères, sources, clé webhook) + tout ce que fait un manager
--   manager     : voit tous les leads, réattribue, supprime, tableau de bord, bibliothèque d'objections ; réglages en lecture
--   commercial  : voit et modifie ses leads (et les leads qu'il vient de créer, tant qu'ils ne sont pas attribués) ;
--                 voit la file commune en LECTURE SEULE si org_settings.commercials_see_all est vrai
--   membre désactivé (members.active = false) : aucun accès aux données de l'organisation.

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists full_name text check (full_name is null or char_length(full_name) <= 100),
  add column if not exists active boolean not null default true,
  add column if not exists status text not null default 'active' check (status in ('active', 'invited'));

update public.members set full_name = split_part(email, '@', 1) where full_name is null and email is not null;

alter table public.leads
  add column if not exists assigned_at timestamptz,
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Les activités d'attribution rejoignent les appels, emails et notes (historique d'attribution).
alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check check (type in ('call', 'email', 'note', 'assignment'));

-- ---------------------------------------------------------------------------
-- 2. Réglages d'équipe et curseur du tour de rôle
-- ---------------------------------------------------------------------------
create table if not exists public.org_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  assignment_mode text not null default 'round_robin' check (assignment_mode in ('off', 'round_robin', 'segments')),
  assignment_rules jsonb not null default '[]'::jsonb,
  commercials_see_all boolean not null default false,
  speed_call_now_minutes integer not null default 5 check (speed_call_now_minutes between 1 and 1440),
  speed_nurture_minutes integer not null default 120 check (speed_nurture_minutes between 1 and 10080),
  updated_at timestamptz not null default now()
);

-- Dernier commercial servi par le tour de rôle. Table à part : un commercial qui saisit un lead doit pouvoir avancer
-- le curseur, alors qu'il ne peut pas modifier les réglages.
create table if not exists public.assignment_state (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  last_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.org_settings (org_id) select id from public.organizations on conflict do nothing;

alter table public.org_settings enable row level security;
alter table public.assignment_state enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Fonctions d'autorisation (SECURITY DEFINER : évitent la récursion de policies)
--    Un membre désactivé n'est plus membre pour le RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.active
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.active and m.role = any (p_roles)
  );
$$;

create or replace function public.is_org_staff(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.has_org_role(p_org, array['admin', 'manager']::public.member_role[]);
$$;

create or replace function public.org_sales_see_all(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select s.commercials_see_all from public.org_settings s where s.org_id = p_org), false);
$$;

-- Lecture : staff, propriétaire, créateur d'un lead encore non attribué, ou file commune ouverte.
create or replace function public.can_read_lead(p_lead uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead
      and public.is_org_member(l.org_id)
      and (
        public.is_org_staff(l.org_id)
        or l.owner_id = (select auth.uid())
        or (l.owner_id is null and l.created_by = (select auth.uid()))
        or public.org_sales_see_all(l.org_id)
      )
  );
$$;

-- Écriture : staff, propriétaire, ou créateur d'un lead encore non attribué.
create or replace function public.can_write_lead(p_lead uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead
      and public.is_org_member(l.org_id)
      and (
        public.is_org_staff(l.org_id)
        or l.owner_id = (select auth.uid())
        or (l.owner_id is null and l.created_by = (select auth.uid()))
      )
  );
$$;

revoke all on function public.is_org_staff(uuid), public.org_sales_see_all(uuid), public.can_read_lead(uuid), public.can_write_lead(uuid) from public, anon;
grant execute on function public.is_org_staff(uuid), public.org_sales_see_all(uuid), public.can_read_lead(uuid), public.can_write_lead(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------------
-- Membres : chacun voit son organisation ; un membre désactivé voit sa propre ligne (pour afficher "accès désactivé").
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated using (public.is_org_member(org_id));
create policy members_select_self on public.members for select to authenticated using (user_id = (select auth.uid()));
-- members_admin_write (admin seulement) reste en place : sa définition s'appuie sur has_org_role, désormais limité aux actifs.

-- Réglages d'équipe : lecture par les membres, écriture par les admins.
create policy org_settings_select on public.org_settings for select to authenticated using (public.is_org_member(org_id));
create policy org_settings_write on public.org_settings for all to authenticated
  using (public.has_org_role(org_id, array['admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin']::public.member_role[]));

create policy assignment_state_rw on public.assignment_state for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Critères et sources : admin seulement (le manager garde la lecture). Objections : admin et manager (inchangé).
drop policy if exists icp_write on public.icp_config;
create policy icp_write on public.icp_config for all to authenticated
  using (public.has_org_role(org_id, array['admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin']::public.member_role[]));

drop policy if exists sources_write on public.lead_sources;
create policy sources_write on public.lead_sources for all to authenticated
  using (public.has_org_role(org_id, array['admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin']::public.member_role[]));

-- Leads
drop policy if exists leads_select on public.leads;
drop policy if exists leads_insert on public.leads;
drop policy if exists leads_update on public.leads;
drop policy if exists leads_delete on public.leads;

create policy leads_select on public.leads for select to authenticated using (
  public.is_org_member(org_id)
  and (
    public.is_org_staff(org_id)
    or owner_id = (select auth.uid())
    or (owner_id is null and created_by = (select auth.uid()))
    or public.org_sales_see_all(org_id)
  )
);
-- Un lead naît non attribué ; l'attribution passe par assign_lead().
create policy leads_insert on public.leads for insert to authenticated
  with check (public.is_org_member(org_id) and owner_id is null and created_by = (select auth.uid()));
create policy leads_update on public.leads for update to authenticated
  using (public.is_org_member(org_id) and (public.is_org_staff(org_id) or owner_id = (select auth.uid()) or (owner_id is null and created_by = (select auth.uid()))))
  with check (public.is_org_member(org_id));
create policy leads_delete on public.leads for delete to authenticated using (public.is_org_staff(org_id));

-- Données rattachées à un lead : lecture selon can_read_lead, écriture selon can_write_lead.
drop policy if exists scores_select on public.lead_scores;
drop policy if exists scores_insert on public.lead_scores;
create policy scores_select on public.lead_scores for select to authenticated using (public.can_read_lead(lead_id));
create policy scores_insert on public.lead_scores for insert to authenticated with check (public.can_write_lead(lead_id));

drop policy if exists analyses_select on public.lead_analyses;
drop policy if exists analyses_insert on public.lead_analyses;
create policy analyses_select on public.lead_analyses for select to authenticated using (public.can_read_lead(lead_id));
create policy analyses_insert on public.lead_analyses for insert to authenticated with check (public.can_write_lead(lead_id));

drop policy if exists activities_select on public.activities;
drop policy if exists activities_insert on public.activities;
create policy activities_select on public.activities for select to authenticated using (public.can_read_lead(lead_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (public.can_write_lead(lead_id) and (author_id is null or author_id = (select auth.uid())));

drop policy if exists outcomes_select on public.outcomes;
drop policy if exists outcomes_write on public.outcomes;
create policy outcomes_select on public.outcomes for select to authenticated using (public.can_read_lead(lead_id));
create policy outcomes_write on public.outcomes for all to authenticated
  using (public.can_write_lead(lead_id)) with check (public.can_write_lead(lead_id));

-- ---------------------------------------------------------------------------
-- 5. Triggers : premier contact (speed-to-lead) et garde-fous sur le lead
-- ---------------------------------------------------------------------------
-- Première activité appel ou email = premier contact.
create or replace function public.sync_first_contact()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.type in ('call', 'email') then
    update public.leads set first_contacted_at = coalesce(first_contacted_at, new.created_at) where id = new.lead_id;
  end if;
  return new;
end;
$$;
drop trigger if exists activities_first_contact on public.activities;
create trigger activities_first_contact after insert on public.activities for each row execute function public.sync_first_contact();

-- Passage à un statut autre que "new" = premier contact ; changement d'organisation ou de propriétaire encadré.
create or replace function public.guard_lead_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.org_id <> old.org_id then
    raise exception 'org_id non modifiable' using errcode = '23514';
  end if;
  if new.status <> 'new' and new.first_contacted_at is null then
    new.first_contacted_at := now();
  end if;
  -- Le propriétaire ne change que par assign_lead() (qui pose le drapeau local) ou par la clé service role.
  if new.owner_id is distinct from old.owner_id
     and coalesce(current_setting('priora.assigning', true), '') <> '1'
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Utilisez assign_lead pour attribuer un lead' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists leads_guard on public.leads;
create trigger leads_guard before update on public.leads for each row execute function public.guard_lead_update();

-- ---------------------------------------------------------------------------
-- 6. Attribution (automatique ou manuelle) : contrôle des droits dans la base
-- ---------------------------------------------------------------------------
-- p_owner null = retirer l'attribution (staff seulement). La cible doit être un commercial actif de l'organisation.
-- Appel avec session utilisateur : staff (tout lead) ou créateur d'un lead non attribué (attribution automatique à la saisie).
-- Appel avec la clé service role (formulaire public, webhook) : p_actor facultatif.
create or replace function public.assign_lead(p_lead uuid, p_owner uuid, p_note text, p_actor uuid default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lead public.leads%rowtype;
  v_actor uuid;
begin
  select * into v_lead from public.leads where id = p_lead for update;
  if not found then
    raise exception 'Lead introuvable' using errcode = 'P0002';
  end if;

  if v_uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Authentification requise' using errcode = '28000';
    end if;
    v_actor := p_actor;
  else
    if not public.is_org_member(v_lead.org_id) then
      raise exception 'Accès refusé' using errcode = '42501';
    end if;
    v_actor := v_uid;
    if not public.is_org_staff(v_lead.org_id) then
      if p_owner is null or v_lead.owner_id is not null or v_lead.created_by is distinct from v_uid then
        raise exception 'Seul un manager peut réattribuer ce lead' using errcode = '42501';
      end if;
    end if;
  end if;

  if p_owner is not null and not exists (
    select 1 from public.members m
    where m.org_id = v_lead.org_id and m.user_id = p_owner and m.role = 'commercial' and m.active
  ) then
    raise exception 'La cible doit être un commercial actif' using errcode = '23514';
  end if;

  perform set_config('priora.assigning', '1', true);
  update public.leads
     set owner_id = p_owner, assigned_at = case when p_owner is null then null else now() end
   where id = p_lead;

  insert into public.activities (lead_id, org_id, type, content, author_id)
  values (p_lead, v_lead.org_id, 'assignment', left(coalesce(nullif(trim(p_note), ''), 'Attribution'), 4000), v_actor);
end;
$$;
revoke all on function public.assign_lead(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.assign_lead(uuid, uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Création d'organisation : ajoute le nom du membre et les réglages d'équipe par défaut
-- ---------------------------------------------------------------------------
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
  insert into public.members (org_id, user_id, role, email, full_name) values (v_org, v_uid, 'admin', v_email, split_part(coalesce(v_email, ''), '@', 1));
  insert into public.icp_config (org_id) values (v_org);
  insert into public.org_settings (org_id) values (v_org);
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

-- Défense en profondeur : aucun accès anonyme aux nouvelles tables.
revoke all on public.org_settings, public.assignment_state from anon;
