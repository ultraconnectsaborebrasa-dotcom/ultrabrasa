# Correções PDV UltraBrasa (horário de pico)

## Reativar o robô e corrigir falhas atuais
- [x] Configuração, conexão, fila, conversas pausadas e erros atuais verificados; nenhum envio pendente.
- [x] Correções recentes publicadas; 17 avisos antigos encerrados sem reenvio, preservando atendimentos humanos e pedidos.
- [x] Robô ativado e conexão confirmada normal; 89 testes de atendimento aprovados, sem criar pedidos ou enviar mensagens reais.

## Marmita do Dia pública integrada ao PDV
- [x] Página mobile com conteúdo real da oferta, preço do PDV, estoque e checkout existente, com acesso pelo cardápio atual.
- [x] Editor administrativo da oferta usando o produto Marmita completa, sem cadastro ou estoque paralelos.
- [x] Validação de oferta, estoque, entrega grátis em Eunápolis, origem pública e pagamento pendente no banco; estoque ilimitado atual preservado.
- [x] 287 testes aprovados e página/checkout verificados em celular e computador sem criar pedido real; editor não testado com conta administradora. Página publicada e endereço público verificado.

## Janela da marmita no cardápio digital
- [x] Marmitas disponíveis das 09:00 às 14:00, com bloqueio antes das 09:00 na compra e aviso na tela.
- [x] 12 testes do cardápio aprovados, 283 no total, build OK e tela pública conferida às 09:07 com marmitas adicionáveis; compra antes das 09:00 não foi executada em pedido real.

## Endereços e nomes no atendimento automático
- [x] Impedir que nome, rua, número e bairro sejam trocados ou adivinhados em sequências de mensagens.
- [x] Bloquear resumo e solicitação ao PDV quando nome ou endereço estiverem ambíguos, inclusive na validação do banco.
- [x] Testar os erros reais do período de alta demanda sem criar pedidos ou enviar mensagens: 145 testes aprovados, tipagem e build verificados; conversa real no WhatsApp não testada.

## Horários do cardápio digital
- [x] Incluir espetinhos no horário dos hambúrgueres: pedidos às 17h e preparo às 18h, com validação na compra; 11 testes aprovados e navegador verificado às 16h59 e 17h sem criar pedido real. Publicação da tela pendente.
- [x] Indisponibilizar marmitas às 14h e liberar hambúrgueres/acompanhamentos às 17h, com aviso de preparo às 18h.
- [x] Validar horários na compra; 10 testes aprovados e navegador verificado às 13h59, 14h, 16h59 e 17h, com carrinho aberto sem criar pedido real. Roteiro do WhatsApp preservado; publicação pendente para atualizar a tela pública.

## Comprovantes sem leitura automática
- [x] Remover análise por IA e reanálise, preservando arquivos privados e vínculo ao pedido.
- [x] Manter resumo do pedido e baixa exclusivamente manual; 51 testes aprovados e registro manual de anexo verificado na conta autorizada. Sem comandas pendentes para testar baixa real; publicação necessária para aplicar ao WhatsApp em produção.

## Saída para entrega em lote
- [x] Adicionar saída de todos os Delivery prontos em uma gravação, preservando pagamentos e avisos únicos; botão compartilhado na cozinha e caixa.
- [x] Oito testes aprovados e confirmação da cozinha verificada em 890×674; 17 pedidos reais preservados. Execução efetiva do lote não verificada para não despachar clientes reais.

## Ordem de chegada das conversas
- [x] Priorizar clientes aguardando resposta em ordem de chegada, sem usar respostas do robô como chegada.
- [x] Adicionar filtro de espera, posição na coluna, opção de recentes e acesso ao próximo cliente.
- [x] Cinco testes aprovados; ordenação, filtro e abertura do próximo cliente verificados na conta autorizada em 1280×1800 e 890×674, sem enviar mensagens reais; conversa disponível sem mensagens no período.

## WhatsApp em kanban funcional
- [x] Reorganizar o quadro de hoje com busca, colunas legíveis e ações rápidas.
- [x] Abrir a conversa em painel sobre o quadro, preservando pedidos, notas e comprovantes.
- [x] Permitir mover conversas para atendimento ou arquivo sem alterar pedidos e pagamentos.
- [x] Verificar no navegador em computador e celular; busca, conversa, detalhes e eventos de arrastar testados sem alterar atendimentos reais.

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
