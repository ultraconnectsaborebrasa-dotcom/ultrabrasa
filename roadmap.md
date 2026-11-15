# Correções PDV UltraBrasa (horário de pico)

## Confirmação por qualquer interação
- [x] Após o resumo, aceitar texto, emoji ou anexo como confirmação do pedido apresentado, sem exigir “sim”.
- [x] Testar interação de texto e anexo e ausência de confirmação antes do resumo: 242 testes aprovados, sem pedidos reais.
- [ ] Verificar a confirmação por anexo em uma conversa real após a publicação.

## Roteiro geral do atendimento automático
- [x] Aplicar horários, textos, respostas frequentes, sequências com 3 segundos e interrupção por nova resposta.
- [x] Testar cenários fictícios das 08h, 11h, pagamentos, anexos, noite, encerramento e transferência humana, sem criar pedidos reais: 239 testes aprovados.
- [ ] Verificar uma conversa real no WhatsApp após publicar; envio real não faz parte dos testes automatizados.

## Início do atendimento em mensagens menores
- [x] Separar a abertura das 08h em saudação, promoção, cardápio e perguntas, preservando a continuidade e a prevenção de repetição.
- [x] 30 testes aprovados: abertura em quatro mensagens, continuidade e passagem das 10h sem repetição; envio real depende da publicação.

## Complemento do roteiro de marmitas
- [x] Incluir promoção das 08h às 10h e aceitar pedidos até 14h20, preservando scripts normais, confirmação e atendimento noturno.
- [x] 61 testes aprovados, incluindo conversa simulada, confirmação, horários e ausência de geração por IA no fluxo de marmitas.
- [ ] Publicar e verificar uma conversa real no WhatsApp; não foi enviado pedido ou mensagem a cliente real durante os testes.

## Mensagem após confirmação
- [x] Usar somente o aviso único do pedido aceito, sem mensagem anterior à confirmação nem repetição por reenvio.
- [x] 35 testes aprovados: bloqueio antes de confirmação, envio e repetição; entrega real ainda não verificada no WhatsApp.

## Anexos sem respostas duplicadas
- [x] Unificar agradecimento, deduplicar eventos e agrupar anexos próximos sem alterar pagamentos.
- [x] Testar recebimentos repetidos e pausa por atendimento humano: 54 testes aprovados; envio real de anexo ainda não verificado.

## Limpeza solicitada e arquivo de atendimento
- [x] Limpar contadores de mensagens não lidas e reconhecer avisos de erro sem reenviar mensagens.
- [x] Finalizar pedidos da cozinha após confirmação explícita do responsável, preservando pagamentos e histórico.
- [ ] Reorganização ampla do atendimento e pagamentos do arquivo: retomada separada da limpeza imediata solicitada.

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
