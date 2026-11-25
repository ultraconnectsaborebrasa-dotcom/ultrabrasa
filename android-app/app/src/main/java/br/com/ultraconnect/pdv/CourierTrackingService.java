package br.com.ultraconnect.pdv;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import org.json.JSONObject;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class CourierTrackingService extends Service {
    private static final String CHANNEL = "courier-gps";
    private static final int ID = 4103;
    static final String PAUSE = "br.com.ultraconnect.pdv.PAUSE_GPS";
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private LocationManager manager;
    private volatile Location latest;
    private volatile boolean destroyed;
    private volatile boolean approved;
    private boolean listening;
    private boolean sawOpenShift;
    private final LocationListener listener = new LocationListener() {
        @Override public void onLocationChanged(Location location) { if (approved) latest = location; }
        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
    };
    private Notification notification(String text) {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent pause = PendingIntent.getService(this, 1, new Intent(this, CourierTrackingService.class).setAction(PAUSE), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Ultraconnect · GPS do entregador").setContentText(text).setContentIntent(open)
            .setOngoing(true).setOnlyAlertOnce(true).addAction(new Notification.Action.Builder(null, "Pausar GPS", pause).build()).build();
    }
    @Override public void onCreate() {
        super.onCreate();
        manager = (LocationManager) getSystemService(LOCATION_SERVICE);
        NotificationManager notifications = getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "Localização durante o turno", NotificationManager.IMPORTANCE_LOW));
        startForeground(ID, notification("Conferindo autorização e turno…"));
        worker.scheduleWithFixedDelay(this::tick, 0, 30, TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && PAUSE.equals(intent.getAction())) {
            DeviceStore.consent(this, false); approved = false; stopListening();
            String secret = DeviceStore.secret(this);
            worker.execute(() -> { try { NativeApi.post(new JSONObject().put("action", "pause"), secret); } catch (Exception ignored) {} });
            stopSelf();
        }
        return START_NOT_STICKY;
    }
    private void tick() {
        if (destroyed) return;
        String secret = DeviceStore.secret(this);
        if (secret == null || !DeviceStore.consent(this)) { main.post(this::stopSelf); return; }
        try {
            JSONObject state = NativeApi.post(new JSONObject().put("action", "status"), secret);
            boolean enabled = state.optBoolean("enabled"); boolean shift = state.optBoolean("shift_open");
            approved = TrackingPolicy.canCollect(DeviceStore.consent(this), enabled, shift);
            if (!enabled) { DeviceStore.consent(this, false); main.post(this::stopSelf); return; }
            if (sawOpenShift && !shift) { main.post(this::stopSelf); return; }
            sawOpenShift = sawOpenShift || shift;
            main.post(() -> {
                if (destroyed) return;
                if (approved) startListening(); else stopListening();
                getSystemService(NotificationManager.class).notify(ID, notification(approved ? "GPS ativo durante o turno · toque para abrir" : "Aguardando registrar a entrada do turno"));
            });
            Location position = latest;
            if (approved && position != null && TrackingPolicy.fresh(position.getTime(), System.currentTimeMillis())) {
                JSONObject reply = NativeApi.post(new JSONObject().put("action", "location").put("latitude", position.getLatitude())
                    .put("longitude", position.getLongitude()).put("accuracy", position.hasAccuracy() ? position.getAccuracy() : 100000)
                    .put("observedAt", Instant.ofEpochMilli(position.getTime()).toString()), secret);
                if (!reply.optBoolean("tracking")) { approved = false; main.post(this::stopSelf); }
            }
        } catch (NativeApi.Unauthorized error) { DeviceStore.consent(this, false); approved = false; main.post(this::stopSelf); }
        catch (Exception error) {
            // No offline queue: stop acquisition until a fresh authorization check.
            approved = false;
            main.post(() -> { if (!destroyed) { stopListening(); getSystemService(NotificationManager.class).notify(ID, notification("GPS pausado · aguardando conexão")); } });
        }
    }
    private void startListening() {
        if (listening || destroyed || !approved) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) { DeviceStore.consent(this, false); stopSelf(); return; }
        try {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED && manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 15000, 10, listener, Looper.getMainLooper());
            if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15000, 10, listener, Looper.getMainLooper());
            listening = true;
        } catch (SecurityException error) { DeviceStore.consent(this, false); stopSelf(); }
    }
    private void stopListening() { if (manager != null) manager.removeUpdates(listener); listening = false; latest = null; }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        destroyed = true; approved = false; stopListening(); worker.shutdown(); main.removeCallbacksAndMessages(null);
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}