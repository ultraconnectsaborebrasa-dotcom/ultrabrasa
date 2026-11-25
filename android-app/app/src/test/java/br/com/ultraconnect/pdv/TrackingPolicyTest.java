package br.com.ultraconnect.pdv;
import org.junit.Test;
import static org.junit.Assert.*;

public class TrackingPolicyTest {
    @Test public void collectsOnlyWithConsentAndOpenShift() {
        assertTrue(TrackingPolicy.canCollect(true, true, true));
        assertFalse(TrackingPolicy.canCollect(false, true, true));
        assertFalse(TrackingPolicy.canCollect(true, false, true));
        assertFalse(TrackingPolicy.canCollect(true, true, false));
    }
    @Test public void doesNotReplayOldLocations() {
        assertTrue(TrackingPolicy.fresh(1000000, 1000000));
        assertFalse(TrackingPolicy.fresh(879999, 1000000));
        assertFalse(TrackingPolicy.fresh(1015001, 1000000));
    }
}