import "server-only";
import { env } from "@/server/env";
import { db } from "@/server/db/client";
import { decryptJson } from "@/server/auth/crypto";
import { logger } from "@/server/logger";
import type { NotificationChannel } from "@/generated/prisma/enums";
import type { Rendered } from "./templates";

export type OutboundMessage = { to: string; rendered: Rendered };

/**
 * A delivery provider for one channel. Application code never talks to a
 * vendor directly — it queues a delivery and the dispatcher picks the provider.
 */
export interface MessageProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<{ providerMessageId?: string }>;
}

/** Thrown when a channel has no configured provider; the delivery is marked SKIPPED, not failed. */
export class ProviderNotConfiguredError extends Error {
  constructor(channel: string) {
    super(`No ${channel} provider is configured`);
    this.name = "ProviderNotConfiguredError";
  }
}

// ── Email ──

class ConsoleEmailProvider implements MessageProvider {
  readonly name = "console";
  async send({ to, rendered }: OutboundMessage) {
    // Development only: prints the email so flows (e.g. password reset) can be completed locally.
    logger.info("email_console_delivery", { to, subject: rendered.subject, text: rendered.text });
    return {};
  }
}

class ResendEmailProvider implements MessageProvider {
  readonly name = "resend";
  constructor(private apiKey: string, private from: string) {}
  async send({ to, rendered }: OutboundMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [to], subject: rendered.subject, html: rendered.html, text: rendered.text }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
    const json = (await res.json()) as { id?: string };
    return { providerMessageId: json.id };
  }
}

// ── WhatsApp (Meta WhatsApp Business Cloud API) ──

type WhatsAppConfig = { phoneNumberId: string; accessToken: string };

class WhatsAppCloudProvider implements MessageProvider {
  readonly name = "whatsapp_cloud";
  constructor(private config: WhatsAppConfig) {}
  async send({ to, rendered }: OutboundMessage) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(this.config.phoneNumberId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to.replace(/[^\d]/g, ""),
        type: "text",
        text: { preview_url: false, body: rendered.short },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp Cloud API responded ${res.status}`);
    const json = (await res.json()) as { messages?: { id: string }[] };
    return { providerMessageId: json.messages?.[0]?.id };
  }
}

// ── SMS (generic HTTP gateway) ──

type SmsConfig = { endpoint: string; apiKey: string; senderId?: string };

class HttpSmsProvider implements MessageProvider {
  readonly name = "http_sms";
  constructor(private config: SmsConfig) {}
  async send({ to, rendered }: OutboundMessage) {
    const res = await fetch(this.config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, from: this.config.senderId, message: rendered.short }),
    });
    if (!res.ok) throw new Error(`SMS gateway responded ${res.status}`);
    return {};
  }
}

async function orgCredential<T>(organizationId: string | null, provider: string): Promise<T | null> {
  if (!organizationId) return null;
  const row = await db.integrationCredential.findUnique({
    where: { organizationId_provider: { organizationId, provider } },
  });
  if (!row || !row.isEnabled) return null;
  try {
    return decryptJson<T>(row.encryptedConfig);
  } catch (error) {
    logger.error("integration_credential_decrypt_failed", { organizationId, provider, error });
    return null;
  }
}

/** Resolves the provider for a channel: organization credentials first, then platform defaults. */
export async function resolveProvider(channel: NotificationChannel, organizationId: string | null): Promise<MessageProvider> {
  switch (channel) {
    case "EMAIL": {
      if (env.EMAIL_PROVIDER === "resend" && env.EMAIL_API_KEY) return new ResendEmailProvider(env.EMAIL_API_KEY, env.EMAIL_FROM);
      if (env.EMAIL_PROVIDER === "console") return new ConsoleEmailProvider();
      throw new ProviderNotConfiguredError("email");
    }
    case "WHATSAPP": {
      const own = await orgCredential<WhatsAppConfig>(organizationId, "whatsapp_cloud");
      if (own) return new WhatsAppCloudProvider(own);
      if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
        return new WhatsAppCloudProvider({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, accessToken: env.WHATSAPP_ACCESS_TOKEN });
      }
      throw new ProviderNotConfiguredError("WhatsApp");
    }
    case "SMS": {
      const own = await orgCredential<SmsConfig>(organizationId, "http_sms");
      if (own) return new HttpSmsProvider(own);
      throw new ProviderNotConfiguredError("SMS");
    }
    default:
      throw new ProviderNotConfiguredError(channel.toLowerCase());
  }
}
