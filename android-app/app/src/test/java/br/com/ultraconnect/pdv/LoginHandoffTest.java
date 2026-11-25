package br.com.ultraconnect.pdv;

import static org.junit.Assert.*;
import org.junit.Test;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.X509EncodedKeySpec;
import java.security.spec.MGF1ParameterSpec;
import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.OAEPParameterSpec;
import javax.crypto.spec.PSource;

public class LoginHandoffTest {
    private String response(String url) throws Exception {
        String state = url.split("state=")[1].split("&")[0];
        PublicKey publicKey = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(LoginHandoff.decode(url.split("key=")[1])));
        byte[] key = new byte[32], iv = new byte[12]; new SecureRandom().nextBytes(key); new SecureRandom().nextBytes(iv);
        Cipher rsa = Cipher.getInstance("RSA/ECB/OAEPPadding");
        rsa.init(Cipher.ENCRYPT_MODE, publicKey, new OAEPParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, PSource.PSpecified.DEFAULT));
        Cipher aes = Cipher.getInstance("AES/GCM/NoPadding");
        aes.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key,"AES"), new GCMParameterSpec(128,iv));
        aes.updateAAD(state.getBytes(StandardCharsets.UTF_8));
        return state + "." + LoginHandoff.encode(rsa.doFinal(key)) + "." + LoginHandoff.encode(iv) + "." + LoginHandoff.encode(aes.doFinal("test-session".getBytes(StandardCharsets.UTF_8)));
    }
    @Test public void returnsOnceToInitiatingDevice() throws Exception {
        LoginHandoff login = new LoginHandoff(); String envelope = response(login.begin(1000));
        assertEquals("test-session", login.consume(envelope,2000));
        assertThrows(SecurityException.class, () -> login.consume(envelope,2001));
    }
    @Test public void rejectsExpiredLoginAfterFiveMinutes() throws Exception {
        LoginHandoff login = new LoginHandoff(); String envelope = response(login.begin(1000));
        assertThrows(SecurityException.class, () -> login.consume(envelope,301001));
    }
    @Test public void rejectsAnotherDeviceAndModifiedState() throws Exception {
        LoginHandoff first = new LoginHandoff(), other = new LoginHandoff();
        String envelope = response(first.begin(1000)); other.begin(1000);
        assertThrows(SecurityException.class, () -> other.consume(envelope,2000));
        assertThrows(SecurityException.class, () -> first.consume("0" + envelope.substring(1),2000));
    }
}