"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Mail, MessageCircle, Send, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Field, FieldRow } from "@/components/common/field";
import { FormAlert } from "@/components/common/form-alert";
import { OptionSelect } from "@/components/common/option-select";
import { SettingsCard } from "@/components/common/settings-card";
import { api, ApiError, errorMessage } from "@/lib/api-client";
import { formatNumber } from "@/lib/format";
import type { integrationStatus } from "@/server/modules/communication/integrations";
import type { OrgSettings } from "@/server/modules/organizations/settings";

type Settings = OrgSettings["notifications"];
type Status = Awaited<ReturnType<typeof integrationStatus>>;

function Toggle({ id, label, hint, checked, onChange, disabled }: { id: string; label: React.ReactNode; hint?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5 font-normal">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function Ready({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Badge variant={ok ? "success" : "neutral"} dot>
      {children}
    </Badge>
  );
}

function WhatsAppCard({ status, onSaved }: { status: Status["whatsapp"]; onSaved: () => void }) {
  const [phoneNumberId, setPhoneNumberId] = useState(status.phoneNumberId);
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(status.enabled || !status.configured);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      toast.success((await api.put("/api/settings/integrations", { provider: "whatsapp_cloud", isEnabled: enabled, config: { phoneNumberId, accessToken } })).message);
      setAccessToken("");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.replace(/^config\./, ""), v])));
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="WhatsApp Business"
      description={
        <>
          Uses the Meta WhatsApp Cloud API with your own business number. Messages to parents who haven&apos;t messaged you in 24 hours need approved templates in Meta Business Manager.
        </>
      }
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Ready ok={status.configured && status.enabled}>{status.configured ? (status.enabled ? "Connected" : "Saved, switched off") : "Not connected"}</Ready>
          {!status.configured && status.platformFallback && <Badge variant="info">Using the platform&apos;s shared number</Badge>}
        </div>
        <FieldRow>
          <Field label="Phone number ID" htmlFor="wa-id" error={errors.phoneNumberId} required>
            <Input id="wa-id" value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} autoComplete="off" />
          </Field>
          <Field label="Access token" htmlFor="wa-token" error={errors.accessToken} hint={status.accessToken ? `Saved: ${status.accessToken}. Leave blank to keep it.` : "A permanent system-user token."} required={!status.configured}>
            <Input id="wa-token" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} autoComplete="new-password" />
          </Field>
        </FieldRow>
        <Toggle id="wa-enabled" label="Use this number" checked={enabled} onChange={setEnabled} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={saving}>
            Save
          </Button>
          {status.configured && (
            <Button type="button" variant="ghost" onClick={() => setRemoving(true)}>
              <Trash2 /> Remove
            </Button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        tone="danger"
        title="Remove the WhatsApp connection?"
        description="The stored credentials are deleted. WhatsApp messages stop until you connect again."
        confirmLabel="Remove"
        onConfirm={async () => {
          try {
            toast.success((await api.delete("/api/settings/integrations", { provider: "whatsapp_cloud" })).message);
            setRemoving(false);
            onSaved();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </SettingsCard>
  );
}

function SmsCard({ status, onSaved }: { status: Status["sms"]; onSaved: () => void }) {
  const [endpoint, setEndpoint] = useState(status.endpoint);
  const [apiKey, setApiKey] = useState("");
  const [senderId, setSenderId] = useState(status.senderId);
  const [enabled, setEnabled] = useState(status.enabled || !status.configured);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      toast.success((await api.put("/api/settings/integrations", { provider: "http_sms", isEnabled: enabled, config: { endpoint, apiKey, senderId } })).message);
      setApiKey("");
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k.replace(/^config\./, ""), v])));
      else toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard title="SMS gateway" description="Any HTTPS SMS gateway that accepts JSON { to, from, message } with a Bearer API key (most Pakistani bulk-SMS providers offer this).">
      <form onSubmit={save} className="flex flex-col gap-4">
        <div>
          <Ready ok={status.configured && status.enabled}>{status.configured ? (status.enabled ? "Connected" : "Saved, switched off") : "Not connected"}</Ready>
        </div>
        <Field label="Gateway URL" htmlFor="sms-url" error={errors.endpoint} required>
          <Input id="sms-url" type="url" placeholder="https://api.example.com/sms/send" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} />
        </Field>
        <FieldRow>
          <Field label="API key" htmlFor="sms-key" error={errors.apiKey} hint={status.apiKey ? `Saved: ${status.apiKey}. Leave blank to keep it.` : undefined} required={!status.configured}>
            <Input id="sms-key" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Sender ID" htmlFor="sms-sender" error={errors.senderId} hint="Optional masking name">
            <Input id="sms-sender" maxLength={20} value={senderId} onChange={(e) => setSenderId(e.target.value)} />
          </Field>
        </FieldRow>
        <Toggle id="sms-enabled" label="Use this gateway" checked={enabled} onChange={setEnabled} />
        <div>
          <Button type="submit" loading={saving}>
            Save
          </Button>
        </div>
      </form>
    </SettingsCard>
  );
}

