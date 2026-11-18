# Correções PDV UltraBrasa (horário de pico)

## Integração com UltraBrasa Entregas
- [x] Sincronização bidirecional confirmada: enviar pedidos Delivery e receber status como saiu para entrega e entregue.
- [ ] Obter autenticação/assinatura da outra conta; contrato público de pedidos já identificado, mas recebimento responde não configurado.
- [x] URLs confirmadas pelo responsável: recebimento `/api/public/pdv/orders` e verificação `/api/public/pdv/health` no endereço estável do UltraBrasa Entregas; ambas retornaram HTML do site na verificação de 18/11, indicando publicação/ativação pendente na outra conta.
- [x] Preparar contrato de pedidos, endereço, itens, totais, coordenadas e eventos de retorno; 12 testes aprovados sem entregas reais.
- [x] Preparar envio HTTP para as URLs confirmadas, manter `order_id` estável para deduplicação, limitar espera e rejeitar resposta HTML como conexão válida; seis testes e tipagem aprovados, sem entregas reais.
- [ ] Implementar assinatura, fila de envio e retorno de status após a outra conta publicar a verificação e confirmar o formato das credenciais; nenhuma entrega real foi enviada.
- [x] Credenciais da outra conta conferidas pelo responsável: recebimento configurado; retorno ainda não configurado.
- [x] JSON de retorno confirmado: `event_id`, `event`, `revision`, `order_id`, `delivery_id`, `status`, datas e motoboy; callbacks devem ser monotônicos por revisão.
- [ ] Obter os nomes dos cabeçalhos de assinatura do envio e do retorno; os valores secretos não devem ser copiados para a conversa.
- [x] URL `https://ultraconnectbrasa.com.br/api/public/entregas/retorno` publicada e conferida; segredo de retorno salvo com segurança, aguardando nova publicação para ficar disponível ao endpoint.
- [x] Envio assinado no padrão Lovable verificado pela biblioteca de webhook; 13 testes aprovados, sem entrega real enviada.

## Valores completos na Epson
- [x] Manter papel de 80 mm, margem direita de 6 mm e conteúdo de 42 colunas para evitar corte dos valores.
- [x] Dezessete testes aprovados, incluindo total fictício de R$ 19,90 completo nos modos driver e direto; impressora física não acionada.

## Largura real de 80 mm na Epson
- [x] Usar 48 colunas no conteúdo e 576 pontos no modo direto da Epson, mantendo 28 colunas/384 pontos na impressora de 58 mm.
- [x] Dezessete testes aprovados, incluindo comanda fictícia completa e os dois modos, sem acionar a impressora física.

## Seleção funcional da Epson física
- [x] Separar a impressora física da conexão QZ Tray e deixar a Epson selecionada explicitamente.
- [x] Impedir substituição silenciosa por PDF/outra impressora e usar rasterização compatível com o driver Epson de 80 mm.
- [x] Treze testes aprovados; seleção, impressão fictícia e persistência após recarregar verificadas no Caixa em 890×674, sem acionar a impressora física.

## Conexão com o QZ Tray
- [x] Repetir a conexão quando o QZ Tray estiver iniciando e explicar como abri-lo no Windows.
- [x] Testar a falha e a nova tentativa sem acionar a impressora física; causa confirmada: QZ Tray instalado, mas fechado. Dez testes aprovados.

## Epson TM-T20 via USB
- [x] Adicionar seleção do modelo Epson TM-T20 de 80 mm e identificar o nome instalado no Windows.
- [x] Priorizar a Epson na busca automática, configurar papel de 80 mm e validar a tela sem imprimir fisicamente; 18 testes aprovados e seleção fictícia confirmada em 890×674.

## Venda direta paga no caixa
- [x] Adicionar “Receber” para pedidos novos de Balcão, Mesa ou Retirada: quitar, finalizar e imprimir no caixa sem enviar à Cozinha.
- [x] Manter “Receber e enviar à cozinha” inalterado e validar as gravações sem movimentar vendas reais; 16 testes aprovados.
- [x] Baixas individuais e em lote de pedidos já abertos pelo Caixa imprimem no caixa sem enviar à Cozinha; fluxo individual verificado em 890×674 com duas impressões fictícias e nenhuma mudança indevida de etapa.

