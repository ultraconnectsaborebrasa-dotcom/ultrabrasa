# Estoque esgotado no cardápio público

- Expor o estado atual do botão **Estoque esgotado** na leitura pública do cardápio.
- Mostrar **Indisponível** e impedir adicionar/finalizar pedidos em `/cardapio` e `/marmita-do-dia`, atualizando as páginas automaticamente.
- Bloquear novos pedidos também na função do banco, inclusive em telas abertas antes da ativação; pedidos já registrados e respostas idempotentes permanecem preservados.
- Restaurar os pedidos ao encerrar o aviso, sem alterar estoque, pagamentos, comandas ou atendimentos existentes.
- Adicionar testes para a regra e conferir o comportamento no navegador sem criar pedidos reais.

## Detalhes técnicos

A migração atualizará `read_public_catalog` e `catalog_place_order`, lendo `whatsapp_settings.business.stockExhausted`. A interface reutilizará esse valor e o checkout receberá o mesmo bloqueio visual antes do envio.
