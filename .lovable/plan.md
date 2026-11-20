# Pedido manual pelo WhatsApp mais prático

## O que será alterado
- Manter a regra atual: ao assumir, o robô pausa imediatamente e só volta por ação explícita.
- Criar um painel reutilizável da conversa para acompanhar a montagem do pedido, mostrando o nome do perfil do WhatsApp, o telefone, o responsável e o estado do robô.
- Exibir as mensagens com botões para copiar o nome e cada mensagem do cliente, facilitando copiar rua, número, bairro e referência sem interpretação automática.
- Mostrar esse painel ao lado da montagem no Administrador e no Caixa; em telas menores, ficará recolhível acima do pedido.
- Preservar os campos manuais em branco, os produtos, o envio, o recebimento e todos os fluxos atuais.

## Verificação
- Testar cópia, exibição do nome do perfil e abertura do pedido sem preenchimento automático.
- Conferir a montagem no navegador sem criar pedidos ou enviar mensagens reais.
- Executar os testes relacionados e a verificação do projeto.

## Detalhes técnicos
- Reutilizar as leituras autorizadas de `whatsapp_conversations` e `whatsapp_messages`.
- Não alterar banco, automação, preços, pagamentos ou permissões.
