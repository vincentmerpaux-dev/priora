import { LegalShell } from "@/components/app/legal";

export const metadata = { title: "Conditions générales d'utilisation" };

export default function TermsPage() {
  return (
    <LegalShell title="Conditions générales d'utilisation (modèle)">
      <section>
        <h2>1. Objet</h2>
        <p>Les présentes conditions encadrent l&apos;utilisation de Priora, outil de qualification de leads entrants, fourni par [nom de l&apos;éditeur, forme juridique, adresse].</p>
      </section>
      <section>
        <h2>2. Compte et accès</h2>
        <p>L&apos;utilisateur est responsable de la confidentialité de ses identifiants et des actions réalisées depuis son compte. Chaque organisation administre ses propres membres.</p>
      </section>
      <section>
        <h2>3. Données des prospects</h2>
        <p>L&apos;organisation cliente garantit disposer d&apos;une base légale pour collecter et traiter les données de ses prospects (RGPD) et informer les personnes concernées. Les données importées ou saisies lui appartiennent.</p>
      </section>
      <section>
        <h2>4. Score et analyses IA</h2>
        <p>Les scores, verdicts et fiches d&apos;appel sont des aides à la décision fournies sans garantie de résultat. Ils peuvent contenir des erreurs et doivent être vérifiés avant toute action.</p>
      </section>
      <section>
        <h2>5. Usages interdits</h2>
        <p>Envoi de données illicites, tentative d&apos;accès aux données d&apos;une autre organisation, utilisation du webhook ou du formulaire pour du spam, contournement des limites techniques.</p>
      </section>
      <section>
        <h2>6. Disponibilité et responsabilité</h2>
        <p>[Engagements de disponibilité, limitation de responsabilité, droit applicable et juridiction compétente : à rédiger et valider par un professionnel.]</p>
      </section>
    </LegalShell>
  );
}
