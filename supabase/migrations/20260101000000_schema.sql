-- Priora : schéma initial (S1)
-- Toutes les tables portent org_id : l'isolation entre organisations est assurée par le RLS (migration suivante).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Organisations et membres
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 48),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create type public.member_role as enum ('admin', 'manager', 'commercial');

create table public.members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null default 'commercial',
  email text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index members_user_idx on public.members (user_id);

-- ---------------------------------------------------------------------------
-- Configuration : cible idéale, critères, objections
-- ---------------------------------------------------------------------------
create table public.icp_config (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  offer text not null default '',
  ideal_customer text not null default '',
  sectors text[] not null default '{}',
  size_min integer check (size_min is null or size_min >= 0),
  size_max integer check (size_max is null or size_max >= 0),
  zones text[] not null default '{}',
  decision_roles text[] not null default '{}',
  criteria jsonb not null default '[]'::jsonb,
  personas jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.objection_library (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  objection text not null check (char_length(objection) between 3 and 400),
  response text not null check (char_length(response) between 3 and 1500),
  category text not null default 'Autre' check (char_length(category) <= 60),
  created_at timestamptz not null default now()
);
create index objection_library_org_idx on public.objection_library (org_id);

-- Registre des sources de leads (activation par organisation)
create table public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('formulaire', 'webhook', 'csv', 'saisie', 'email', 'crm')),
  label text not null,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, type)
);

-- Clé webhook : seul le hash SHA-256 est conservé (la clé n'est affichée qu'une fois).
create table public.webhook_keys (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  key_hash text not null unique,
  prefix text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 100),
  last_name text not null default '' check (char_length(last_name) <= 100),
  email text not null check (char_length(email) between 5 and 254),
  phone text check (phone is null or char_length(phone) <= 40),
  company text not null default '' check (char_length(company) <= 200),
  job_title text check (job_title is null or char_length(job_title) <= 150),
  website text check (website is null or char_length(website) <= 300),
  location text check (location is null or char_length(location) <= 200),
  message text not null default '' check (char_length(message) <= 5000),
  source text not null check (source in ('formulaire', 'webhook', 'csv', 'saisie', 'email', 'crm')),
  source_detail text check (source_detail is null or char_length(source_detail) <= 200),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'won', 'lost')),
  owner_id uuid references auth.users(id) on delete set null,       -- S2 : attribution
  first_contacted_at timestamptz,                                    -- S2 : speed-to-lead
  enrichment jsonb,
  score_total smallint check (score_total is null or score_total between 0 and 100),
  verdict text check (verdict is null or verdict in ('call_now', 'nurture', 'disqualify')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_org_created_idx on public.leads (org_id, created_at desc);
create index leads_org_status_idx on public.leads (org_id, status);
create index leads_org_score_idx on public.leads (org_id, score_total desc nulls last);
create index leads_owner_idx on public.leads (owner_id) where owner_id is not null;

create table public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  total smallint not null check (total between 0 and 100),
  details jsonb not null default '[]'::jsonb,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index lead_scores_lead_idx on public.lead_scores (lead_id, created_at desc);

create table public.lead_analyses (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version >= 1),
  origin text not null check (origin in ('ai', 'rules')),
  model text,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (lead_id, version)
);
create index lead_analyses_org_origin_idx on public.lead_analyses (org_id, origin, created_at desc);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null check (type in ('call', 'email', 'note')),
  content text not null check (char_length(content) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index activities_lead_idx on public.activities (lead_id, created_at desc);

create table public.outcomes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  result text not null check (result in ('won', 'lost')),
  reason text not null default '' check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
