package com.velbok.app;

import android.content.Context;
import android.util.AttributeSet;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import androidx.appcompat.view.ContextThemeWrapper;
import com.getcapacitor.CapacitorWebView;

/**
 * Capacitor WebView that avoids the blank white floating paste pill (app icon only).
 * Forces copy/cut/paste into a dark top ActionMode bar instead.
 */
public class VelbokWebView extends CapacitorWebView {

    public VelbokWebView(Context context, AttributeSet attrs) {
        super(new ContextThemeWrapper(context, R.style.Velbok_WebViewTheme), attrs);
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback) {
        return startActionMode(callback, ActionMode.TYPE_PRIMARY);
    }

    @Override
    public ActionMode startActionMode(ActionMode.Callback callback, int type) {
        int modeType = type == ActionMode.TYPE_FLOATING ? ActionMode.TYPE_PRIMARY : type;
        return super.startActionMode(wrapCallback(callback), modeType);
    }

    private ActionMode.Callback wrapCallback(ActionMode.Callback callback) {
        return new ActionMode.Callback() {
            @Override
            public boolean onCreateActionMode(ActionMode mode, Menu menu) {
                boolean created = callback.onCreateActionMode(mode, menu);
                for (int i = 0; i < menu.size(); i++) {
                    MenuItem item = menu.getItem(i);
                    item.setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
                }
                return created;
            }

            @Override
            public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
                return callback.onPrepareActionMode(mode, menu);
            }

            @Override
            public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
                return callback.onActionItemClicked(mode, item);
            }

            @Override
            public void onDestroyActionMode(ActionMode mode) {
                callback.onDestroyActionMode(mode);
            }
        };
    }
}
