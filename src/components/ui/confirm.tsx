"use client";
import { create } from "./store";
import { Dialog } from "./dialog";
import { Button } from "./button";

type Req = { title: string; body?: string; confirmLabel?: string; destructive?: boolean; resolve: (ok: boolean) => void };
const store = create<{ req: Req | null }>({ req: null });

/** Promise-based confirmation dialog: `if (await confirm({...})) ...` */
export function confirm(opts: Omit<Req, "resolve">): Promise<boolean> {
  return new Promise((resolve) => store.set({ req: { ...opts, resolve } }));
}

export function ConfirmHost() {
  const { req } = store.use();
  const close = (ok: boolean) => {
    req?.resolve(ok);
    store.set({ req: null });
  };
  return (
    <Dialog
      open={!!req}
      onOpenChange={(o) => !o && close(false)}
      size="sm"
      title={req?.title ?? ""}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={req?.destructive ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
            {req?.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-fg-2">{req?.body}</p>
    </Dialog>
  );
}
