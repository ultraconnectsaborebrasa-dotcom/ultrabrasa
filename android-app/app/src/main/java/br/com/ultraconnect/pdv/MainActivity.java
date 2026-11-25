package br.com.ultraconnect.pdv;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.EditText;
import android.app.NotificationManager;
import org.json.JSONObject;
import java.security.SecureRandom;

public class MainActivity extends Activity {
    private static final String HOME = "https://ultraconnectbrasa.com.br/";
    private static final int LOCATION_PERMISSION_REQUEST = 4102;
    private static final int NATIVE_LOCATION_REQUEST = 4104;
    private static final int NOTIFICATION_REQUEST = 4105;
    private static final int DELIVERY_NOTIFICATION_REQUEST = 4106;
    private WebView web;
    private ProgressBar progress;
    private boolean showingError;
    private final LoginHandoff login = new LoginHandoff();
    private String pendingLocationOrigin;
    private GeolocationPermissions.Callback pendingLocationCallback;

    private boolean trusted(Uri uri) {
        if (!"https".equalsIgnoreCase(uri.getScheme()) || (uri.getPort() != -1 && uri.getPort() != 443)) return false;
        String host = uri.getHost();
        return host != null && (
            "ultraconnectbrasa.com.br".equalsIgnoreCase(host)
            || "www.ultraconnectbrasa.com.br".equalsIgnoreCase(host)
            || "ultrabrasa.lovable.app".equalsIgnoreCase(host)
        );
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void clearPendingLocation(boolean allow) {
        if (pendingLocationCallback != null && pendingLocationOrigin != null) {
            pendingLocationCallback.invoke(pendingLocationOrigin, allow, allow);
        }
        pendingLocationCallback = null;
        pendingLocationOrigin = null;
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        LinearLayout toolbar = new LinearLayout(this);
        TextView label = new TextView(this); label.setText("Ultraconnect Entregas");
        label.setPadding(16, 8, 8, 8);
        toolbar.addView(label, new LinearLayout.LayoutParams(0, -2, 1));
        ImageButton gps = new ImageButton(this); gps.setImageResource(android.R.drawable.ic_menu_mylocation);
        gps.setContentDescription("GPS em segundo plano"); gps.setOnClickListener(view -> showGps());
        int targetSize = Math.round(48 * getResources().getDisplayMetrics().density);
        toolbar.addView(gps, new LinearLayout.LayoutParams(targetSize, targetSize));
        ImageButton bell = new ImageButton(this); bell.setImageResource(android.R.drawable.ic_dialog_info);
        bell.setContentDescription("Avisos de entregas"); bell.setOnClickListener(view -> showDeliveryNotifications());
        toolbar.addView(bell, new LinearLayout.LayoutParams(targetSize, targetSize));
        CourierMessagingService.channel(this);
        layout.addView(toolbar);
        // Handle system bars and keyboard on Android 15 edge-to-edge.
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            layout.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
        }
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        layout.addView(progress, new LinearLayout.LayoutParams(-1, 6));
        web = new WebView(this);
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSafeBrowsingEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " UltraconnectEntregas/1.3");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value == 100 ? View.GONE : View.VISIBLE);
            }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!trusted(Uri.parse(origin))) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, true);
                    return;
                }
                if (pendingLocationCallback != null) {
                    callback.invoke(origin, false, false);
                    return;
                }
                pendingLocationOrigin = origin;
                pendingLocationCallback = callback;
                requestPermissions(new String[] {
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                }, LOCATION_PERMISSION_REQUEST);
            }
            @Override public void onGeolocationPermissionsHidePrompt() {
                clearPendingLocation(false);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (request.isForMainFrame() && trusted(uri) && "/android-login".equals(uri.getPath()) && "1".equals(uri.getQueryParameter("native"))) {
                    beginGoogleLogin(); return true;
                }
                if (trusted(uri)) return false;
                if ("https".equalsIgnoreCase(uri.getScheme()) || "mailto".equalsIgnoreCase(uri.getScheme()) || "tel".equalsIgnoreCase(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (android.content.ActivityNotFoundException e) { showError("Não foi encontrado um aplicativo para abrir esse link."); }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (!trusted(Uri.parse(url))) { view.stopLoading(); return; }
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel(); showError("Não foi possível verificar a conexão segura. Confira a data do celular e sua internet.");
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("Sem conexão com o PDV. Confira sua internet e tente novamente.");
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);
        if (Intent.ACTION_VIEW.equals(getIntent().getAction())) receiveLogin(getIntent());
    }

    private void beginGoogleLogin() {
        new Thread(() -> {
            try {
                String url = login.begin(System.currentTimeMillis());
                runOnUiThread(() -> {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
                    catch (android.content.ActivityNotFoundException error) { showError("Instale ou ative um navegador para entrar com Google."); }
                });
            } catch (Exception error) { runOnUiThread(() -> showError("Não foi possível iniciar o login seguro. Tente novamente.")); }
        }, "google-login").start();
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (CourierMessagingService.OPEN.equals(intent.getAction())) { web.loadUrl(HOME); return; }
        receiveLogin(intent);
    }
    private void receiveLogin(Intent intent) {
        Uri uri = intent.getData();
        if (uri == null || !"ultraconnect-entregas".equals(uri.getScheme()) || !"login".equals(uri.getHost())) return;
        String envelope = intent.getStringExtra("envelope");
        intent.removeExtra("envelope"); intent.setData(null);
        new Thread(() -> {
            try {
                String session = login.consume(envelope, System.currentTimeMillis());
                JSONObject tokens = new JSONObject(session);
                if (tokens.optString("access_token").length() < 20 || tokens.optString("refresh_token").length() < 10) throw new SecurityException();
                String fragment = LoginHandoff.encode(session.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                runOnUiThread(() -> { if (!isFinishing()) web.loadUrl(HOME + "android-login#session=" + fragment); });
            } catch (Exception error) { runOnUiThread(() -> showError("O retorno do Google expirou ou não pertence a este aparelho. Toque em Continuar com Google e tente novamente.")); }
        }, "google-return").start();
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == DELIVERY_NOTIFICATION_REQUEST) { showDeliveryNotifications(); return; }
        if (requestCode == NATIVE_LOCATION_REQUEST) {
            if (hasLocationPermission()) activateGps();
            else showError("O GPS precisa da sua autorização. Você pode continuar usando os pedidos sem ativá-lo.");
            return;
        }
        if (requestCode == NOTIFICATION_REQUEST) {
            if (getSystemService(NotificationManager.class).areNotificationsEnabled()) activateGps();
            else showError("Autorize os avisos nas configurações do aplicativo para manter o aviso permanente do GPS.");
            return;
        }
        if (requestCode != LOCATION_PERMISSION_REQUEST) return;
        boolean granted = hasLocationPermission();
        clearPendingLocation(granted);
    }

    private void showGps() {
        if (DeviceStore.secret(this) == null) { showPair(); return; }
        new AlertDialog.Builder(this).setTitle("GPS em segundo plano")
            .setMessage("Ative somente na sua conta. A localização é enviada durante o turno aberto, inclusive com a tela bloqueada. O aviso permanente permite pausar; registrar a saída interrompe o GPS.")
            .setPositiveButton("Ativar GPS", (dialog, which) -> activateGps())
            .setNeutralButton("Pausar GPS", (dialog, which) -> pauseGps())
            .setNegativeButton("Vincular outra conta", (dialog, which) -> showPair()).show();
    }
    private void showPair() {
        EditText code = new EditText(this); code.setSingleLine(true); code.setHint("Código de vínculo");
        code.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
        new AlertDialog.Builder(this).setTitle("Vincular meu aparelho")
            .setMessage("Entre na sua conta de entregador e gere o código em Minha localização. Cole o código aqui; ele vale por 5 minutos.")
            .setView(code).setPositiveButton("Vincular", (dialog, which) -> {
                String value = code.getText().toString().trim().toLowerCase(java.util.Locale.ROOT);
                if (!value.matches("[a-f0-9]{32}")) { showError("Copie o código completo da sua conta de entregador."); return; }
                pauseGps();
                new Thread(() -> {
                    try {
                        byte[] random = new byte[32]; new SecureRandom().nextBytes(random);
                        StringBuilder secret = new StringBuilder(); for (byte b : random) secret.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
                        NativeApi.post(new JSONObject().put("action", "pair").put("code", value).put("secret", secret.toString()), null);
                        DeviceStore.save(this, secret.toString());
                        CourierMessagingService.register(this);
                        runOnUiThread(() -> { if (!isFinishing()) activateGps(); });
                    } catch (Exception error) { runOnUiThread(() -> showError(error instanceof NativeApi.Unauthorized ? error.getMessage() : "Não foi possível vincular. Confira a internet e gere um novo código.")); }
                }, "gps-pair").start();
            }).setNegativeButton("Cancelar", null).show();
    }
    private void activateGps() {
        if (DeviceStore.secret(this) == null) { showPair(); return; }
        if (pendingLocationCallback != null) { showError("Conclua primeiro a autorização de localização da página e depois ative o GPS do turno."); return; }
        if (!hasLocationPermission()) {
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, NATIVE_LOCATION_REQUEST); return;
        }
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_REQUEST); return;
        }
        if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) { showError("Ative as notificações nas configurações do Android para manter o aviso permanente do GPS."); return; }
        new Thread(() -> {
            try {
                NativeApi.post(new JSONObject().put("action", "resume"), DeviceStore.secret(this));
                runOnUiThread(() -> { if (!isFinishing()) { DeviceStore.consent(this, true); startGpsService(); } });
            } catch (Exception error) { runOnUiThread(() -> showError(error instanceof NativeApi.Unauthorized ? error.getMessage() : "Não foi possível ativar o GPS. Confira sua internet e se o sistema já foi publicado.")); }
        }, "gps-activate").start();
    }
    private void showDeliveryNotifications() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            new AlertDialog.Builder(this).setTitle("Avisos de entregas").setMessage("Autorize os avisos para receber novas entregas com som e notificação na tela.")
                .setPositiveButton("Autorizar", (dialog, which) -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, DELIVERY_NOTIFICATION_REQUEST))
                .setNeutralButton("Configurações", (dialog, which) -> openNotificationSettings()).setNegativeButton("Agora não", null).show(); return;
        }
        CourierMessagingService.register(this);
        new AlertDialog.Builder(this).setTitle("Avisos de entregas")
            .setMessage(DeviceStore.secret(this) == null ? "Vincule este aparelho à sua conta pelo botão GPS para receber somente suas entregas. Depois autorize som e avisos na tela." : "Aparelho vinculado. Ative som, vibração e exibição na tela em Novas entregas. O modo silencioso e Não perturbe do celular podem bloquear os alertas.")
            .setPositiveButton("Testar som e aviso", (dialog, which) -> CourierMessagingService.show(this, "local-test", "Teste de aviso · Ultraconnect", "Os avisos das suas entregas aparecerão aqui."))
            .setNeutralButton("Configurações", (dialog, which) -> openNotificationSettings()).setNegativeButton("Fechar", null).show();
    }
    private void openNotificationSettings() {
        startActivity(new Intent(android.provider.Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
            .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName())
            .putExtra(android.provider.Settings.EXTRA_CHANNEL_ID, CourierMessagingService.CHANNEL));
    }
    private void pauseGps() {
        DeviceStore.consent(this, false); stopService(new Intent(this, CourierTrackingService.class));
        String secret = DeviceStore.secret(this);
        if (secret != null) new Thread(() -> { try { NativeApi.post(new JSONObject().put("action", "pause"), secret); } catch (Exception ignored) {} }, "gps-pause").start();
    }
    private void startGpsService() {
        if (!DeviceStore.consent(this) || !hasLocationPermission() || !getSystemService(NotificationManager.class).areNotificationsEnabled()) return;
        try { startForegroundService(new Intent(this, CourierTrackingService.class)); }
        catch (RuntimeException error) { DeviceStore.consent(this, false); showError("Não foi possível manter o GPS ativo. Abra o aplicativo e confira as permissões de localização e avisos."); }
    }

    private void showError(String message) {
        if (isFinishing() || showingError) return;
        showingError = true;
        new AlertDialog.Builder(this).setTitle("Ultraconnect").setMessage(message)
            .setPositiveButton("Tentar novamente", (dialog, which) -> web.loadUrl(HOME))
            .setNegativeButton("Fechar", (dialog, which) -> finish())
            .setOnDismissListener(dialog -> showingError = false).show();
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { CookieManager.getInstance().flush(); web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); CourierMessagingService.register(this); startGpsService(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() {
        clearPendingLocation(false);
        if (isFinishing()) stopService(new Intent(this, CourierTrackingService.class));
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
