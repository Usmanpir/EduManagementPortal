"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatNumber } from "@/lib/format";

type Limits = { students: number | null; teachers: number | null; staff: number | null; campuses: number | null; storageMb: number | null; notificationsPerMonth: number | null };
type Plan = { id: string; key: string; name: string; description: string; priceMonthly: number; priceYearly: number; currency: string; trialDays: number; limits: Limits; features: string[]; highlighted: boolean; isCustom: boolean };

const amount = (v: number | null, unit: string, plural = `${unit}s`) => (v === null ? `Unlimited ${plural}` : `${formatNumber(v)} ${v === 1 ? unit : plural}`);
const storage = (mb: number | null) => (mb === null ? "Unlimited storage" : mb >= 1024 ? `${Math.round(mb / 1024)} GB storage` : `${mb} MB storage`);

export function PricingTable({ plans, contactEmail }: { plans: Plan[]; contactEmail: string | null }) {
  const [yearly, setYearly] = useState(false);
  const maxSaving = Math.max(0, ...plans.filter((p) => !p.isCustom && p.priceMonthly > 0).map((p) => 1 - p.priceYearly / (p.priceMonthly * 12)));

  return (
    <>
      <div className="mb-8 flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex gap-1 rounded-full border bg-card p-1">
          {[false, true].map((y) => (
            <button key={String(y)} type="button" role="radio" aria-checked={yearly === y} onClick={() => setYearly(y)} className={cn("rounded-full px-4 py-1.5 text-small font-medium", yearly === y ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {y ? `Yearly${maxSaving >= 0.05 ? ` · save up to ${Math.round(maxSaving * 100)}%` : ""}` : "Monthly"}
            </button>
          ))}
        </div>
      </div>
      <ul className={cn("grid gap-4", plans.length >= 4 ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3")}>
        {plans.map((p) => {
          const price = yearly ? p.priceYearly : p.priceMonthly;
          return (
            <li key={p.id} className={cn("relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs", p.highlighted && "border-primary shadow-md ring-1 ring-primary")}>
              {p.highlighted && (
                <Badge variant="primary" className="absolute -top-3 start-6">
                  Most popular
                </Badge>
              )}
              <h2 className="text-h3">{p.name}</h2>
              <p className="mt-1 min-h-10 text-small text-muted-foreground">{p.description}</p>
              <p className="my-5">
                {p.isCustom ? (
                  <span className="text-h1">Let&apos;s talk</span>
                ) : (
                  <>
                    <span className="tabular text-h1 whitespace-nowrap">{formatMoney(price, p.currency)}</span>
                    <span className="text-small whitespace-nowrap text-muted-foreground"> / {yearly ? "year" : "month"}</span>
                  </>
                )}
              </p>
              <Button asChild variant={p.highlighted ? "default" : "outline"} className="mb-6">
                {p.isCustom && contactEmail ? (
                  <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`${p.name} plan enquiry`)}`}>Contact us</a>
                ) : (
                  <Link href="/register">{p.isCustom ? "Start with a free trial" : p.trialDays ? `Start ${p.trialDays}-day free trial` : "Get started"}</Link>
                )}
              </Button>
              <ul className="flex flex-col gap-2 text-small">
                {[...(p.isCustom ? [] : [amount(p.limits.students, "student"), amount(p.limits.teachers, "teacher"), amount(p.limits.campuses, "campus", "campuses"), storage(p.limits.storageMb), `${p.limits.notificationsPerMonth === null ? "Unlimited" : formatNumber(p.limits.notificationsPerMonth)} messages / month`]), ...p.features].map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-center text-caption text-muted-foreground">Prices exclude applicable taxes. Paid by bank transfer against an invoice.</p>
    </>
  );
}
