package com.velbok.app;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;

/**
 * Pre-flight checks for Tap to Pay on Android.
 * Do NOT hard-block on developer-options sensors — Samsung/Android often report stale values.
 * Stripe SDK performs the real secure-environment check during discovery.
 */
@CapacitorPlugin(name = "TapToPayReadiness")
public class TapToPayReadinessPlugin extends Plugin {

    private static boolean isLikelyUnsupportedSamsungGalaxy(String manufacturer, String model) {
        if (manufacturer == null || model == null) return false;
        if (!manufacturer.toLowerCase().contains("samsung")) return false;
        String m = model.toUpperCase();
        return m.contains("SM-G99") || m.contains("SM-G98") || m.contains("SM-G97")
            || m.contains("GALAXY S21") || m.contains("GALAXY S20");
    }

    @PluginMethod
    public void checkEnvironment(PluginCall call) {
        try {
            ApplicationInfo appInfo = getContext().getApplicationInfo();
            boolean debugBuild = (appInfo.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;

            // Informational only — not used to block Enable (unreliable on some OEMs).
            boolean developerOptionsSensor = Settings.Global.getInt(
                getContext().getContentResolver(),
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
                0
            ) != 0;

            boolean usbDebuggingSensor = Settings.Global.getInt(
                getContext().getContentResolver(),
                Settings.Global.ADB_ENABLED,
                0
            ) != 0;

            PackageManager pm = getContext().getPackageManager();
            PackageInfo pkg = pm.getPackageInfo(getContext().getPackageName(), 0);

            boolean hasNfc = pm.hasSystemFeature(PackageManager.FEATURE_NFC);
            // Stripe Tap to Pay SDK 5+ requires hardware ECDH keystore (v100+). S21 and older fail here.
            boolean hardwareKeystoreEcdh =
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                    && pm.hasSystemFeature(PackageManager.FEATURE_HARDWARE_KEYSTORE, 100);
            int androidSdk = Build.VERSION.SDK_INT;
            boolean android13OrLater = androidSdk >= Build.VERSION_CODES.TIRAMISU;

            String manufacturer = Build.MANUFACTURER != null ? Build.MANUFACTURER : "";
            String model = Build.MODEL != null ? Build.MODEL : "";
            boolean stripeListWarning = isLikelyUnsupportedSamsungGalaxy(manufacturer, model);

            boolean locationGranted = pm.checkPermission(
                android.Manifest.permission.ACCESS_FINE_LOCATION,
                getContext().getPackageName()
            ) == PackageManager.PERMISSION_GRANTED;

            boolean locationServicesEnabled = false;
            LocationManager locationManager =
                (LocationManager) getContext().getSystemService(android.content.Context.LOCATION_SERVICE);
            if (locationManager != null) {
                locationServicesEnabled = LocationManagerCompat.isLocationEnabled(locationManager);
            }

            int gmsStatus = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(getContext());
            boolean googlePlayServicesOk = gmsStatus == ConnectionResult.SUCCESS;

            // Hard block only on things we control / measure reliably.
            boolean ready =
                !debugBuild
                    && hasNfc
                    && hardwareKeystoreEcdh
                    && android13OrLater
                    && locationGranted
                    && locationServicesEnabled
                    && googlePlayServicesOk;

            JSObject result = new JSObject();
            result.put("debugBuild", debugBuild);
            result.put("developerOptionsEnabled", developerOptionsSensor);
            result.put("usbDebuggingEnabled", usbDebuggingSensor);
            result.put("hasNfc", hasNfc);
            result.put("hardwareKeystoreEcdh", hardwareKeystoreEcdh);
            result.put("androidSdk", androidSdk);
            result.put("android13OrLater", android13OrLater);
            result.put("locationGranted", locationGranted);
            result.put("locationServicesEnabled", locationServicesEnabled);
            result.put("googlePlayServicesOk", googlePlayServicesOk);
            result.put("googlePlayServicesStatus", gmsStatus);
            result.put("deviceManufacturer", manufacturer);
            result.put("deviceModel", model);
            result.put("stripeListWarning", stripeListWarning);
            result.put("ready", ready);
            result.put("versionName", pkg.versionName != null ? pkg.versionName : "");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                result.put("versionCode", pkg.getLongVersionCode());
            } else {
                result.put("versionCode", pkg.versionCode);
            }

            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "checkEnvironment failed");
        }
    }

    /** Opens Velbok's Android app-permission screen so the user can allow Location / Nearby devices. */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "openAppSettings failed");
        }
    }
}
