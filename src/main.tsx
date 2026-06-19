import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapLanguageFromIp } from "@/i18n/bootstrapLanguage";

async function start() {
  if (Capacitor.isNativePlatform()) {
    const { bootstrapNativeTerminalListener } = await import("@/lib/terminal/bootstrapNativeTerminal");
    await bootstrapNativeTerminalListener();
  }
  try {
    await Promise.race([
      bootstrapLanguageFromIp(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* never block app launch on language bootstrap */
  }
  createRoot(document.getElementById("root")!).render(<App />);
  if (Capacitor.isNativePlatform()) {
    void SplashScreen.hide();
  }
}

void start();
