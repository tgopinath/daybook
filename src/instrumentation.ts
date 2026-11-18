// Starts the in-process notification scheduler. The Node-only code lives in
// instrumentation-node.ts and is imported inside the NEXT_RUNTIME branch so the
// edge bundle never pulls in web-push / Prisma (Next.js documented pattern).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
