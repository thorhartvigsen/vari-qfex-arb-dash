import { ENTRY_TIERS, EXIT_TIERS, MAX_LEV, MID_PP } from "@/lib/oaiSoftbankSignal";

export default function OaiSoftbankSignalPanel() {
  return (
    <section className="space-y-3">
      <div>
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--arb-light)" }}
        >
          Signal
        </h2>
        <p className="text-sm" style={{ color: "var(--arb-text)", opacity: 0.8 }}>
          Listing-relative mid {MID_PP}% · max {MAX_LEV}× of the thinner venue ·
          rung from mid; only add size if bid/ask of that side is still past 8%
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TierTable
          title="Scale-in"
          caption="Add size when the mid is this far from 8%"
          rows={ENTRY_TIERS.map((t) => ({
            lev: t.lev,
            dist: t.distPp,
            spreads: t.spreads,
          }))}
        />
        <TierTable
          title="Take-profit"
          caption="Reduce to this leverage as the mid comes back toward 8%"
          rows={EXIT_TIERS.map((t) => ({
            lev: t.lev,
            dist: t.distPp,
            spreads: t.spreads,
          }))}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.7 }}>
        Above 8%: short OAI (hit bid) / long SoftBank (lift ask). Below 8%: long
        OAI (lift ask) / short SoftBank (hit bid). Leverage rung and TP use mids.
        Scale-in only fires if that touch is still on the same side of 8%. Legs
        paired in account dollars. Size is the gap to target, capped to paired
        book depth that stays on the correct side of 8%. Flatten / TP does not
        wait on that spread — filling both legs comes first.
      </p>
    </section>
  );
}

function TierTable({
  title,
  caption,
  rows,
}: {
  title: string;
  caption: string;
  rows: Array<{ lev: number; dist: number; spreads: string }>;
}) {
  return (
    <div
      className="overflow-hidden rounded-lg"
      style={{
        border: "1px solid var(--arb-border)",
        backgroundColor: "var(--arb-panel)",
      }}
    >
      <div className="px-3 py-2" style={{ borderBottom: "1px solid var(--arb-border)" }}>
        <p className="text-sm font-medium" style={{ color: "var(--arb-light)" }}>
          {title}
        </p>
        <p className="text-xs" style={{ color: "var(--arb-text)", opacity: 0.75 }}>
          {caption}
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr style={{ color: "var(--arb-text)", opacity: 0.75 }}>
            <th className="px-3 py-1.5 font-medium">Lev</th>
            <th className="px-3 py-1.5 font-medium">From mid</th>
            <th className="px-3 py-1.5 font-medium">Spreads</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${title}-${row.dist}-${row.lev}`}
              style={{ borderTop: "1px solid var(--arb-border)" }}
            >
              <td className="px-3 py-1.5 font-medium" style={{ color: "var(--arb-light)" }}>
                {row.lev}×
              </td>
              <td className="px-3 py-1.5" style={{ color: "var(--arb-text)" }}>
                {row.dist === 0 ? "mid" : `${row.dist} pp`}
              </td>
              <td className="px-3 py-1.5" style={{ color: "var(--arb-text)" }}>
                {row.spreads}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
