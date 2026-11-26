-- Priora : données de développement OPTIONNELLES (supabase db reset les applique automatiquement en local).
-- Elles sont FICTIVES et marquées is_demo = true. Ne jamais les présenter comme réelles.
-- Prérequis : avoir créé une organisation via l'application (onboarding), sinon ce script ne fait rien.
-- Les 30 leads de démonstration complets sont fournis par le mode démo de l'application (sans base).

do $$
declare
  v_org uuid;
begin
  select id into v_org from public.organizations order by created_at asc limit 1;
  if v_org is null then
    raise notice 'Aucune organisation : seed ignoré.';
    return;
  end if;

  insert into public.objection_library (org_id, objection, response, category)
  select v_org, o.objection, o.response, o.category
  from (values
    ('C''est trop cher pour nous.', 'Comparer le coût de l''offre au coût du problème actuel puis chiffrer le gain sur un cas concret.', 'Prix'),
    ('Ce n''est pas le bon moment.', 'Demander ce qui doit changer, proposer une étape légère sans engagement.', 'Timing')
  ) as o(objection, response, category)
  where not exists (select 1 from public.objection_library where org_id = v_org);

  insert into public.leads (org_id, first_name, last_name, email, phone, company, job_title, message, source, source_detail, is_demo)
  values
    (v_org, 'Camille', 'Exemple', 'camille@entreprise-fictive-1.example', '0600000001', 'Entreprise Fictive 1', 'Directrice des opérations',
     'Nous cherchons un outil de suivi, budget validé, rappel cette semaine svp.', 'formulaire', 'Demande de démo', true),
    (v_org, 'Louis', 'Exemple', 'louis@entreprise-fictive-2.example', null, 'Entreprise Fictive 2', 'Stagiaire',
     'Je cherche un stage.', 'formulaire', null, true),
    (v_org, 'Sarah', 'Exemple', 'sarah@entreprise-fictive-3.example', '0600000003', 'Entreprise Fictive 3', 'Responsable maintenance',
     'Pouvez-vous m''envoyer de la documentation ?', 'webhook', 'Formulaire site', true);
  -- Le score et l'analyse de ces leads se calculent depuis la fiche lead (bouton "Recalculer le score").
end $$;
