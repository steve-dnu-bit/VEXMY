import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapLanguageFromIp } from "@/i18n/bootstrapLanguage";

async function start() {
  const { preloadStoredLanguage } = await import("@/i18n/loadLocale");

  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add("native-app");
    document.documentElement.classList.add(`native-${Capacitor.getPlatform()}`);
    if (Capacitor.getPlatform() === "android") {
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute("content", "width=device-width, initial-scale=1.0, viewport-fit=cover");
      }
    }
    const { bootstrapNativeTerminalListener } = await import("@/lib/terminal/bootstrapNativeTerminal");
    void bootstrapNativeTerminalListener();
  }

  await preloadStoredLanguage().catch(() => undefined);

  createRoot(document.getElementById("root")!).render(<App />);

  if (Capacitor.isNativePlatform()) {
    void SplashScreen.hide();
  }

  void bootstrapLanguageFromIp().catch(() => undefined);
}

void start();
