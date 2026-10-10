import type { Metadata } from "next";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import type { PlanLimits } from "@/server/modules/billing/catalog";
import { PricingTable } from "./pricing-table";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple plans for schools and colleges in Pakistan and beyond. Start with a free trial — no card needed.",
};

/** Always reflects the plans table, so prices are edited in one place (Platform → Plans). */
export const dynamic = "force-dynamic";

const FAQ = [
  { q: "Do I need a card to start?", a: "No. Every school starts on a free trial with all features. When you're ready, choose a plan and we send an invoice." },
  { q: "How do we pay?", a: "By bank transfer against an invoice. Once the payment is confirmed, your plan is activated." },
  { q: "What happens when the trial ends?", a: "You get a short grace period. After that the account becomes read-only until a plan is chosen — your data is never deleted." },
  { q: "Can we change plans later?", a: "Yes. Request a different plan from Settings → Billing at any time; changes apply from the next invoice." },
  { q: "Is our data private?", a: "Each school's data is fully separated from every other school. Parents only see their own children, and teachers only their own classes." },
];

export default async function PricingPage() {
  const plans = await db.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } });
  return (
    <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <h1 className="text-display text-balance">Simple pricing for every school</h1>
        <p className="mt-4 text-[1.0625rem] text-muted-foreground">Attendance, fees, exams, parents and reports in every plan. Pick the size that fits — start with a free trial.</p>
      </header>
      <PricingTable
        contactEmail={env.BILLING_CONTACT_EMAIL ?? null}
        plans={plans.map((p) => ({
          id: p.id,
          key: p.key,
          name: p.name,
          description: p.description,
          priceMonthly: Number(p.priceMonthly),
          priceYearly: Number(p.priceYearly),
          currency: p.currency,
          trialDays: p.trialDays,
          limits: p.limits as PlanLimits,
          features: p.features,
          highlighted: p.highlighted,
          isCustom: p.isCustom,
        }))}
      />
      <section aria-labelledby="faq" className="mx-auto mt-20 max-w-3xl">
        <h2 id="faq" className="mb-6 text-center text-h1">
          Questions
        </h2>
        <dl className="divide-y rounded-xl border bg-card">
          {FAQ.map((f) => (
            <div key={f.q} className="p-5">
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1 text-small text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
