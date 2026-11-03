type WaitUntilContext = { waitUntil: (task: Promise<unknown>) => void };

/** Cloudflare's background context, when the request runs on a Worker that provides one. */
export function backgroundContext(request: Request): WaitUntilContext | undefined {
  return (request as Request & { runtime?: { cloudflare?: { context?: WaitUntilContext } } }).runtime?.cloudflare?.context;
}

/**
 * Runs work that must keep going after the response is already delivered (e.g. WhatsApp replies).
 * Where no background context exists, the task is awaited inline so local runs still process it.
 */
export async function runAfterResponse(request: Request, label: string, task: () => Promise<unknown>) {
  const context = backgroundContext(request);
  if (context) context.waitUntil(task().catch((e) => console.error(`${label} failed`, e)));
  else await task().catch((e) => console.error(`${label} failed`, e));
}
