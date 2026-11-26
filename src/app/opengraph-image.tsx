import { ImageResponse } from "next/og";

export const alt = "Priora : sachez en 10 secondes quel lead appeler, et quoi lui dire";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Image de partage générée au build, aux couleurs de Priora (Terminal nocturne, accent vert).
const C = { bg: "#0b0d10", surface: "#14171c", line: "#252a33", fg: "#e6e8eb", muted: "#8f98a6", accent: "#3dd68c", warn: "#f5a524" };

export default function Image() {
  const bars = [
    { label: "Adéquation", w: 100, color: C.accent },
    { label: "Intention", w: 83, color: C.accent },
    { label: "Timing", w: 58, color: C.warn },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, color: C.fg, padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 34 }}>
            <div style={{ width: 8, height: 15, background: C.muted, borderRadius: 2 }} />
            <div style={{ width: 8, height: 24, background: C.muted, borderRadius: 2 }} />
            <div style={{ width: 8, height: 34, background: C.accent, borderRadius: 2 }} />
          </div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Priora</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 66, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2, display: "flex", flexWrap: "wrap" }}>
              <span>Sachez quel lead appeler,&nbsp;</span>
              <span style={{ color: C.accent }}>et quoi lui dire.</span>
            </div>
            <div style={{ marginTop: 26, fontSize: 28, color: C.muted }}>Score sur 100 expliqué, script d&apos;appel, délai de rappel.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: 300, padding: 26, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
              <div style={{ fontSize: 88, fontWeight: 700, color: C.accent, lineHeight: 1 }}>82</div>
              <div style={{ fontSize: 26, color: C.muted, paddingBottom: 8 }}>/ 100</div>
            </div>
            {bars.map((b) => (
              <div key={b.label} style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
                <div style={{ fontSize: 18, color: C.muted, marginBottom: 6 }}>{b.label}</div>
                <div style={{ display: "flex", height: 9, background: "#222730", borderRadius: 3 }}>
                  <div style={{ width: `${b.w}%`, height: 9, background: b.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: C.muted }}>
          <div>Projet de démonstration · données fictives</div>
          <div style={{ color: C.accent }}>Essayer la démo, sans compte</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
