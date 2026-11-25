package br.com.ultraconnect.pdv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import org.json.JSONObject;

public class CourierMessagingService extends FirebaseMessagingService {
    static final String CHANNEL = "courier-delivery-alerts-v1";
    static final String OPEN = "br.com.ultraconnect.pdv.OPEN_DELIVERIES";
    static void channel(Context context) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "Novas entregas · som e aviso na tela", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Pedidos designados ao seu aparelho");
        channel.enableVibration(true);
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
    static void show(Context context, String id, String title, String body) {
        channel(context);
        PendingIntent open = PendingIntent.getActivity(context, 4106, new Intent(context, MainActivity.class).setAction(OPEN).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new Notification.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_send)
            .setContentTitle(title).setContentText(body).setStyle(new Notification.BigTextStyle().bigText(body))
            .setCategory(Notification.CATEGORY_MESSAGE).setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(open).setAutoCancel(true).build();
        context.getSystemService(NotificationManager.class).notify(id.hashCode(), notification);
    }
    static void register(Context context) {
        final Context app = context.getApplicationContext();
        FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token -> upload(app, token));
    }
    static void upload(Context context, String token) {
        String secret = DeviceStore.secret(context);
        if (secret == null) return;
        new Thread(() -> { try { NativeApi.post(new JSONObject().put("action", "push-token").put("token", token), secret); } catch (Exception ignored) { /* Retried on next app resume; tokens are never logged. */ } }, "push-register").start();
    }
    @Override public void onNewToken(String token) { upload(this, token); }
    @Override public void onMessageReceived(RemoteMessage message) {
        if (DeviceStore.secret(this) == null) return;
        String id = message.getData().get("eventId");
        if (id == null || id.length() > 64) return;
        android.content.SharedPreferences prefs = getSharedPreferences("courier-alerts", MODE_PRIVATE);
        if (prefs.contains(id)) return;
        java.util.Map<String, ?> previous = prefs.getAll();
        android.content.SharedPreferences.Editor editor = prefs.edit();
        if (previous.size() >= 100) editor.clear();
        editor.putBoolean(id, true).apply();
        show(this, id, "Nova entrega para você", "Abra o aplicativo para conferir o pedido e iniciar sua rota.");
    }
}
