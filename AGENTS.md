<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Subdirectories may have their own AGENTS.md (desktop rules: electron/AGENTS.md); read it before changing files there.

## PDV access and persistence
- Public home renders an inline account entry until a verified Cloud user has a database role; database RLS and RPC authorization enforce permissions independently of the UI.
- Roles live only in protected user_roles; the primary admin claim checks the confirmed Auth email server-side, never user-editable metadata.
- Shared PDV snapshots use serialized revision-checked writes to prevent silent overwrites; drafts remain terminal-local and the original local data is backed up before Cloud import.
- Operators receive prices and calculated totals only for active orders; their own attendance history is an explicit server allowlist without prices, totals or payments, so closed revenue cannot be recovered from the response.
- Customer contacts and order-linked visits live outside the shared snapshot with admin-only reads; optional contact capture is transactional with operator submission and idempotent by order, with normalized phone deduplication and explicit promotion consent to prevent unauthorized marketing.
- Promotions use consent-filtered CSV export and individual WhatsApp deep links, not automated sending; the customer directory never exposes connector credentials.
- Ordinary team removal preserves history; explicit administrator-only permanent deletion previews linked records, blocks live work and protected accounts, deletes linked history transactionally, and cleans private files/Auth accounts through a retriable private cleanup job.
- Android is a HTTPS-only native WebView of the published site, no JavaScript bridge or separate data store, keeping releases, login and role-enforced data consistent.
- Android Firebase uses app/google-services.json as public build configuration and the Firebase Messaging SDK; private sending credentials stay in the connector, and device targeting must be authenticated per courier, never a shared order topic.
- Native GPS pairs through a five-minute one-use code and an encrypted, GPS-only device credential, without exposing web sessions; its visible foreground service rechecks open shift and opt-out before collecting, and the database rechecks both before every write.
- Native release signing material is preserved only in private artifact metadata, never source, public app assets or chat.
- Operator submissions derive prices, stock and seller identity in a locked database function; client amounts are never accepted, and idempotency prevents duplicate sends.
- Table selection is structured and validated against the fixed table list; kitchen and floor views share table labels to keep destinations unambiguous.
- Sales history and admin summaries (daily sales, payment/day, bestsellers) share the same helpers: payment timestamps, local inclusive dates, product-ID aggregation and stored service amounts, with legacy timestamp fallbacks.
- Shared state Realtime subscriptions mount only for authorized accounts and clean up on exit; monotonic revisions and deferred updates preserve local drafts and in-flight writes.
- New-order alerts observe only each role's authorized order list, baseline the first load, and unlock browser audio after interaction; this avoids historical alerts and preserves permission boundaries.
- Settings use an administrator-only grouped editor with explicit validated saves; optional settings retain legacy defaults so existing shared snapshots remain compatible.
- The uploaded brand logo is served through its asset pointer and shared Brand component; never redraw it for navigation or account screens.

- Delivery logistics use separate protected tables and allowlisted RPC reads; a snapshot trigger validates and synchronizes new Delivery orders from every submission path, while legacy orders remain compatible.
- All order-print paths include Delivery addresses; when role-specific order projections omit them, resolve the matching order through the existing authorized delivery read and stop printing on a missing address rather than emit an incomplete ticket.
- Delivery fees are opt-in per new order and priced from shared settings; route completion/cancellation uses an atomic authorized RPC that preserves closed stops and does not change sale/payment records.
- Courier accounts use a separate user_roles value and can access only assigned routes through validated RPCs; no shared PDV snapshot or closed financial history is exposed.
- Delivery sequencing works without map credentials using neighborhood/address order and Google Maps deep links; optional distance/time fields are reserved for verified map results, never fabricated.
- Delivery-zone catalog uses sourced municipal operational groupings, preserves free-text addresses and treats unknown locations as unassigned; batches prioritize oldest unassigned orders and cap Maps links at ten stops without claiming traffic optimization.
- WhatsApp stays official: attendance (queues, replies, transfer, order acceptance) uses wa_staff checks (admin+cashier); connection, history sync and automation settings are admin-only. Inbox is signed/durable, jobs leased/deduplicated, callbacks monotonic; attendance/request/payment states stay independent. Acceptance revalidates prices via stock-authoritative submission; ambiguous sends and denials pause, never replay.
- Rulebot owns time windows and lunch deduplication; no AI reply calls.
- Attachment thanks use inbound-keyed jobs, not receipt analysis, to prevent replay/burst duplicates.
- Automated replies run right after an inbound event is stored (src/lib/background.ts) with per-conversation job serialization, so no reply waits on the scheduler.
- Digital catalog metadata (photos, descriptions, publish/sort) lives in catalog tables keyed by PDV product id and is read publicly only through an allowlisted security-definer RPC; prices, stock and availability always come from the shared PDV snapshot so the menu never diverges from the PDV.
- WhatsApp contacts deduplicate normalized phones; provisional names never overwrite confirmed names; corrections are audited and external sync requires admin authorization.
- Receipt processing and attachment recovery only store private media and deduplicate/link files; neither invokes AI nor creates payments. Cashier confirmation uses order totals and remains manual and delivery-independent.
- Delivery departure uses an authorized RPC and deduplicated job; only known failed sends allow explicit retry.
- Locked closure RPCs and terminal guards close linked requests/jobs, preserving history without assuming refunds.
- PDV order stage (`status`: aberta→cozinha→pronto→entrega→entregue/retirado) is separate from payment (`paymentStatus`/`payments`); `pay_pdv_cashier` never changes `status`, stage RPCs never touch payments.
- Cashier value adjustments run through locked authorized RPCs; extra charges are stored separately and included in fee for compatibility, with audit entries and atomic adjustment/payment to avoid partially applied receipts.
- Courier settlement is an allowlisted daily read, own-only for couriers and current-day-only for cashiers; payments are attributed to the courier when recorded with courier attribution or recorded after the order departed with that courier (cash → hand over, card/Pix → machine); prepaid stays store-paid, never inferred from delivery completion.
- Permanent person deletion records order-ID tombstones and filters stale snapshot writes before terminal guards, so deleted sales cannot be restored by old terminals; unrelated people and products remain untouched.
- Courier foreground GPS sharing mounts outside the optional map, requests OS consent, respects per-courier opt-out, and writes only during an open shift; map markers and focus controls distinguish live from last-known positions.
- Shift triggers synchronize courier availability; board projections and assignment guards require open attendance, preventing stale terminals from dispatching off-duty couriers.
