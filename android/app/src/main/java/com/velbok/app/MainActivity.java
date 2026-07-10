package com.velbok.app;

import android.content.Intent;
import android.Manifest;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.ActionMode;
import android.view.View;
import androidx.appcompat.app.AlertDialog;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int TERMINAL_PERMISSIONS_REQUEST = 1001;
    private static final String PREFS_NAME = "velbok_prefs";
    private static final String KEY_PERMISSION_DISCLOSURE_ACCEPTED = "terminal_permission_disclosure_accepted";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(TapToPayReadinessPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Capacitor loads com.getcapacitor.android.R.layout.capacitor_bridge_layout_main.
     * Swap that for our layout so VelbokWebView is used (fixes white paste pill).
     */
    @Override
    public void setContentView(int layoutResID) {
        if (layoutResID == com.getcapacitor.android.R.layout.capacitor_bridge_layout_main) {
            super.setContentView(R.layout.capacitor_bridge_layout_main);
            // Bridge looks up com.getcapacitor.android.R.id.webview — align IDs if AGP split them.
            View appWebView = findViewById(R.id.webview);
            if (appWebView != null
                && findViewById(com.getcapacitor.android.R.id.webview) == null) {
                appWebView.setId(com.getcapacitor.android.R.id.webview);
            }
            return;
        }
        super.setContentView(layoutResID);
    }

    /** Extra safety: if floating ActionMode still starts via the window, force top bar. */
    @Override
    public ActionMode onWindowStartingActionMode(ActionMode.Callback callback, int type) {
        if (type == ActionMode.TYPE_FLOATING) {
            return super.onWindowStartingActionMode(callback, ActionMode.TYPE_PRIMARY);
        }
        return super.onWindowStartingActionMode(callback, type);
    }

    @Override
    public void onStart() {
        super.onStart();
        configureWebView();
        // Re-prompt after splash / Dual App installs that never got the first dialog.
        maybeRequestTerminalPermissions();
    }

    /** Required so OAuth deep links reach Capacitor when activity uses singleTask. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    /** WebView chrome: GIS popups and dark canvas for selection handles. */
    private void configureWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        webView.post(() -> {
            webView.setBackgroundColor(ContextCompat.getColor(this, R.color.appBackground));
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setSupportMultipleWindows(true);
        });
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
    }

    private void maybeRequestTerminalPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }
        if (!needsTerminalPermissionRequest()) {
            return;
        }
        if (prefs().getBoolean(KEY_PERMISSION_DISCLOSURE_ACCEPTED, false)) {
            requestTerminalPermissions();
            return;
        }
        showTerminalPermissionDisclosure();
    }

    private boolean needsTerminalPermissionRequest() {
        String[] permissions = terminalPermissions();
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                return true;
            }
        }
        return false;
    }

    private String[] terminalPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return new String[] {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
            };
        }
        return new String[] {
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.BLUETOOTH,
            Manifest.permission.BLUETOOTH_ADMIN,
        };
    }

    private void showTerminalPermissionDisclosure() {
        new AlertDialog.Builder(this, R.style.Velbok_TerminalPermissionDialog)
            .setTitle(R.string.terminal_permissions_title)
            .setMessage(R.string.terminal_permissions_message)
            .setPositiveButton(R.string.terminal_permissions_continue, (dialog, which) -> {
                prefs().edit().putBoolean(KEY_PERMISSION_DISCLOSURE_ACCEPTED, true).apply();
                requestTerminalPermissions();
            })
            .setNegativeButton(R.string.terminal_permissions_not_now, null)
            .setCancelable(true)
            .show();
    }

    private void requestTerminalPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        String[] permissions = terminalPermissions();
        boolean needsRequest = false;
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                needsRequest = true;
                break;
            }
        }

        if (needsRequest) {
            ActivityCompat.requestPermissions(this, permissions, TERMINAL_PERMISSIONS_REQUEST);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != TERMINAL_PERMISSIONS_REQUEST || grantResults.length == 0) {
            return;
        }
        for (int i = 0; i < permissions.length; i++) {
            if (Manifest.permission.ACCESS_FINE_LOCATION.equals(permissions[i])
                && grantResults[i] != PackageManager.PERMISSION_GRANTED) {
                return;
            }
        }
    }
}
