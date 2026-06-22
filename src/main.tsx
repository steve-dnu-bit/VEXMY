import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapLanguageFromIp } from "@/i18n/bootstrapLanguage";
import { preloadStoredLanguage } from "@/i18n/loadLocale";

async function start() {
  if (Capacitor.isNativePlatform()) {
    const { bootstrapNativeTerminalListener } = await import("@/lib/terminal/bootstrapNativeTerminal");
    void bootstrapNativeTerminalListener();
  }

  createRoot(document.getElementById("root")!).render(<App />);

  if (Capacitor.isNativePlatform()) {
    void SplashScreen.hide();
  }

  void bootstrapLanguageFromIp().catch(() => undefined);
  void preloadStoredLanguage().catch(() => undefined);
}

void start();
