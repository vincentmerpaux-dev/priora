-- Priora : S3 intégrations et calibration
-- À appliquer APRES la migration S2 (20260201000000_team.sql).
-- Contenu : email entrant, intégration HubSpot (jeton chiffré côté serveur), journal de synchronisation,
-- versions de la configuration de score, notifications, motif de gain/perte structuré.
-- Droits (identiques à src/lib/team/permissions.ts) :
--   admin    : intégrations, clé d'email entrant, application et retour arrière des poids de score
--   manager  : lecture des versions de score (page Calibration), lecture du journal de synchronisation
--   chacun   : ses propres notifications

-- ---------------------------------------------------------------------------
-- 1. Résultats : motif structuré + garantie d'un outcome pour chaque lead gagné ou perdu
-- ---------------------------------------------------------------------------
alter table public.outcomes
  add column if not exists reason_code text check (reason_code is null or char_length(reason_code) <= 60);

-- Chaque passage à "won" ou "lost" crée un outcome (motif vide si l'application n'en a pas fourni).
create or replace function public.ensure_outcome()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.status in ('won', 'lost') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    insert into public.outcomes (lead_id, org_id, result, reason)
    values (new.id, new.org_id, new.status, '')
    on conflict (lead_id) do update set result = excluded.result;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_ensure_outcome on public.leads;
create trigger leads_ensure_outcome after insert or update of status on public.leads
  for each row execute function public.ensure_outcome();

-- Les leads déjà gagnés ou perdus avant cette migration reçoivent leur outcome manquant.
insert into public.outcomes (lead_id, org_id, result, reason)
select l.id, l.org_id, l.status, '' from public.leads l
where l.status in ('won', 'lost') and not exists (select 1 from public.outcomes o where o.lead_id = l.id)
on conflict (lead_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Activités : "inbound" = email reçu du prospect (ne compte pas comme premier contact)
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities add constraint activities_type_check
  check (type in ('call', 'email', 'note', 'assignment', 'inbound'));

-- Les sources "email" et "crm" deviennent actives.
update public.lead_sources set enabled = true where type in ('email', 'crm');

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
    (v_org, 'email', 'Email entrant', true),
    (v_org, 'crm', 'CRM', true);
  return v_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Clé d'email entrant (seul le hash SHA-256 est stocké, comme webhook_keys)
-- ---------------------------------------------------------------------------
create table if not exists public.inbound_email_keys (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  key_hash text not null unique,
  prefix text not null,
  created_at timestamptz not null default now()
);
alter table public.inbound_email_keys enable row level security;
create policy inbound_email_keys_admin on public.inbound_email_keys for all to authenticated
  using (public.has_org_role(org_id, array['admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- 4. Intégrations. Les métadonnées sont lisibles par les membres ; le jeton chiffré vit dans une table
--    SANS aucune policy : seule la clé service role (serveur) peut la lire, jamais un navigateur.
-- ---------------------------------------------------------------------------
create table if not exists public.integrations (
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('hubspot')),
  status text not null default 'connected' check (status in ('connected', 'error', 'disconnected')),
  token_hint text check (token_hint is null or char_length(token_hint) <= 8),
  simulated boolean not null default false,
  auto_push boolean not null default true,
  connected_at timestamptz,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (org_id, provider)
);
alter table public.integrations enable row level security;
create policy integrations_select on public.integrations for select to authenticated using (public.is_org_member(org_id));
create policy integrations_write on public.integrations for all to authenticated
  using (public.has_org_role(org_id, array['admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin']::public.member_role[]));

-- Jeton chiffré (AES-256-GCM, clé INTEGRATIONS_ENCRYPTION_KEY côté serveur). RLS activé, volontairement aucune policy.
create table if not exists public.integration_secrets (
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('hubspot')),
  token_encrypted text not null,
  updated_at timestamptz not null default now(),
  primary key (org_id, provider)
);
alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;

-- Journal de synchronisation : lisible par le staff, alimenté par tout membre qui déclenche un envoi.
create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('hubspot')),
  direction text not null check (direction in ('push', 'pull')),
  status text not null check (status in ('success', 'error')),
  message text not null default '' check (char_length(message) <= 1000),
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sync_logs_org_created_idx on public.sync_logs (org_id, created_at desc);
alter table public.sync_logs enable row level security;
create policy sync_logs_select on public.sync_logs for select to authenticated using (public.is_org_staff(org_id));
create policy sync_logs_insert on public.sync_logs for insert to authenticated with check (public.is_org_member(org_id));

-- Lien lead <-> contact et transaction du CRM (pour mettre à jour plutôt que recréer).
create table if not exists public.crm_links (
  lead_id uuid not null references public.leads(id) on delete cascade,
  provider text not null check (provider in ('hubspot')),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id text,
  deal_id text,
  updated_at timestamptz not null default now(),
  primary key (lead_id, provider)
);
alter table public.crm_links enable row level security;
create policy crm_links_select on public.crm_links for select to authenticated using (public.can_read_lead(lead_id));
create policy crm_links_write on public.crm_links for all to authenticated
  using (public.can_write_lead(lead_id)) with check (public.can_write_lead(lead_id));

-- ---------------------------------------------------------------------------
-- 5. Versions de la configuration de score
-- ---------------------------------------------------------------------------
create table if not exists public.score_config_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version >= 1),
  criteria jsonb not null,
  source text not null check (source in ('initial', 'manual', 'suggestion', 'restore')),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, version)
);
alter table public.score_config_versions enable row level security;
-- Lecture : staff (le manager consulte la page Calibration). Écriture : uniquement via add_score_version (admin).
create policy score_versions_select on public.score_config_versions for select to authenticated using (public.is_org_staff(org_id));

