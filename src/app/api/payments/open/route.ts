import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { openInvoices } from "@/server/modules/finance/payments";

export const GET = route({ permission: "payments.record", query: z.object({ studentId: z.uuid() }) }, async ({ ctx, query }) => ok(await openInvoices(ctx, query.studentId)));
