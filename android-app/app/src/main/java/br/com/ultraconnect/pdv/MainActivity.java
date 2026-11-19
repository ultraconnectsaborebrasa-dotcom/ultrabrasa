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

public class MainActivity extends Activity {
    private static final String HOME = "https://ultraconnectbrasa.com.br/";
    private static final int LOCATION_PERMISSION_REQUEST = 4102;
    private WebView web;
    private ProgressBar progress;
    private boolean showingError;
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
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_PERMISSION_REQUEST) return;
        boolean granted = hasLocationPermission();
        clearPendingLocation(granted);
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
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() {
        clearPendingLocation(false);
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
