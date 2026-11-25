package br.com.ultraconnect.pdv;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.spec.MGF1ParameterSpec;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;
import javax.crypto.spec.SecretKeySpec;

/** Ephemeral: no session, private key or login payload is written to disk. */
final class LoginHandoff {
    private KeyPair keys;
    private String state;
    private long expires;
    synchronized String begin(long now) throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
        byte[] random = new byte[32]; new SecureRandom().nextBytes(random);
        StringBuilder value = new StringBuilder();
        for (byte b : random) value.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        state = value.toString(); expires = now + 300000;
        return "https://ultraconnectbrasa.com.br/android-login?state=" + state + "&key=" + encode(keys.getPublic().getEncoded());
    }
    synchronized String consume(String envelope, long now) throws Exception {
        if (keys == null || state == null || now > expires || envelope == null || envelope.length() > 26000) throw new SecurityException("Login expirado. Comece novamente no aplicativo.");
        String[] parts = envelope.split("\\.", -1);
        if (parts.length != 4 || !state.equals(parts[0])) throw new SecurityException("Retorno de login inválido.");
        KeyPair keyPair = keys; String expected = state;
        keys = null; state = null; expires = 0; // one-use, including failed decryption
        Cipher rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
        rsa.init(Cipher.DECRYPT_MODE, keyPair.getPrivate(), new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        byte[] key = rsa.doFinal(decode(parts[1]));
        byte[] iv = decode(parts[2]);
        if (key.length != 32 || iv.length != 12) throw new SecurityException("Retorno inválido.");
        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
        aes.updateAAD(expected.getBytes(StandardCharsets.UTF_8));
        return new String(aes.doFinal(decode(parts[3])), StandardCharsets.UTF_8);
    }
    static String encode(byte[] bytes) { return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    static byte[] decode(String value) { return Base64.getUrlDecoder().decode(value); }
}