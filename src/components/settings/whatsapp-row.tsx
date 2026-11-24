"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { api, useApi } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input, Switch } from "@/components/ui/input";
import { Badge } from "@/components/ui/misc";
import { toast, toastError } from "@/components/ui/toast";
import { Row } from "./shared";

type WhatsAppState = { configured: boolean; number: string | null; verified: boolean; reminders: boolean; codePending: boolean };

const pretty = (digits: string) => `+${digits}`;

/** WhatsApp reminders: add a number, verify it with a code sent on WhatsApp, then switch reminders on/off. */
export function WhatsAppRow({ demo }: { demo: boolean }) {
  const { data, mutate } = useApi<WhatsAppState>("/api/whatsapp");
  const [number, setNumber] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "send" | "verify" | "toggle" | "test" | "remove">(null);
  const [editing, setEditing] = useState(false);

  async function run<T>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) {
    setBusy(kind);
    try {
      return await fn();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  }

  const label = (
    <span className="flex items-center gap-2">
      <MessageCircle className="h-4 w-4 text-[#25D366]" aria-hidden /> WhatsApp reminders
      {data?.verified && <Badge tone="success">Verified</Badge>}
    </span>
  );

  if (!data) return <Row label={label}><span className="text-[12.5px] text-fg-3">Loading…</span></Row>;

  if (demo || !data.configured) {
    return (
      <Row label={label} hint={demo ? "Not available in the demo." : "WhatsApp delivery isn't set up on this server yet."}>
        <div className="pointer-events-none opacity-50" aria-disabled="true">
          <Switch checked={false} onChange={() => {}} label="WhatsApp reminders (unavailable)" />
        </div>
      </Row>
    );
  }

  // Verified: on/off, test, change, remove.
  if (data.verified && data.number && !editing) {
    return (
      <Row label={label} hint={`Reminders are also sent to ${pretty(data.number)} on WhatsApp (up to 40 a day).`} stack>
        <div className="flex flex-wrap items-center gap-2">
          <Switch
            checked={data.reminders}
            label="Send reminders to WhatsApp"
            onChange={(v) => run("toggle", async () => mutate(await api.patch<WhatsAppState>("/api/whatsapp", { reminders: v }), { revalidate: false }))}
          />
          <span className="mr-2 text-[13px] text-fg-2">{data.reminders ? "On" : "Off"}</span>
          <Button size="sm" variant="outline" loading={busy === "test"} onClick={() => run("test", async () => { await api.post("/api/whatsapp/test"); toast.success("Test message sent. Check WhatsApp."); })}>
            Send test
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setEditing(true); setNumber(pretty(data.number!)); }}>
            Change number
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger"
            loading={busy === "remove"}
            onClick={() => run("remove", async () => { mutate(await api.delete<WhatsAppState>("/api/whatsapp"), { revalidate: false }); toast.success("WhatsApp number removed"); })}
          >
            Remove
          </Button>
        </div>
      </Row>
    );
  }

  // Not verified yet: enter number → code.
  return (
    <Row
      label={label}
      hint={
        data.codePending
          ? `We sent a 6-digit code on WhatsApp to ${pretty(data.number ?? "")}. It expires in 10 minutes.`
          : "Get reminders as WhatsApp messages. Enter your number with the country code; we'll send a code to confirm it's yours."
      }
      stack
    >
      {!data.codePending || editing ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("send", async () => {
              mutate(await api.post<WhatsAppState>("/api/whatsapp/verify", { number }), { revalidate: false });
              setEditing(false);
              setCode("");
              toast.success("Code sent on WhatsApp");
            });
          }}
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+91 98765 43210"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="w-full sm:w-[220px]"
            aria-label="WhatsApp number with country code"
          />
          <Button type="submit" size="sm" loading={busy === "send"} disabled={number.replace(/\D/g, "").length < 8}>
            Send code
          </Button>
          {editing && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </form>
      ) : (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("verify", async () => {
              mutate(await api.post<WhatsAppState>("/api/whatsapp/confirm", { code }), { revalidate: false });
              toast.success("WhatsApp verified. Reminders will now arrive there too.");
            });
          }}
        >
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-[140px] tracking-[0.3em]"
            aria-label="Verification code"
          />
          <Button type="submit" size="sm" loading={busy === "verify"} disabled={code.length !== 6}>
            Verify
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(true); setNumber(pretty(data.number ?? "")); }}>
            Use a different number
          </Button>
        </form>
      )}
    </Row>
  );
}
