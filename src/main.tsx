import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapLanguageFromIp } from "@/i18n/bootstrapLanguage";

async function start() {
  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add("native-app");
    document.documentElement.classList.add(`native-${Capacitor.getPlatform()}`);
  }

  try {
    const { preloadStoredLanguage } = await import("@/i18n/loadLocale");

    if (Capacitor.isNativePlatform()) {
      try {
        const { bootstrapNativeTerminalListener } = await import("@/lib/terminal/bootstrapNativeTerminal");
        void bootstrapNativeTerminalListener();
      } catch (error) {
        console.warn("[velbok] Stripe Terminal bootstrap skipped:", error);
      }
    }

    await preloadStoredLanguage().catch(() => undefined);

    const root = document.getElementById("root");
    if (!root) {
      throw new Error("Missing #root element");
    }

    createRoot(root).render(<App />);
    void bootstrapLanguageFromIp().catch(() => undefined);
  } catch (error) {
    console.error("[velbok] App failed to start:", error);
    const root = document.getElementById("root");
    if (root) {
      root.innerHTML = `
        <div style="padding:24px;font-family:system-ui,sans-serif;color:#f5f5f5;background:#0c0c0f;min-height:100vh">
          <h1 style="font-size:1.25rem;margin:0 0 12px">Velbok could not start</h1>
          <p style="margin:0 0 8px;opacity:0.85">If you just cloned the repo, run <code>npm run ios:prepare</code> from the project root, then rebuild in Xcode.</p>
          <p style="margin:0;opacity:0.65;font-size:0.875rem">${error instanceof Error ? error.message : "Unknown error"}</p>
        </div>`;
    }
  } finally {
    if (Capacitor.isNativePlatform()) {
      void SplashScreen.hide();
    }
  }
}

void start();
