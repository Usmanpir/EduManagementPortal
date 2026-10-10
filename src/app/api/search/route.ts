import { z } from "zod";
import { ok, route } from "@/server/http/api";
import { globalSearch } from "@/server/modules/search/service";

const query = z.object({ q: z.string().max(100).default("") });

export const GET = route({ query }, async ({ ctx, query }) => ok(await globalSearch(ctx, query.q)));
