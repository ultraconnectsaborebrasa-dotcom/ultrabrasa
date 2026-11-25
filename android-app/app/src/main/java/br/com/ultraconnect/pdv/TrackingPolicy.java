package br.com.ultraconnect.pdv;

final class TrackingPolicy {
    static boolean canCollect(boolean consent, boolean enabled, boolean shiftOpen) {
        return consent && enabled && shiftOpen;
    }
    static boolean fresh(long observedAt, long now) {
        return observedAt >= now - 120000 && observedAt <= now + 15000;
    }
}