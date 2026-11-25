# Ultraconnect Entregas — Android

Aplicativo nativo para os entregadores acessarem ponto, GPS e rotas do sistema Ultraconnect já existente. A versão 1.2.0 (APK v3) inclui GPS nativo durante o turno, inclusive em segundo plano. Compilação, testes Android, análise de permissões, alinhamento e assinatura foram verificados; instalação e GPS físico continuam pendentes.

## O que o app usa
- Site oficial: https://ultraconnectbrasa.com.br. O endereço https://ultrabrasa.lovable.app continua autorizado como alternativa publicada.
- As mudanças publicadas no site aparecem ao abrir ou recarregar o aplicativo, sem instalar outro APK. Alterações nativas do Android continuam exigindo uma nova compilação.
- Mesmas contas, permissões, pedidos e rotas do site; não cria outro banco nem armazena uma cópia separada do PDV.
- Internet necessária. A sessão de email e senha fica no WebView do aparelho, separada da sessão do navegador.
- GPS nativo autorizado e vinculado ao próprio entregador, limitado ao turno aberto. Um serviço com aviso permanente e ação Pausar GPS continua fora da tela do aplicativo, sem depender do WebView. Não coleta antes da entrada, após a saída, durante falta de autorização/conexão ou depois da desativação.
- Sem ponte JavaScript, acesso a arquivos ou tráfego sem HTTPS. Links externos de navegação, telefone e WhatsApp abrem no aplicativo correspondente.
- Nome: Ultraconnect Entregas. Pacote: br.com.ultraconnect.entregas. Android 8 (API 26) ou superior; versão 1.2.0 (versionCode 3).
- O pacote é separado do APK geral anterior, portanto pode ser instalado sem desinstalar o Ultraconnect antigo.

## Gerar APK no Android Studio
O projeto inclui `app/google-services.json` do Firebase cadastrado para o pacote Android e o SDK Firebase Messaging. Esse arquivo contém configuração pública do aplicativo, não a chave privada usada para autorizar envios.

### Situação das notificações Firebase
- Conexão de envio autorizada na Lovable e verificação `validate_only` aprovada, sem enviar avisos reais.
- Configuração Android conferida e incluída na pasta do aplicativo; Gradle prepara a inicialização do Firebase na próxima compilação.
- **Ainda não há notificações automáticas de novas rotas com o aplicativo fechado.** O vínculo seguro e a permissão de notificações existem para o GPS, mas faltam registro/renovação do token FCM, canal de som de pedidos e disparos por evento. Não inscrever aparelhos em um tópico compartilhado de pedidos. O aviso permanente do GPS não é um alerta de pedido.
- Não adicionar ponte JavaScript nem expor tokens de sessão para integrar o WebView. O registro do aparelho precisa preservar as contas e permissões existentes.
- A v3 precisa ser instalada; publicar o site não atualiza o código nativo dos APKs antigos.

### Ativar GPS em segundo plano
1. Entre na sua conta de entregador e, em Minha localização, toque em Vincular aparelho.
2. Copie o código temporário. No ícone GPS da barra nativa superior, cole-o em Vincular meu aparelho.
3. Autorize localização e notificações. Android 13+ pede separadamente. Localização Enquanto usa o app permite o serviço visível continuar em segundo plano; não é solicitada coleta oculta permanente.
4. Registre a entrada. O serviço confere turno e autorização antes de coletar; não guarda uma fila de posições antigas.
5. Pausar GPS no aviso, Desativar GPS na página e saída do turno interrompem o compartilhamento. O banco revalida desativação e saída em cada gravação; o aviso é encerrado na próxima conferência (aproximadamente 30 segundos, sujeito ao Android).
6. Vínculos duram até 30 dias. Um novo vínculo revoga o anterior; a credencial local fica criptografada no Android Keystore e só permite GPS, não pedidos ou finanças.

Android pode interromper serviços após Forçar parada, reiniciar o celular ou por restrições de bateria. Reabra o aplicativo nesses casos; não há coleta invisível nem reinício após boot.

1. Instale Android Studio estável: https://developer.android.com/studio.
2. Abra esta pasta no Android Studio e aguarde o Gradle Sync.
3. Em Settings > Build, Execution, Deployment > Build Tools > Gradle, selecione Gradle JDK 17.
4. Em Tools > SDK Manager, instale Android SDK Platform 35, Build-Tools 35.0.0 e Platform-Tools. Aceite as licenças.
5. Para desenvolvimento, execute `./gradlew assembleDebug` no macOS/Linux ou `.\gradlew.bat assembleDebug` no Windows.
6. O APK de desenvolvimento fica em `app/build/outputs/apk/debug/app-debug.apk`.

## Assinatura para distribuição própria
Para distribuição própria, use uma chave de assinatura guardada fora do projeto. Não envie chaves nem senhas ao chat. A assinatura temporária da v2 não está disponível; a v3 tem nova assinatura, portanto exige reinstalação e novo login. Os dados da loja permanecem na Cloud. A assinatura v3 está preservada fora do repositório, em metadados privados, para futuras atualizações; nunca incluí-la em entregas de fonte.

## Antes de distribuir
1. Instale em um aparelho Android real e abra o Ultraconnect Entregas.
2. Entre com a conta de um entregador e confira ponto, estoque, rotas, endereços e pagamentos permitidos.
3. Vincule e autorize o GPS, bata a entrada, abra outro aplicativo e bloqueie a tela; confira uma posição real atualizada no painel administrativo.
4. Registre a saída e confirme que a localização deixou de ser compartilhada.
5. Teste botão Voltar, teclado, retorno de uma rota externa, falta de internet e persistência da sessão.

## Verificação desta entrega
- `assembleRelease`, `testDebugUnitTest` e `lintRelease` concluídos com sucesso; testes de consentimento, turno e frescor de posição aprovados.
- APK final sem modo de desenvolvimento, com assinatura v2/v3 e alinhamento verificados.
- Vínculo único, bloqueio antes da entrada, posição fictícia lida pela interface, desativação e saída conferidos com entregador temporário. O domínio oficial está incorporado no APK.
- GPS físico, bateria e instalação em aparelho real ainda não verificados. Login Google mantém o fluxo web existente; retorno nativo do Google não faz parte desta atualização.
