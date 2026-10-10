"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, Ellipsis, Mail, Megaphone, MessageCircle, Pencil, Pin, PinOff, Plus, Send, Smartphone, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { FormDrawer } from "@/components/common/form-drawer";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { Pagination } from "@/components/data/pagination";
import { useUrlState } from "@/components/data/use-url-state";
import { useHotkey } from "@/components/shell/shell-context";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import { AUDIENCES } from "@/lib/validation/communication";

type Row = {
  id: string;
  title: string;
  body: string;
  audience: string;
  audienceRefId: string | null;
  campusId: string | null;
  audienceLabel: string;
  channels: string[];
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isPinned: boolean;
  author: string | null;
  publishedAt: string | null;
  updatedAt: string;
  recipients: number;
  read: number;
};
type Option = { value: string; label: string };
type Options = { campuses: Option[]; classes: (Option & { campusId: string })[]; sections: (Option & { campusId: string })[]; channels: { email: boolean; sms: boolean; whatsapp: boolean } };
type Reach = { people: number; groups: { staff: number; parents: number; students: number }; inApp: number; email: number; whatsapp: number; sms: number; channelsOff: string[] };

const AUDIENCE_LABELS: Record<string, string> = { ORGANIZATION: "Everyone", CAMPUS: "Everyone on a campus", CLASS: "A class", SECTION: "A section", TEACHERS: "Teachers", STAFF: "All staff", PARENTS: "Parents", STUDENTS: "Students" };
const CHANNELS = [
  { key: "WHATSAPP", label: "WhatsApp", icon: MessageCircle, setting: "whatsapp" },
  { key: "SMS", label: "SMS", icon: Smartphone, setting: "sms" },
  { key: "EMAIL", label: "Email", icon: Mail, setting: "email" },
] as const;

type Draft = { title: string; body: string; audience: string; audienceRefId: string | null; campusId: string | null; channels: string[]; isPinned: boolean };

