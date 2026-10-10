"use client";

import { AmountColumnChart } from "@/components/charts/charts";
import { formatMoney } from "@/lib/format";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function CollectionsByMonth({ data, currency }: { data: { label: string; value: number }[]; currency: string }) {
  return <AmountColumnChart name="Received" data={data} format={(v) => formatMoney(v, currency)} tickFormat={(v) => compact.format(v)} />;
}