create or replace function public.add_score_version(p_org uuid, p_criteria jsonb, p_source text, p_note text)
returns public.score_config_versions
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.score_config_versions;
begin
  if v_uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Authentification requise' using errcode = '28000';
    end if;
  elsif not public.has_org_role(p_org, array['admin']::public.member_role[]) then
    raise exception 'Réservé aux administrateurs' using errcode = '42501';
  end if;
  if jsonb_typeof(p_criteria) <> 'array' then
    raise exception 'Critères invalides' using errcode = '22023';
  end if;
  -- Verrou par organisation : deux enregistrements simultanés ne reçoivent pas le même numéro.
  perform pg_advisory_xact_lock(hashtextextended(p_org::text, 0));
  insert into public.score_config_versions (org_id, version, criteria, source, note, created_by)
  values (
    p_org,
    coalesce((select max(version) from public.score_config_versions where org_id = p_org), 0) + 1,
    p_criteria, p_source, left(coalesce(p_note, ''), 500), v_uid
  )
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.add_score_version(uuid, jsonb, text, text) from public, anon;
grant execute on function public.add_score_version(uuid, jsonb, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Notifications (in-app). Chacun lit et marque comme lues les siennes ; la création passe par une fonction
--    qui vérifie que l'appelant et le destinataire appartiennent à la même organisation.
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('lead_assigned', 'lead_overdue', 'overdue_digest', 'sync_failed', 'lead_message')),
  title text not null check (char_length(title) <= 200),
  body text not null default '' check (char_length(body) <= 500),
  lead_id uuid references public.leads(id) on delete cascade,
  dedupe_key text not null check (char_length(dedupe_key) <= 200),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and public.is_org_member(org_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Un utilisateur ne peut modifier que read_at.
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on public.notifications from anon;

create or replace function public.create_notification(
  p_org uuid, p_user uuid, p_kind text, p_title text, p_body text, p_lead uuid, p_dedupe text
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Authentification requise' using errcode = '28000';
    end if;
  elsif not public.is_org_member(p_org) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if not exists (select 1 from public.members m where m.org_id = p_org and m.user_id = p_user and m.active) then
    raise exception 'Destinataire inconnu' using errcode = '23514';
  end if;
  insert into public.notifications (org_id, user_id, kind, title, body, lead_id, dedupe_key)
  values (p_org, p_user, p_kind, left(p_title, 200), left(coalesce(p_body, ''), 500), p_lead, p_dedupe)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;
  return v_id; -- null si la notification existait déjà
end;
$$;
revoke all on function public.create_notification(uuid, uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_notification(uuid, uuid, text, text, text, uuid, text) to authenticated, service_role;

-- Défense en profondeur : aucun accès anonyme aux nouvelles tables.
revoke all on public.inbound_email_keys, public.integrations, public.sync_logs, public.crm_links, public.score_config_versions from anon;
