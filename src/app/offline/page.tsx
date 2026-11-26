export const metadata = { title: "Hors ligne" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-3 px-6">
      <p className="num text-sm text-warn">Hors ligne</p>
      <h1 className="text-2xl font-semibold tracking-tight">Pas de connexion</h1>
      <p className="text-muted">Priora a besoin du réseau pour afficher vos leads : vos données ne sont volontairement pas conservées sur l&apos;appareil. Réessayez dès que la connexion revient.</p>
    </main>
  );
}
