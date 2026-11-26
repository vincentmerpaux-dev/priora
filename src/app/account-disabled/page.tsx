import { signOut } from "@/app/actions/auth";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Compte désactivé" };

export default function AccountDisabledPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="mt-4 text-xl font-semibold tracking-tight">Votre accès est désactivé</h1>
      <p className="max-w-[48ch] text-[13px] text-muted">
        Un administrateur de votre organisation a désactivé votre compte. Vos données et votre historique sont conservés : contactez-le pour retrouver l&apos;accès.
      </p>
      <form action={signOut}><Button type="submit" variant="secondary">Se déconnecter</Button></form>
    </div>
  );
}
