package in.musely.app;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenSecurityPlugin.class);
        super.onCreate(savedInstanceState);
        // Apply FLAG_SECURE to block screenshots and recording on secure application screens
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    }

    @CapacitorPlugin(name = "ScreenSecurity")
    public static class ScreenSecurityPlugin extends Plugin {
        @PluginMethod
        public void enableProtection(PluginCall call) {
            getActivity().runOnUiThread(() -> {
                getActivity().getWindow().setFlags(
                    WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE
                );
                call.resolve();
            });
        }

        @PluginMethod
        public void disableProtection(PluginCall call) {
            getActivity().runOnUiThread(() -> {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                call.resolve();
            });
        }

        @PluginMethod
        public void isSupported(PluginCall call) {
            com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
            ret.put("supported", true);
            ret.put("platform", "android");
            call.resolve(ret);
        }
    }
}
