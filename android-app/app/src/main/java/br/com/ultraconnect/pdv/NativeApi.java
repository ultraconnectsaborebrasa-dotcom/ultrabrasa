package br.com.ultraconnect.pdv;

import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;

final class NativeApi {
    static JSONObject post(JSONObject body, String secret) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL("https://ultraconnectbrasa.com.br/api/public/android/device").openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        connection.setRequestMethod("POST"); connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        if (secret != null) connection.setRequestProperty("Authorization", "Bearer " + secret);
        try {
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int status = connection.getResponseCode();
            if (status == 401) throw new Unauthorized();
            if (status != 200) throw new java.io.IOException("Não foi possível conectar ao GPS (" + status + ").");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[1024]; int count;
                while ((count = input.read(buffer)) != -1) { if (output.size() + count > 8192) throw new java.io.IOException("Resposta inválida"); output.write(buffer, 0, count); }
                return new JSONObject(output.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
    }
    static class Unauthorized extends java.io.IOException { Unauthorized() { super("Aparelho não autorizado; gere outro código e vincule novamente."); } }
}