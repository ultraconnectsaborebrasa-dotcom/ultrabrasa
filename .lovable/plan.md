# Atendimento WhatsApp integrado ao Ultrabrasa

## Conexão preservada
A conexão oficial **Ultraconnect's WhatsApp Business** já está vinculada ao projeto e será mantida, sem reconectar o número, inventar QR Code ou importar histórico sem suporte. O trabalho será apresentado no preview; não haverá publicação automática.

## 1. Caixa de entrada organizada e alertas
- Filtros com contadores: Novos, Precisam de resposta, Em atendimento, Aguardando cliente e Finalizados.
- Mostrar responsável, não lidas, prévia da última mensagem e tempo aguardando resposta. Uma nova resposta reabre atendimentos finalizados e sinaliza atenção.
- Separar situação do atendimento, etapa do pedido e pagamento. Ler a conversa ou enviar apresentação automática não aceita pedido nem encerra atendimento.
- Manter rascunhos por conversa, inclusive ao alternar para vendas de balcão; mensagens novas não mudam a conversa aberta nem o foco.
- Som agrupado por cliente, aviso clicável, contador no menu, volume, silenciar e botão “Ativar e testar notificações”. Lembretes configuráveis para respostas e aceite pendentes.
- Notificação em segundo plano quando o computador permitir e o usuário autorizar. Com o programa fechado, os alertas locais não funcionam; mensagens permanecem armazenadas para a próxima abertura.

## 2. Atendimento humano
- “Assumir atendimento” registra quem atende e pausa o robô nessa conversa imediatamente; retomada somente por ação explícita.
- Transferir para a equipe diante de solicitação humana, reclamação ou interpretação insegura.
- Notas internas separadas de mensagens enviadas, com controle para evitar respostas simultâneas.
- Preservar os acessos existentes: configuração comercial exclusiva do administrador; qualquer acesso da equipe ao atendimento terá verificação no servidor e não liberará faturamento, lista geral de clientes ou configurações administrativas.

## 3. Cardápios e configurações
- Marmita inicial: carne assada, linguiça de frango, arroz, salada, macarrão e farofa de feijão, **R$ 19,90**.
- Promoção inicialmente ativa: entrega grátis dentro de Eunápolis; fora da cidade exige avaliação humana.
- Pedidos antecipados a partir das **10h**; entregas começam a sair às **11h**, sem prometer chegada nesse horário.
- Apresentação conforme o documento, adaptada ao horário e aos dados já recebidos, sem repetição em cada resposta; mensagem de alta procura editável e desativável.
- À noite, consultar hambúrgueres, espetinhos, acompanhamentos, preços e disponibilidade reais do PDV. Não criar produtos ou ingredientes fictícios.
- Painel para horários por dia, cardápio, preço, disponibilidade, promoção, chave Pix, respostas rápidas e pausa global/individual. Horários de fechamento/noturnos não informados ficam sem suposição; antes de ativar o atendimento automático, o administrador deverá preencher os horários ausentes e a chave Pix.
- Cadastro de PDF do cardápio com validação, armazenamento protegido e envio como documento pela conexão atual. Não afirmar envio sem aceitação do WhatsApp; acompanhar entrega pelos retornos reais.

## 4. Pedido pela conversa, com aceite da loja
- Interpretar texto livre e guardar apenas dados efetivamente informados; perguntar só o que falta: nome, itens, quantidades, observações, entrega/retirada, endereço, referência, pagamento e horário solicitado.
- Consultar produtos, estoque e preços reais. Para dinheiro, perguntar troco; cartão na entrega destaca “Levar maquininha”; Pix utiliza somente a chave configurada.
- Mostrar resumo, taxa e total antes da confirmação do cliente.
- Confirmação cria uma única solicitação **Aguardando aceite da loja**, destacada separadamente; ainda não envia à cozinha nem baixa estoque.
- No aceite humano, revalidar preço/disponibilidade e criar o pedido no fluxo existente, uma única vez, com endereço e vínculo à conversa. Se houver alteração de disponibilidade ou total, pedir nova confirmação em vez de substituir silenciosamente.
- Agendamento registra o horário solicitado e precisa de confirmação da loja; não inventar prazo de entrega.
- Escolher Pix ou enviar comprovante mantém pagamento pendente. Pagamento só muda por confirmação manual autorizada ou integração verificada; entrega continua com baixa manual.
- Usar eventos reais para avisar pedido aceito e saiu para entrega, respeitando a janela de atendimento de 24 horas. Fora dela, somente modelos aprovados; sem modelo, mostrar pendência à equipe, sem envio livre indevido.

## 5. Segurança e confiabilidade
- Reutilizar o recebimento assinado existente e guardar cada evento antes do processamento.
- Acrescentar processamento com reserva exclusiva, fila durável de respostas e recuperação efetivamente acionada; tratar resultados ambíguos sem reenviar cegamente.
- Evitar duplicação em mensagens, confirmações, pedidos, aceite e baixa de estoque, inclusive com vários clientes ou duas telas simultâneas.
- Manter retornos de entrega por identificador do WhatsApp, horários originais e avanço de status sem regressão.
- Preservar a conexão, produtos, pedidos, vendas, permissões e visual da marca. Nenhuma campanha em massa.

## Detalhes técnicos
- Extensões aditivas nas tabelas protegidas de WhatsApp para atendimento, responsável, notas, configurações, solicitações de pedido e trabalho pendente, com GRANTs/RLS e operações atômicas autorizadas.
- Funções internas autenticadas e receptor público assinado existentes no TanStack Start; chamadas do WhatsApp somente no servidor, pela conexão oficial já vinculada.
- Interpretação de conversa pela Lovable AI, com esquema validado, catálogo real e confirmação humana obrigatória antes do fluxo de pedidos; respostas não autorizam preços, pagamentos ou estoque.
- Recuperação por agendamento gerenciado quando disponível; caso indisponível, explicitar a alternativa suportada e os atrasos de recuperação antes de considerá-la concluída.
- PDF protegido, com limites de tamanho/tipo e caminho de envio oficial. Nenhuma credencial no navegador.

## Validação e entrega
- Testes concretos: marmita R$ 19,90, promoção em Eunápolis, horários 10h/11h, Pix não pago automaticamente, pausa humana, retorno à fila, confirmação única e estoque somente no aceite.
- Testar texto livre, PDF, agendamento, múltiplos clientes, rascunhos, sons, reconexão, repetição de eventos e eventos de aceite/saída, sem campanhas nem mensagens de teste a clientes reais não autorizados.
- Conferir o fluxo autenticado no preview e preservar dados existentes. Envios reais para um telefone de teste precisarão da sua autorização; recebimento real depende de este projeto estar selecionado como destino e de o receptor estar publicado.
- Entregar prévia com lista objetiva do que foi validado e do que depende de telefone, permissão de notificações, PDF real, horários/Pix, modelo aprovado ou publicação.
- A conexão existente será reutilizada: não há necessidade planejada de contratar um provedor não oficial. Mensagens de modelo podem ter cobrança da Meta, e interpretação automática consome créditos de IA; não ativar disparos fora das regras da integração.