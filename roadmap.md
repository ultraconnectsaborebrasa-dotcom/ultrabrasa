# Correções PDV UltraBrasa (horário de pico)

## Limpeza solicitada e arquivo de atendimento
- [ ] Limpar contadores de mensagens não lidas e reconhecer avisos de erro sem reenviar mensagens.
- [ ] Revisar com o usuário os pedidos antigos ainda na cozinha, preservando pagamentos e etapas reais.
- [ ] Reorganizar o atendimento humano e montagem de pedidos conforme o arquivo enviado; implementar após a limpeza imediata.

## Organização diária
- [x] WhatsApp: mostrar somente conversas e mensagens do dia de Eunápolis por padrão, com histórico separado e sem exclusão.
- [x] Pagamentos: lista de pendentes com busca e total, incluindo entregues não pagos, e janela de baixa manual compartilhada; valores parciais continuam sujeitos à limitação existente do recebimento.
- [x] Verificar regras: 33 testes passaram; Hoje, Histórico, conversa e janela de baixa verificados na conta autorizada e em 890×674, sem movimentar dinheiro real.

- [x] 1. Receber sem "Falha no pagamento": admin+caixa, duplicado bloqueado, registro manual, total/recebido/saldo, dados mantidos em erro — testado no navegador (dinheiro, duplicado, admin)
- [x] 2. Comprovante direto da mensagem do WhatsApp: botão "Vincular ao pedido" na imagem/PDF com escolha de pedido — pendente: teste com arquivo real recebido
- [x] 3. Etapa única: Novo → Em preparo → Pronto → Saiu para entrega → Entregue / Retirado — testado (transições, guards, saída e baixa de entrega)
- [x] 4. Pagamento separado da etapa — testado (pago permanece "Em entrega")
- [x] 5. Abas com contadores no Caixa (Novos, Cozinha, Prontos, Em entrega, Finalizados) + cartões com tempo, cliente, itens e pagamento
- [x] 6. Pedidos inconsistentes: nenhum encontrado (filas vazias, entregas consistentes); guards novos impedem recorrência
- [x] 7. Testes: 159 testes + fluxo real balcão e delivery no navegador; build OK