function TestCard({ userEmail }: { userEmail: string }) {
  const [channel, setChannel] = useState<string>("EMAIL");
  const [to, setTo] = useState(userEmail);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const { data, message } = await api.post<{ status: string }>("/api/settings/integrations/test", { channel, to });
      setResult({ ok: data.status === "SENT", message });
    } catch (err) {
      setResult({ ok: false, message: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsCard title="Send a test message" description="Sends one real message through the configured provider and shows exactly what happened.">
      <form onSubmit={send} className="flex flex-col gap-3">
        <FieldRow>
          <Field label="Channel" htmlFor="test-channel">
            <OptionSelect
              id="test-channel"
              value={channel}
              onChange={(v) => {
                setChannel(v ?? "EMAIL");
                setTo(v === "EMAIL" ? userEmail : "");
              }}
              options={[
                { value: "EMAIL", label: "Email" },
                { value: "WHATSAPP", label: "WhatsApp" },
                { value: "SMS", label: "SMS" },
              ]}
            />
          </Field>
          <Field label={channel === "EMAIL" ? "Email address" : "Mobile number"} htmlFor="test-to">
            <Input id="test-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "EMAIL" ? "you@school.edu.pk" : "+92 300 1234567"} />
          </Field>
        </FieldRow>
        <div>
          <Button type="submit" variant="outline" loading={busy} disabled={to.trim().length < 5}>
            <Send /> Send test
          </Button>
        </div>
        {result && (
          <FormAlert variant={result.ok ? "success" : "error"}>
            <span className="inline-flex items-center gap-1.5">
              {result.ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
              {result.message}
            </span>
          </FormAlert>
        )}
      </form>
    </SettingsCard>
  );
}

export function NotificationSettingsForm({ initial, integrations, summary, userEmail }: { initial: Settings; integrations: Status; summary: Record<string, number>; userEmail: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const patch = (p: Partial<Settings>) => setS((prev) => ({ ...prev, ...p }));
  const waReady = (integrations.whatsapp.configured && integrations.whatsapp.enabled) || integrations.whatsapp.platformFallback;
  const smsReady = integrations.sms.configured && integrations.sms.enabled;

  const save = async () => {
    setSaving(true);
    try {
      toast.success((await api.patch("/api/settings/notifications", s)).message);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <SettingsCard
        title="Channels"
        description="In-app notifications are always on. These decide which alerts also go out by email, WhatsApp or SMS."
        footer={
          <p className="text-caption text-muted-foreground">
            Last 30 days: {formatNumber(summary.SENT ?? 0)} sent · {formatNumber(summary.PENDING ?? 0)} queued · {formatNumber(summary.FAILED ?? 0)} failed · {formatNumber(summary.SKIPPED ?? 0)} skipped ·{" "}
            <Link href="/settings/notifications/log" className="font-medium text-primary hover:underline">
              Delivery log
            </Link>
          </p>
        }
      >
        <div className="divide-y">
          <Toggle id="email" label={<span className="inline-flex items-center gap-2"><Mail className="size-4" /> Email</span>} hint={integrations.email.ready ? `Sent from ${integrations.email.from}` : "No email provider is configured on this server."} checked={s.email} onChange={(v) => patch({ email: v })} />
          <Toggle id="whatsapp" label={<span className="inline-flex items-center gap-2"><MessageCircle className="size-4" /> WhatsApp</span>} hint={waReady ? "Absence alerts, fee reminders and receipts reach parents on WhatsApp." : "Connect WhatsApp below first."} checked={s.whatsapp} onChange={(v) => patch({ whatsapp: v })} disabled={!waReady && !s.whatsapp} />
          <Toggle id="sms" label={<span className="inline-flex items-center gap-2"><Smartphone className="size-4" /> SMS</span>} hint={smsReady ? "Used for parents when WhatsApp is off." : "Connect an SMS gateway below first."} checked={s.sms} onChange={(v) => patch({ sms: v })} disabled={!smsReady && !s.sms} />
          <Toggle id="summary" label="Daily summary to administrators" hint="An evening email with attendance, absences and fees collected." checked={s.dailySummaryToAdmins} onChange={(v) => patch({ dailySummaryToAdmins: v })} />
        </div>
      </SettingsCard>

      <WhatsAppCard status={integrations.whatsapp} onSaved={() => router.refresh()} />
      <SmsCard status={integrations.sms} onSaved={() => router.refresh()} />
      <TestCard userEmail={userEmail} />

      {dirty && (
        <div className="sticky bottom-20 z-(--z-sticky) flex justify-end md:bottom-4">
          <div className="flex animate-enter items-center gap-2 rounded-lg border bg-popover p-1.5 ps-3 shadow-lg">
            <span className="text-small text-muted-foreground">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={() => setS(initial)}>
              Discard
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
