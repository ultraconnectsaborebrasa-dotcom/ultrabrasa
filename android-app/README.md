# Ultraconnect Entregas — Android

Aplicativo nativo para os entregadores acessarem ponto, GPS e rotas do sistema Ultraconnect já existente. O APK v2 foi compilado em modo final, alinhado e assinado; assinatura v2/v3, pacote, versão, permissões e endereço incorporado foram verificados. A instalação e a abertura em um aparelho real não foram testadas neste ambiente.

## O que o app usa
- Site oficial: https://ultraconnectbrasa.com.br. O endereço https://ultrabrasa.lovable.app continua autorizado como alternativa publicada.
- As mudanças publicadas no site aparecem ao abrir ou recarregar o aplicativo, sem instalar outro APK. Alterações nativas do Android continuam exigindo uma nova compilação.
- Mesmas contas, permissões, pedidos e rotas do site; não cria outro banco nem armazena uma cópia separada do PDV.
- Internet necessária. A sessão de email e senha fica no WebView do aparelho, separada da sessão do navegador.
- GPS somente quando o entregador usa a localização e autoriza no aparelho. O GPS em segundo plano continua dependendo das limitações do navegador/Android.
- Sem ponte JavaScript, acesso a arquivos ou tráfego sem HTTPS. Links externos de navegação, telefone e WhatsApp abrem no aplicativo correspondente.
- Nome: Ultraconnect Entregas. Pacote: br.com.ultraconnect.entregas. Android 8 (API 26) ou superior; versão 1.1.0 (versionCode 2).
- O pacote é separado do APK geral anterior, portanto pode ser instalado sem desinstalar o Ultraconnect antigo.

## Gerar APK no Android Studio
O projeto inclui `app/google-services.json` do Firebase cadastrado para o pacote Android e o SDK Firebase Messaging. Esse arquivo contém configuração pública do aplicativo, não a chave privada usada para autorizar envios.

### Situação das notificações Firebase
- Conexão de envio autorizada na Lovable e verificação `validate_only` aprovada, sem enviar avisos reais.
- Configuração Android conferida e incluída na pasta do aplicativo; Gradle prepara a inicialização do Firebase na próxima compilação.
- **Ainda não há notificações de novas rotas com o aplicativo fechado.** Faltam a permissão e o canal de som nativos, o vínculo autenticado do aparelho ao entregador e o envio automático por evento autorizado. Não inscrever todos os aparelhos em um tópico compartilhado de pedidos.
- Não adicionar ponte JavaScript nem expor tokens de sessão para integrar o WebView. O registro do aparelho precisa preservar as contas e permissões existentes.
- Será necessário compilar, assinar e instalar uma versão nativa atualizada e verificar o recebimento em um aparelho real; esta configuração não altera APKs já instalados.

1. Instale Android Studio estável: https://developer.android.com/studio.
2. Abra esta pasta no Android Studio e aguarde o Gradle Sync.
3. Em Settings > Build, Execution, Deployment > Build Tools > Gradle, selecione Gradle JDK 17.
4. Em Tools > SDK Manager, instale Android SDK Platform 35, Build-Tools 35.0.0 e Platform-Tools. Aceite as licenças.
5. Para desenvolvimento, execute `./gradlew assembleDebug` no macOS/Linux ou `.\gradlew.bat assembleDebug` no Windows.
6. O APK de desenvolvimento fica em `app/build/outputs/apk/debug/app-debug.apk`.

## Assinatura para distribuição própria
Para publicar ou manter futuras atualizações nativas pelo mesmo pacote, use uma chave de assinatura própria e guarde o arquivo e as senhas fora do projeto. No Android Studio, escolha Build > Generate Signed App Bundle or APK > APK e siga o assistente. Não envie a chave nem as senhas para o chat. A assinatura temporária usada para validar este APK não é uma credencial de produção.

## Antes de distribuir
1. Instale em um aparelho Android real e abra o Ultraconnect Entregas.
2. Entre com a conta de um entregador e confira ponto, estoque, rotas, endereços e pagamentos permitidos.
3. Ative a localização somente depois de bater a entrada, autorize o GPS e confira a posição no painel administrativo.
4. Registre a saída e confirme que a localização deixou de ser compartilhada.
5. Teste botão Voltar, teclado, retorno de uma rota externa, falta de internet e persistência da sessão.

## Verificação desta entrega
- `assembleRelease` e `lintRelease` concluídos com sucesso.
- APK final sem modo de desenvolvimento, com assinatura v2/v3 e alinhamento verificados.
- Domínio oficial respondeu HTTPS 200; o endereço oficial está incorporado no APK.
- O simulador não pôde ser iniciado neste ambiente por ausência da biblioteca gráfica do sistema; instalação, login e GPS no aparelho real permanecem pendentes.
