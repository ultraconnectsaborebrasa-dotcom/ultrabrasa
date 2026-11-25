# Ultraconnect Entregas — Android

Aplicativo nativo para os entregadores acessarem ponto, GPS e rotas do sistema Ultraconnect já existente. A versão 1.3.0 (APK v4) acrescenta retorno do Google ao WebView com sessão cifrada e navegação fixa Entregas / Ponto e GPS / Meu acerto. Compilação e testes foram verificados; instalação, Google externo e GPS físico continuam pendentes em aparelho real.

## O que o app usa
- Site oficial: https://ultraconnectbrasa.com.br. O endereço https://ultrabrasa.lovable.app continua autorizado como alternativa publicada.
- As mudanças publicadas no site aparecem ao abrir ou recarregar o aplicativo, sem instalar outro APK. Alterações nativas do Android continuam exigindo uma nova compilação.
- Mesmas contas, permissões, pedidos e rotas do site; não cria outro banco nem armazena uma cópia separada do PDV.
- Internet necessária. A sessão de email e senha fica no WebView do aparelho, separada da sessão do navegador.
- GPS nativo autorizado e vinculado ao próprio entregador, limitado ao turno aberto. Um serviço com aviso permanente e ação Pausar GPS continua fora da tela do aplicativo, sem depender do WebView. Não coleta antes da entrada, após a saída, durante falta de autorização/conexão ou depois da desativação.
- Sem ponte JavaScript, acesso a arquivos ou tráfego sem HTTPS. Links externos de navegação, telefone e WhatsApp abrem no aplicativo correspondente.
- Nome: Ultraconnect Entregas. Pacote: br.com.ultraconnect.entregas. Android 8 (API 26) ou superior; versão 1.3.0 (versionCode 4).
- O pacote é separado do APK geral anterior, portanto pode ser instalado sem desinstalar o Ultraconnect antigo.

## Gerar APK no Android Studio
O projeto inclui `app/google-services.json` do Firebase cadastrado para o pacote Android e o SDK Firebase Messaging. Esse arquivo contém configuração pública do aplicativo, não a chave privada usada para autorizar envios.

### Situação das notificações Firebase
- Conexão de envio autorizada na Lovable e verificação `validate_only` aprovada, sem enviar avisos reais.
- Configuração Android conferida e incluída na pasta do aplicativo; Gradle prepara a inicialização do Firebase na próxima compilação.
- **Ainda não há notificações automáticas de novas rotas com o aplicativo fechado.** O vínculo seguro e a permissão de notificações existem para o GPS, mas faltam registro/renovação do token FCM, canal de som de pedidos e disparos por evento. Não inscrever aparelhos em um tópico compartilhado de pedidos. O aviso permanente do GPS não é um alerta de pedido.
- Não adicionar ponte JavaScript nem expor tokens de sessão para integrar o WebView. O registro do aparelho precisa preservar as contas e permissões existentes.
- A v3 precisa ser instalada; publicar o site não atualiza o código nativo dos APKs antigos.

### Google e retorno ao aplicativo (v4)
1. No aplicativo, escolha Entrar na conta e Continuar com Google; o Android abre o navegador seguro.
2. Continue com Google e escolha a conta liberada pela loja.
3. Toque em Voltar ao aplicativo e confirme a abertura no Android. O WebView restaura a sessão e verifica as permissões existentes.
4. O início cria uma chave efêmera e um estado de uso único, válidos por cinco minutos. A sessão retorna cifrada (RSA-OAEP SHA-256 + AES-256-GCM) num intent explicitamente direcionado ao pacote, sem chave privada ou sessão em disco/ponte JavaScript. O fragmento interno é removido antes de restaurar a sessão.
5. Se o Android encerrar o processo ou o login expirar, inicie novamente pelo aplicativo. Nenhum token OAuth deve ser colocado em logs ou anexos.
6. O retorno Google exige v4 e publicação da página /android-login. A v4 usa a mesma assinatura da v3 e pode atualizá-la sem desinstalar; versões com outra assinatura exigem reinstalação.

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
- Sessão real temporária restaurada em contexto nativo novo, com URL limpa e painel autorizado. Navegação, entrada, acerto e saída conferidos sem pedidos reais; conta/cadastro de teste removidos.
- GPS físico, bateria, instalação e ida/volta ao Google em aparelho real ainda não verificados. O retorno nativo está implementado e requer publicação + instalação da v4; testes de cifra, uso único, outro aparelho e expiração passaram.
