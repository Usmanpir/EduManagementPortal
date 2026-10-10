import { z } from "zod";
import { tabularResponse } from "@/server/export/tabular";
import { param, route } from "@/server/http/api";
import { importer } from "@/server/modules/imports/registry";

/** Downloadable template with the expected headings and one example row. */
export const GET = route({ query: z.object({ format: z.enum(["csv", "xlsx"]).default("xlsx") }) }, async ({ ctx, params, query }) => {
  const imp = importer(param(params, "type"), ctx);
  return tabularResponse([imp.example], { name: `${imp.label}-import-template`, format: query.format, headers: imp.headers });
});
