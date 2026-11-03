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
- Team removal revokes only operator roles and never deletes profiles or order history; role mutation RPCs serialize changes and reject administrator targets to protect all admin accounts.
- Android uses a HTTPS-only native WebView of the published site with no JavaScript bridge or separate data store; this keeps web releases, login and role-enforced shared data consistent across devices.
- Operator submissions derive prices, stock and seller identity in a locked database function; client amounts are never accepted, and idempotency prevents duplicate sends.
- Table selection is structured and validated against the fixed table list; kitchen and floor views share table labels to keep destinations unambiguous.
- Sales history uses payment timestamps, local inclusive calendar dates, product-ID aggregation, and stored service amounts for new orders to preserve historical details.
- Administrator daily sales, payment/day summaries and shift bestseller rankings share the sales-history calculation helpers to keep quantities and legacy timestamp fallbacks consistent.
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
- WhatsApp stays official; attendance (queues, replies, assignment/transfer, order acceptance) is open to admin and cashier via wa_staff checks in RPCs, RLS and server functions, while connection, history sync and automation settings stay admin-only: signed durable inbox, leased deduplicated jobs, monotonic provider callbacks; attendance/request/payment states are independent. Atomic acceptance revalidates prices through existing stock-authoritative submission. Ambiguous sends and provider denials pause rather than replay.
- Digital catalog metadata (photos, descriptions, publish/sort) lives in catalog tables keyed by PDV product id and is read publicly only through an allowlisted security-definer RPC; prices, stock and availability always come from the shared PDV snapshot so the menu never diverges from the PDV.
