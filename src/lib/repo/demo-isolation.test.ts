import { describe, expect, it } from "vitest";
import { DEMO_ORG_ID } from "@/lib/demo/data";
import { sandboxes } from "@/lib/demo/sandbox";
import { createDemoRepository, demoRepository } from "./demo";

/** Isolation de bout en bout au niveau du repository : ce que fait un visiteur n'est jamais visible par un autre. */
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("repository démo par visiteur (démo publique)", () => {
  it("deux visiteurs ne partagent ni leads, ni statuts, ni activités", async () => {
    const a = createDemoRepository(A);
    const b = createDemoRepository(B);
    const before = (await b.listLeads(DEMO_ORG_ID)).length;

    const created = await a.createLead(DEMO_ORG_ID, {
      orgId: DEMO_ORG_ID, firstName: "Test", lastName: "Visiteur", email: "test@isolation.example", phone: null, company: "Isolation SA",
      jobTitle: null, website: null, location: null, message: "Bonjour", source: "saisie", sourceDetail: null, enrichment: null,
    });
    await a.updateLeadStatus(DEMO_ORG_ID, created.id, "contacted");
    await a.addActivity(DEMO_ORG_ID, created.id, "note", "note du visiteur A", null);

    expect((await a.listLeads(DEMO_ORG_ID)).length).toBe(before + 1);
    expect((await b.listLeads(DEMO_ORG_ID)).length).toBe(before);
    expect(await b.getLeadDetail(DEMO_ORG_ID, created.id)).toBeNull();
    // Le jeu partagé du mode démo local n'est pas touché non plus.
    expect((await demoRepository.listLeads(DEMO_ORG_ID)).some((l) => l.id === created.id)).toBe(false);
  });

  it("la réinitialisation ne concerne que le visiteur qui la demande", async () => {
    const a = createDemoRepository(A);
    const b = createDemoRepository(B);
    const lead = (await a.listLeads(DEMO_ORG_ID)).find((l) => l.id.startsWith("00000000-0000-4000-8000-"))!;
    await a.updateLeadStatus(DEMO_ORG_ID, lead.id, "lost");
    await b.updateLeadStatus(DEMO_ORG_ID, lead.id, "won");
    sandboxes().reset(A);
    expect((await a.listLeads(DEMO_ORG_ID)).find((l) => l.id === lead.id)?.status).toBe(lead.status);
    expect((await b.listLeads(DEMO_ORG_ID)).find((l) => l.id === lead.id)?.status).toBe("won");
  });

  it("annonce le bac à sable comme périmètre (isole aussi le faux HubSpot)", () => {
    expect(createDemoRepository(A).scope).toBe(A);
    expect(demoRepository.scope).toBeUndefined();
  });
});
