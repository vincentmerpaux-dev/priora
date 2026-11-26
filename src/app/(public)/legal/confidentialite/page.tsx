import { LegalShell } from "@/components/app/legal";

export const metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <LegalShell title="Politique de confidentialité (modèle)">
      <section>
        <h2>1. Qui est responsable de vos données ?</h2>
        <p>
          Pour les données de prospects saisies ou collectées via Priora, le responsable de traitement est l&apos;organisation cliente qui utilise l&apos;outil ([nom, adresse, contact DPO]).
          L&apos;éditeur de Priora ([nom de l&apos;éditeur]) agit en qualité de sous-traitant au sens de l&apos;article 28 du RGPD pour ces données, et en qualité de responsable de traitement pour les données de comptes utilisateurs.
        </p>
      </section>
      <section>
        <h2>2. Données traitées</h2>
        <ul>
          <li>Données de prospects : nom, prénom, email, téléphone, entreprise, fonction, message, source du contact.</li>
          <li>Données d&apos;enrichissement publiques : informations du registre des entreprises (SIREN, effectif, activité, ville) et titre et description du site web de l&apos;entreprise.</li>
          <li>Données de compte : email, rôle, journal d&apos;activité commerciale.</li>
        </ul>
      </section>
      <section>
        <h2>3. Finalités et base légale</h2>
        <p>Qualifier et traiter les demandes entrantes, prioriser les rappels, suivre la relation commerciale. Base légale : consentement (formulaire) ou intérêt légitime de prospection B2B, à confirmer : [à valider].</p>
      </section>
      <section>
        <h2>4. Analyse par intelligence artificielle</h2>
        <p>
          Pour produire la fiche d&apos;appel, le contenu d&apos;un lead (message, fonction, entreprise) peut être transmis au fournisseur de modèle d&apos;IA (Anthropic). Aucune décision n&apos;est prise de façon entièrement automatisée : le score et le verdict sont des aides à la décision. [Préciser les garanties de transfert hors UE.]
        </p>
      </section>
      <section>
        <h2>5. Durée de conservation</h2>
        <p>[Durée à définir, par exemple 3 ans après le dernier contact pour les prospects, avec suppression ou anonymisation ensuite.]</p>
      </section>
      <section>
        <h2>6. Vos droits</h2>
        <p>Accès, rectification, effacement, opposition, limitation et portabilité en écrivant à [adresse de contact]. Vous pouvez saisir la CNIL (cnil.fr) en cas de difficulté.</p>
      </section>
      <section>
        <h2>7. Sous-traitants et hébergement</h2>
        <p>Hébergement de la base : Supabase ([région à préciser]). Hébergement de l&apos;application : Vercel. IA : Anthropic. [Compléter avec les clauses contractuelles applicables.]</p>
      </section>
    </LegalShell>
  );
}
