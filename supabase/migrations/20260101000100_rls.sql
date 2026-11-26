-- Priora : Row Level Security
-- Principe : un membre ne voit et ne modifie que les lignes de SON organisation.
-- Les fonctions helper sont SECURITY DEFINER pour éviter la récursion de policies sur "members".

create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.members m where m.org_id = p_org and m.user_id = (select auth.uid()));
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.role = any (p_roles)
  );
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.member_role[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;

alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.icp_config enable row level security;
alter table public.objection_library enable row level security;
alter table public.lead_sources enable row level security;
alter table public.webhook_keys enable row level security;
alter table public.leads enable row level security;
alter table public.lead_scores enable row level security;
alter table public.lead_analyses enable row level security;
alter table public.activities enable row level security;
alter table public.outcomes enable row level security;

-- Organisations : lecture par les membres, modification par les admins.
-- La création passe par la fonction create_organization (voir migration suivante).
create policy org_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy org_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['admin']::public.member_role[]))
  with check (public.has_org_role(id, array['admin']::public.member_role[]));

-- Membres : chacun voit les membres de son organisation ; la gestion des équipes arrive en S2 (admin seulement).
create policy members_select on public.members for select to authenticated using (public.is_org_member(org_id));
create policy members_admin_write on public.members for all to authenticated
  using (public.has_org_role(org_id, array['admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin']::public.member_role[]));

-- Configuration : lecture par tous les membres, écriture admin / manager.
create policy icp_select on public.icp_config for select to authenticated using (public.is_org_member(org_id));
create policy icp_write on public.icp_config for all to authenticated
  using (public.has_org_role(org_id, array['admin', 'manager']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin', 'manager']::public.member_role[]));

create policy objections_select on public.objection_library for select to authenticated using (public.is_org_member(org_id));
create policy objections_write on public.objection_library for all to authenticated
  using (public.has_org_role(org_id, array['admin', 'manager']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin', 'manager']::public.member_role[]));

create policy sources_select on public.lead_sources for select to authenticated using (public.is_org_member(org_id));
create policy sources_write on public.lead_sources for all to authenticated
  using (public.has_org_role(org_id, array['admin', 'manager']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin', 'manager']::public.member_role[]));

-- Clés webhook : visibles (hash + préfixe) et modifiables par les admins uniquement.
create policy webhook_keys_admin on public.webhook_keys for all to authenticated
  using (public.has_org_role(org_id, array['admin']::public.member_role[]))
  with check (public.has_org_role(org_id, array['admin']::public.member_role[]));

-- Données commerciales : tous les membres de l'organisation (S2 restreindra les commerciaux à leurs leads).
create policy leads_select on public.leads for select to authenticated using (public.is_org_member(org_id));
create policy leads_insert on public.leads for insert to authenticated with check (public.is_org_member(org_id));
create policy leads_update on public.leads for update to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy leads_delete on public.leads for delete to authenticated
  using (public.has_org_role(org_id, array['admin', 'manager']::public.member_role[]));

create policy scores_select on public.lead_scores for select to authenticated using (public.is_org_member(org_id));
create policy scores_insert on public.lead_scores for insert to authenticated with check (public.is_org_member(org_id));

create policy analyses_select on public.lead_analyses for select to authenticated using (public.is_org_member(org_id));
create policy analyses_insert on public.lead_analyses for insert to authenticated with check (public.is_org_member(org_id));

create policy activities_select on public.activities for select to authenticated using (public.is_org_member(org_id));
create policy activities_insert on public.activities for insert to authenticated
  with check (public.is_org_member(org_id) and (author_id is null or author_id = (select auth.uid())));

create policy outcomes_select on public.outcomes for select to authenticated using (public.is_org_member(org_id));
create policy outcomes_write on public.outcomes for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Défense en profondeur : aucun accès anonyme aux tables.
revoke all on all tables in schema public from anon;
