# Entregas por motoboy e distritos

- Reutilizar os distritos oficiais já cadastrados para Eunápolis, mostrando os bairros correspondentes e reunindo saídas prontas por distrito e por bairro.
- Permitir selecionar um distrito inteiro ou somente um bairro para designar entregas próximas em conjunto; bairros não reconhecidos ficam em “Distrito a confirmar”, sem coordenadas inventadas.
- Mostrar no cartão de cada motoboy suas entregas atuais, com pedido, cliente, status, bairro e distrito, além da quantidade de marmitas.
- Fazer “Designar” concluir a atribuição diretamente, sem abrir o formulário de nome, origem e sequência de rota; o vínculo necessário para o aplicativo e as reservas de estoque continua protegido pelo fluxo existente.
- Adicionar testes dos agrupamentos e da seleção, conferir a tela sem designar entregas reais e preservar pagamentos, histórico e rotas atuais.

## Detalhes técnicos

Os agrupamentos usarão `DELIVERY_ZONES` e `deliveryZone`. A ação direta reutilizará `save_delivery_route` com identificação e origem preenchidas automaticamente, mantendo a validação transacional e a compatibilidade com o aplicativo do entregador.
