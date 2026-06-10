import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n";
import { bootstrapLanguageFromIp } from "@/i18n/bootstrapLanguage";

async function start() {
  await bootstrapLanguageFromIp();
  createRoot(document.getElementById("root")!).render(<App />);
}

void start();
