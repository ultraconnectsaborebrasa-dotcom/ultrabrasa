# Ultraconnect Sabor e Brasa — Android

Projeto Android nativo pronto para abrir no Android Studio. O APK v1 de teste foi compilado e entregue separadamente em Files; assinatura e integridade verificadas, uso no aparelho real ainda não testado.

## O que o app usa
- Site oficial: https://ultrabrasa.lovable.app.
- Mesmas contas e permissões, produtos, preços, estoque, pedidos e vendas do site e Windows; não cria outro banco nem importa/substitui os 45 produtos.
- Logo original no ícone. As telas e logo interna vêm do site publicado.
- Internet necessária. As mudanças do site aparecem no Android sem recompilar o APK.
- Login por email e senha usa a conta já cadastrada. A sessão fica no WebView do aparelho e é independente da sessão do navegador.
- Não há chaves privadas, ponte JavaScript, acesso a arquivos nem permissão de câmera/localização.

## Gerar APK instalável no Windows (caminho mais simples)
1. Instale Android Studio estável: https://developer.android.com/studio.
2. Extraia este ZIP inteiro para uma pasta, por exemplo C:\UltraconnectAndroid.
3. No Android Studio escolha Open e selecione a pasta que contém settings.gradle.
4. Em Settings > Build, Execution, Deployment > Build Tools > Gradle selecione Gradle JDK = jbr-17 (ou JDK 17 instalado); não use JDK 11.
5. Em Tools > SDK Manager instale Android SDK Platform 35. Na aba SDK Tools instale Android SDK Build-Tools 35.0.0, Android SDK Platform-Tools e Android SDK Command-line Tools (latest). Aceite as licenças.
6. Aguarde Gradle Sync concluir; precisa de internet para baixar Gradle 8.11.1 e Android Gradle Plugin 8.9.2.
7. Abra Terminal no Android Studio e execute: .\gradlew.bat assembleDebug
8. APK assinado de teste instalável: app\build\outputs\apk\debug\app-debug.apk.
9. Copie esse APK para o Android (Android 8 ou superior), abra-o e autorize a instalação por esse aplicativo quando solicitado.

No macOS/Linux, os passos no Android Studio são iguais; no Terminal execute chmod +x gradlew e ./gradlew assembleDebug. Arquivo: app/build/outputs/apk/debug/app-debug.apk.

## APK de produção com assinatura própria
No Android Studio: Build > Generate Signed App Bundle or APK > APK > Next. Escolha Create new, guarde o arquivo .jks FORA deste projeto e defina suas próprias senhas; não envie a chave nem senhas para o chat. Anote e guarde a chave para futuras atualizações. Escolha release e finalize. O assistente mostra a pasta de saída do APK assinado. assembleRelease sem configurar assinatura gera APK não instalável sem assinatura; use o assistente acima. O APK de produção assinado com outra chave não atualiza o APK debug: desinstale o debug primeiro (isso encerra sua sessão local).

## Testar antes de distribuir
1. Execute no emulador e depois em aparelho real.
2. Entre com conta real de atendente: confira preço unitário, subtotal e total; confirme ausência de caixa/custos/admin.
3. Entre com administrador: confira os 45 produtos, estoque e histórico, e que administradores não podem ser excluídos.
4. Em duas telas (Android e site/Windows), envie um pedido com mesa/especificação; confira chegada na cozinha, estoque e total; acompanhe pagamento pela administração. Use pedido real autorizado ou cancele o teste pelo administrador para devolver o estoque.
5. Saia da conta, reabra o app, teste login, persistência da sessão, teclado, botão Voltar e falta de internet.
6. Revogue uma conta de teste autorizada e confirme bloqueio de leitura e novos envios, mantendo histórico.

## Pendências e limites conhecidos
- O APK v1 foi compilado com Java 17, SDK Android 35 e Gradle 8.11.1 em ambiente temporário, sem alterar o projeto web; assinatura v2 e conteúdo verificados. Instalação, login e sincronização no aparelho real permanecem pendentes.
- Google/Lovable OAuth não tem retorno nativo de sessão implementado: os links externos abrem no navegador e não transferem sessão ao app. Use email e senha no aplicativo. Login social, retorno de recuperação de senha e links de confirmação precisam ser validados/adaptados em Android antes de prometer suporte nativo. Recuperação e confirmação podem ser feitas no site; depois entre no app com email e senha.
- Sem funcionamento offline ou notificações em segundo plano. Sincronização ocorre com o aplicativo aberto/conectado.
- O Windows v2 é um pacote estático anterior: compartilha dados e permissões, mas não recebe novos elementos visuais automaticamente. Para ter esta interface de preços também no Windows é necessário reempacotar o Windows, tarefa não incluída nesta entrega Android.
- Compilação e assinatura do APK foram verificadas; instalação, login e sincronização entre aparelhos ainda não foram testados. A interface web foi testada com contas reais, e as regras/cálculos têm testes automatizados.
