import type { OrgSettings } from "@/server/modules/organizations/settings";

export type OrgTaskContext = {
  org: { id: string; name: string; timezone: string; currency: string };
  settings: OrgSettings;
  /** Local date in the organization's timezone ("YYYY-MM-DD"). */
  today: string;
  now: Date;
};

/** A task that runs once per organization per local day, from `hour` onwards. */
export type OrgTask = {
  name: string;
  hour: number;
  run: (ctx: OrgTaskContext) => Promise<void>;
};

/** A task that runs once per platform per day (UTC), e.g. subscription housekeeping. */
export type PlatformTask = {
  name: string;
  run: (now: Date) => Promise<void>;
};