## Recebimento imediato no caixa e na Cozinha
- [x] Ao dar baixa em um pedido em preparo pela Cozinha, registrar o pagamento e movê-lo automaticamente para Pronto na mesma gravação; baixa no caixa preserva a etapa. Testado na tela em 890×674 sem movimentar dados reais.
- [x] Manter envio sem pagamento e adicionar “Receber e enviar”, com forma de pagamento, gravação única e impressão automática.
- [x] Testar as regras e o fluxo sem movimentar vendas ou pagamentos reais: 12 testes aprovados e fluxo verificado em 1280×1800 e 890×674; impressora física não acionada.

## Edição e nome correto nos pedidos do robô
- [x] Permitir adicionar produtos do PDV na edição antes do envio à cozinha, recalculando preços e totais no servidor.
- [x] Perguntar o nome quando estiver ausente e usar o nome válido do WhatsApp como alternativa, sem gerar nomes aleatórios; frases de entrega e respostas curtas são bloqueadas também no banco.
- [x] Testar as regras e verificar a edição fictícia sem aceitar pedidos reais: 88 testes aprovados, tipagem verificada e nenhum pedido real aguardando aceite.
- [x] Deixar “Adicionar produto” destacado, sempre clicável e visível no início da edição; inclusão verificada em 890×674 com dois itens fictícios, sem salvar pedido real.

## Impressão automática ao enviar à cozinha
- [x] Aceites do WhatsApp no painel e nas notificações do Administrador/Caixa buscam a comanda real e imprimem automaticamente na impressora da cozinha selecionada.
- [x] Impressão usa a fila deduplicada, respeita a opção de impressão automática e não desfaz o pedido se a impressora falhar; 14 testes e tipagem aprovados, sem imprimir fisicamente.

## Robô ativo e Pix após a confirmação
- [x] Robô ativado com conexão normal; botão de ligar/desligar testado no painel e estado confirmado após atualizar a página.
- [x] Após a confirmação com saída às 11h e prazo de 30 a 45 minutos, pedidos Pix recebem a mensagem completa combinada; cartão e dinheiro não recebem essa mensagem e a baixa continua manual.
- [x] Edição antes do aceite preserva a forma de pagamento; pedidos com campos apagados são reconhecidos pelo resumo confirmado, sem reenvio retroativo.
- [x] 160 testes de WhatsApp aprovados e tipagem verificada; envio em uma conversa real não foi executado.

## Nome do perfil como alternativa segura
- [x] “Ok Tbem”, saudações e agradecimentos não são mais aceitos como nome no roteiro nem na confirmação do banco.
- [x] Nome válido do perfil usado somente quando o nome está ausente/inválido; nome válido digitado pelo cliente tem prioridade.
- [x] Pedido #813 corrigido para Lurdes no PDV, cliente e entrega; 70 testes aprovados, incluindo fluxo com e sem perfil válido.

## Nome e referência no atendimento da Núbia
- [x] Reproduzida a sequência real: nome completo aceito antes dos demais dados; referência não substitui nome nem rua.
- [x] “Núbia Dantas Ramos”, Rua do Oeste, 30 e referência da Praça Dr. Gusmão separados; validação do banco reforçada.
- [x] Pedido real #814 corrigido no PDV e na entrega, sem alterar pagamento, total ou cozinha; 60 testes aprovados.

## Botão global do robô para Administrador e Caixa
- [x] Ação autorizada liga/desliga o robô e cancela respostas automáticas pendentes ao desligar.
- [x] Estado real e botão visíveis no WhatsApp dos dois perfis; demais configurações continuam restritas ao Administrador.
- [x] Desligar/recarregar/religar verificado com Administrador e Caixa; robô ligado ao final e acesso temporário removido.

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

## Botão único de recebimento no lançamento
- [x] Remover “Receber e enviar à cozinha”; restam “Enviar pedido à cozinha” (sem receber) e “Receber” (dá baixa, finaliza e imprime no caixa).
- [x] 9 testes do recebimento aprovados, tipagem verificada e tela do caixa conferida em 1280×1800 sem registrar pagamento real; impressora física não acionada.