function Composer({ initial, id, options, orgName, onOpenChange }: { initial: Draft; id: string | null; options: Options; orgName: string; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [d, setD] = useState<Draft>(initial);
  const [reach, setReach] = useState<Reach | null>(null);
  const [reachKey, setReachKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "send" | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const patch = (p: Partial<Draft>) => setD((prev) => ({ ...prev, ...p }));
  const needsRef = d.audience === "CLASS" || d.audience === "SECTION";
  const refOptions = (d.audience === "CLASS" ? options.classes : options.sections).filter((o) => !d.campusId || o.campusId === d.campusId);
  const audienceReady = (!needsRef || !!d.audienceRefId) && (d.audience !== "CAMPUS" || !!d.campusId);
  const key = JSON.stringify([d.audience, d.audienceRefId, d.campusId, d.channels]);
  // Reach is stale until the request for the current audience returns.
  const loadingReach = audienceReady && reachKey !== key;

  useEffect(() => {
    if (!audienceReady) return;
    let active = true;
    const t = setTimeout(() => {
      api
        .post<Reach>("/api/announcements/preview", { audience: d.audience, audienceRefId: d.audienceRefId, campusId: d.campusId, channels: d.channels })
        .then(({ data }) => {
          if (!active) return;
          setReach(data);
          setReachKey(key);
        })
        .catch(() => active && setReachKey(key));
    }, 250);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [key, audienceReady, d.audience, d.audienceRefId, d.campusId, d.channels]);

  const submit = async (publish: boolean) => {
    setBusy(publish ? "send" : "draft");
    setErrors({});
    setError(null);
    try {
      const body = { ...d, publish };
      const { message } = id ? await api.put(`/api/announcements/${id}`, body) : await api.post("/api/announcements", body);
      toast.success(message);
      onOpenChange(false);
      router.push(`/communication/announcements${publish ? "" : "?status=DRAFT"}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      setConfirmSend(false);
    }
  };

  const short = `${orgName}: ${d.title || "Title"} — ${d.body || "Your message"}`;

  return (
    <FormDrawer
      open
      onOpenChange={onOpenChange}
      title={id ? "Edit announcement" : "New announcement"}
      description="Everyone in the audience sees it in the app. Choose extra channels to reach parents on their phones."
      formId="announcement-form"
      submitLabel="Send…"
      submitting={busy !== null}
      size="lg"
      footerExtra={
        <Button type="button" variant="outline" disabled={busy !== null} onClick={() => submit(false)}>
          {busy === "draft" ? "Saving…" : "Save draft"}
        </Button>
      }
    >
      <form
        id="announcement-form"
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!d.title.trim() || !d.body.trim()) {
            setErrors({ ...(d.title.trim() ? {} : { title: "Give it a short title." }), ...(d.body.trim() ? {} : { body: "Write the announcement." }) });
            return;
          }
          setConfirmSend(true);
        }}
      >
        <FormAlert>{error}</FormAlert>
        <Field label="Title" htmlFor="title" error={errors.title} required>
          <Input id="title" maxLength={120} value={d.title} onChange={(e) => patch({ title: e.target.value })} placeholder="e.g. School closed on Friday for Iqbal Day" />
        </Field>
        <Field label="Message" htmlFor="body" error={errors.body} hint={`${d.body.length}/5000`} required>
          <Textarea id="body" rows={6} maxLength={5000} value={d.body} onChange={(e) => patch({ body: e.target.value })} />
        </Field>
        <FieldRow>
          <Field label="Send to" htmlFor="audience">
            <OptionSelect id="audience" value={d.audience} onChange={(v) => patch({ audience: v ?? "ORGANIZATION", audienceRefId: null })} options={AUDIENCES.map((a) => ({ value: a, label: AUDIENCE_LABELS[a]! }))} />
          </Field>
          {(options.campuses.length > 1 || d.audience === "CAMPUS") && (
            <Field label="Campus" htmlFor="campusId" error={errors.campusId} required={d.audience === "CAMPUS"}>
              <OptionSelect id="campusId" value={d.campusId} onChange={(v) => patch({ campusId: v, audienceRefId: null })} options={options.campuses} noneLabel={d.audience === "CAMPUS" ? undefined : "All campuses"} />
            </Field>
          )}
        </FieldRow>
        {needsRef && (
          <Field label={d.audience === "CLASS" ? "Class" : "Section"} htmlFor="audienceRefId" error={errors.audienceRefId} hint="Reaches its parents, students and teachers." required>
            <OptionSelect id="audienceRefId" value={d.audienceRefId} onChange={(v) => patch({ audienceRefId: v })} options={refOptions} />
          </Field>
        )}

        <fieldset>
          <legend className="mb-2 text-small font-medium">Also send by</legend>
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const enabled = options.channels[c.setting];
              const checked = d.channels.includes(c.key);
              return (
                <label key={c.key} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-small", !enabled && "opacity-60", checked && "border-primary bg-primary-subtle/40")}>
                  <Checkbox disabled={!enabled} checked={checked} onCheckedChange={(v) => patch({ channels: v === true ? [...d.channels, c.key] : d.channels.filter((x) => x !== c.key) })} />
                  <c.icon className="size-4" aria-hidden /> {c.label}
                  {!enabled && <span className="text-caption text-muted-foreground">(off)</span>}
                </label>
              );
            })}
          </div>
          {CHANNELS.some((c) => !options.channels[c.setting]) && (
            <p className="mt-1.5 text-caption text-muted-foreground">
              Turn channels on in{" "}
              <Link href="/settings/notifications" className="font-medium text-primary hover:underline">
                Notification settings
              </Link>
              .
            </p>
          )}
        </fieldset>
        <label className="flex items-center gap-2 text-small">
          <Checkbox checked={d.isPinned} onCheckedChange={(v) => patch({ isPinned: v === true })} /> Pin to the top of the announcements page
        </label>

        <section aria-label="Reach" className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-1 flex items-center gap-1.5 text-small font-medium">
            <Users className="size-4" /> Who will get this
          </p>
          {!audienceReady ? (
            <p className="text-small text-muted-foreground">Choose the {needsRef ? (d.audience === "CLASS" ? "class" : "section") : "campus"} to see the reach.</p>
          ) : loadingReach || !reach ? (
            <Skeleton className="h-10" />
          ) : (
            <div className="text-small">
              <p>
                <span className="font-semibold tabular">{formatNumber(reach.people)}</span> people
                <span className="text-muted-foreground">
                  {" "}
                  ({[plural(reach.groups.parents, "parent"), plural(reach.groups.students, "student"), reach.groups.staff ? `${formatNumber(reach.groups.staff)} staff` : null].filter(Boolean).join(", ")})
                </span>
              </p>
              <p className="text-muted-foreground">
                {formatNumber(reach.inApp)} in the app
                {d.channels.includes("WHATSAPP") && ` · ${formatNumber(reach.whatsapp)} WhatsApp`}
                {d.channels.includes("SMS") && ` · ${formatNumber(reach.sms)} SMS`}
                {d.channels.includes("EMAIL") && ` · ${formatNumber(reach.email)} emails`}
              </p>
            </div>
          )}
        </section>

        {(d.channels.includes("WHATSAPP") || d.channels.includes("SMS")) && (
          <section aria-label="Phone message preview">
            <p className="mb-1.5 text-caption text-muted-foreground">On phones it reads:</p>
            <div className="max-w-sm rounded-2xl rounded-ss-sm bg-[#dcf8c6] px-3 py-2 text-small text-[#111] shadow-xs dark:bg-[#005c4b] dark:text-[#e9edef]">
              <p className="line-clamp-6 whitespace-pre-line">{short}</p>
            </div>
          </section>
        )}
      </form>
      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Send this announcement now?"
        description={reach ? `It goes to ${formatNumber(reach.people)} people straight away and can't be edited afterwards.` : "It goes out straight away and can't be edited afterwards."}
        confirmLabel={busy === "send" ? "Sending…" : "Send now"}
        onConfirm={() => submit(true)}
      />
    </FormDrawer>
  );
}

const plural = (n: number, word: string) => (n ? `${formatNumber(n)} ${word}${n === 1 ? "" : "s"}` : null);

const EMPTY: Draft = { title: "", body: "", audience: "ORGANIZATION", audienceRefId: null, campusId: null, channels: [], isPinned: false };

export function AnnouncementsView({ rows, total, counts, status, page, pageSize, focusId, options, canManage, orgName }: { rows: Row[]; total: number; counts: Record<string, number>; status: string; page: number; pageSize: number; focusId: string | null; options: Options | null; canManage: boolean; orgName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { set } = useUrlState();
  const [composer, setComposer] = useState<{ draft: Draft; id: string | null; key: number } | null>(canManage && searchParams.get("new") === "1" ? { draft: EMPTY, id: null, key: 0 } : null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const open = (row: Row | null) => setComposer((c) => ({ key: (c?.key ?? 0) + 1, id: row?.id ?? null, draft: row ? { title: row.title, body: row.body, audience: row.audience, audienceRefId: row.audienceRefId, campusId: row.campusId, channels: row.channels, isPinned: row.isPinned } : EMPTY }));
  useHotkey("n", () => open(null), canManage);

  useEffect(() => {
    if (focusId) document.getElementById(`a-${focusId}`)?.scrollIntoView({ block: "center" });
  }, [focusId]);

  const act = async (fn: () => Promise<{ message: string }>) => {
    try {
      toast.success((await fn()).message);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const tabs = [
    { key: "PUBLISHED", label: "Sent" },
    { key: "DRAFT", label: "Drafts" },
    { key: "ARCHIVED", label: "Archived" },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <PageHeader
        title="Announcements"
        description={canManage ? "Send notices to parents, students and staff — in the app, by WhatsApp, SMS or email." : "Notices from your school."}
        actions={
          canManage && (
            <Button onClick={() => open(null)}>
              <Plus /> New announcement
            </Button>
          )
        }
      />
      {canManage && (
        <div role="tablist" aria-label="Status" className="flex gap-1 border-b">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={status === t.key}
              onClick={() => set({ status: t.key === "PUBLISHED" ? null : t.key, page: null, id: null })}
              className={cn("-mb-px border-b-2 px-3 py-2.5 text-small font-medium", status === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {t.label}
              {counts[t.key] ? <span className="ms-1.5 text-caption text-muted-foreground tabular">{counts[t.key]}</span> : null}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={status === "DRAFT" ? "No drafts" : status === "ARCHIVED" ? "Nothing archived" : "No announcements yet"}
          description={canManage ? "Write a notice once and it reaches everyone it's meant for." : "When your school posts a notice, it will appear here."}
          actions={canManage && status !== "ARCHIVED" && <Button onClick={() => open(null)}><Plus /> New announcement</Button>}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((a) => (
            <li key={a.id} id={`a-${a.id}`}>
              <article className={cn("rounded-xl border bg-card p-5 shadow-xs", focusId === a.id && "ring-2 ring-primary", a.isPinned && "border-primary/40")}>
                <header className="mb-2 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.isPinned && <Pin className="size-4 text-primary" aria-label="Pinned" />}
                      <h2 className="text-h3">{a.title}</h2>
                      {a.status === "DRAFT" && <Badge variant="warning">Draft</Badge>}
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {a.author ?? "School office"} · {a.publishedAt ? <RelativeTime date={a.publishedAt} /> : <>edited <RelativeTime date={a.updatedAt} /></>}
                      {canManage && ` · ${a.audienceLabel}`}
                    </p>
                  </div>
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${a.title}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {a.status === "DRAFT" ? (
                          <>
                            <DropdownMenuItem onSelect={() => open(a)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => open(a)}>
                              <Send /> Review & send
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(a)}>
                              <Trash2 /> Delete draft
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem onSelect={() => act(() => api.patch(`/api/announcements/${a.id}`, { isPinned: !a.isPinned }))}>
                              {a.isPinned ? <PinOff /> : <Pin />} {a.isPinned ? "Unpin" : "Pin to top"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => act(() => api.patch(`/api/announcements/${a.id}`, { archived: a.status !== "ARCHIVED" }))}>
                              {a.status === "ARCHIVED" ? <ArchiveRestore /> : <Archive />} {a.status === "ARCHIVED" ? "Restore" : "Archive"}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </header>
                <p className="text-body whitespace-pre-line">{a.body}</p>
                {canManage && a.status !== "DRAFT" && (
                  <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-caption text-muted-foreground">
                    <span>
                      Delivered to <span className="tabular font-medium text-foreground">{formatNumber(a.recipients)}</span> app users · <span className="tabular font-medium text-foreground">{formatNumber(a.read)}</span> read
                    </span>
                    {a.channels.length > 0 && <span>Also by {a.channels.map((c) => CHANNELS.find((x) => x.key === c)?.label ?? c).join(", ")}</span>}
                  </footer>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
      {total > pageSize && <Pagination page={page} pageSize={pageSize} total={total} noun="announcements" />}

      {composer && options && <Composer key={composer.key} initial={composer.draft} id={composer.id} options={options} orgName={orgName} onOpenChange={(o) => !o && setComposer(null)} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        tone="danger"
        title="Delete this draft?"
        description={removing?.title ?? ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          await act(() => api.delete(`/api/announcements/${removing!.id}`));
          setRemoving(null);
        }}
      />
    </div>
  );
}
