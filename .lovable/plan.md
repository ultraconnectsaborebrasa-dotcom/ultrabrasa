# Catálogo digital UltraBrasa

Built in phases. Each phase is shown in the preview before the next one starts.

## Fase 1 — Cardápio público e fotos
- New public page `/cardapio`, made for phones, in the brand's dark/red/gold look with the current logo.
- Categories: Marmitas, Hambúrgueres, Espetinhos, Acompanhamentos, Porções, Bebidas. Only categories that have products appear.
- Prices, stock and availability come from the current PDV product list. Sold-out items and a closed store are shown clearly.
- Marmitas are highlighted at lunch; hambúrgueres and espetinhos at night, using adjustable times (America/Bahia).
- Illustrative photos are generated for every food product, square, with a small "Imagem ilustrativa" label.
- Drinks get no invented labels. Until you upload real photos, they appear in the "fotos pendentes" list.
- Before changing any price, the R$ 19,90 marmita price is compared with what is registered, and any difference is reported to you.

## Fase 2 — Carrinho e pedido (pagamento na entrega/retirada)
- Flow: Escolher → Carrinho → Entrega/Retirada → Pagamento → Acompanhar.
- The cart stays saved while browsing. It supports add-ons, notes, and changing or removing items.
- The order asks only for name, WhatsApp, address (delivery only), scheduled time and payment method. It asks "troco pra quanto?" for cash and records "Levar maquininha" for card on delivery.
- Free delivery in Eunápolis while the promotion is on. Addresses outside the city go to the store for a quote.
- Prices and stock are checked again on the server. Each order enters the PDV once, marked "Catálogo digital", and reuses the existing kitchen, printing, routes and alerts.
- Automatic store acceptance can be switched on or off. When off, orders show "Aguardando aceite".
- A secure tracking link shows only that order.

## Fase 3 — Pix e cartão online (Mercado Pago)
- Individual Pix charge with a QR code, copy-and-paste code and expiry time. Card payment uses Mercado Pago's own secure form.
- An order is marked "Pago" only after Mercado Pago confirms the payment to the server. Repeated notifications are ignored, and stock is held while payment is pending.
- **Needs from you:** a Mercado Pago account, plus the Access Token and Public Key from Mercado Pago → Suas integrações. Fees are set by Mercado Pago (Pix is usually about 0.99%).

## Fase 4 — Aba "Catálogo digital" no PDV + regra do WhatsApp
- Admin can change photos, descriptions, order, highlights, opening hours, the promotion, payments and automatic acceptance.
- Caixa can view the catalog and use "Abrir catálogo", "Copiar link" and "Enviar no WhatsApp".
- During marmita hours the WhatsApp robot does not send the catalog link or PDF automatically and answers with the marmita menu as text. At night it can send the catalog or the PDF, as configured.
- Sending manually stays available at any time.

## Technical
- Product photos are stored as their own catalog data, separate from the shared PDV snapshot, through admin-only actions.
- Public orders go through a validated server endpoint that reuses the existing stock-checked submission.
- Mercado Pago confirmations reach a signed webhook route.
