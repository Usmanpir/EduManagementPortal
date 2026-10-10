"use client";

import { useState } from "react";
import Link from "next/link";
import { FilePlus2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AmountColumnChart } from "@/components/charts/charts";
import { PaymentDrawer } from "@/components/finance/payment-drawer";
import { useHotkey } from "@/components/shell/shell-context";
import { formatDate, formatMoney } from "@/lib/format";

export function CollectionsChart({ data, currency }: { data: { date: string; amount: number }[]; currency: string }) {
  return <AmountColumnChart name="Collected" data={data.map((d) => ({ label: formatDate(d.date, "dayMonth"), value: d.amount }))} format={(v) => formatMoney(v, currency)} tickFormat={(v) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v)} />;
}

export function FinanceActions({ currency, today, canRecord, canInvoice }: { currency: string; today: string; canRecord: boolean; canInvoice: boolean }) {
  const [drawer, setDrawer] = useState({ open: false, key: 0 });
  const open = () => setDrawer((d) => ({ open: true, key: d.key + 1 }));
  useHotkey("n", open, canRecord);
  return (
    <>
      {canInvoice && (
        <Button variant="outline" asChild>
          <Link href="/finance/invoices?generate=1">
            <FilePlus2 /> Generate invoices
          </Link>
        </Button>
      )}
      {canRecord && (
        <Button onClick={open}>
          <Plus /> Record payment
        </Button>
      )}
      {canRecord && <PaymentDrawer key={drawer.key} open={drawer.open} onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))} currency={currency} today={today} />}
    </>
  );
}
