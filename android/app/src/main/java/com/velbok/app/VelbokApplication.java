package com.velbok.app;

import android.app.Application;

import com.stripe.stripeterminal.TerminalApplicationDelegate;

/**
 * Stripe Tap to Pay uses a separate process — skip custom init there.
 * Main process must call TerminalApplicationDelegate once at startup (Stripe requirement).
 */
public class VelbokApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        if (isStripeTapToPayProcess()) {
            return;
        }
        TerminalApplicationDelegate.onCreate(this);
    }

    private static boolean isStripeTapToPayProcess() {
        try {
            Class<?> tapToPay = Class.forName("com.stripe.stripeterminal.taptopay.TapToPay");
            Object result = tapToPay.getMethod("isInTapToPayProcess").invoke(null);
            return result instanceof Boolean && (Boolean) result;
        } catch (ReflectiveOperationException ignored) {
            return false;
        }
    }
}
