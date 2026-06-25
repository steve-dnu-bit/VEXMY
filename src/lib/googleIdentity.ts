/**
 * Web OAuth client ID — same as Supabase Google provider (public).
 * Fallback matches .env.example so mobile builds without a local .env still get Velbok-branded sign-in.
 */
export const GOOGLE_WEB_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ||
  "843973604535-hh4010q2pagr6m72esbh9mlddattg65i.apps.googleusercontent.com";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            context?: string;
            ux_mode?: "popup" | "redirect";
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: string;
              theme?: string;
              size?: string;
              width?: number;
              text?: string;
              shape?: string;
            },
          ) => void;
        };
      };
    };
  }
}

export function isGoogleIdentitySignInAvailable(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID && typeof window !== "undefined";
}

let scriptPromise: Promise<void> | null = null;
let initPromise: Promise<void> | null = null;
let credentialHandler: ((credential: string) => void | Promise<void>) | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Sign-In unavailable"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Sign-In")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Sign-In"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

async function ensureGoogleIdentityInitialized(): Promise<void> {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error("Google client ID not configured");
  if (!initPromise) {
    initPromise = loadGoogleIdentityScript().then(() => {
      window.google!.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        callback: (response) => {
          void credentialHandler?.(response.credential);
        },
        auto_select: false,
        context: "signin",
        ux_mode: "popup",
      });
    });
  }
  return initPromise;
}

/** Invisible Google button over our styled button — keeps Velbok branding in the picker. */
export async function mountGoogleSignInOverlay(
  container: HTMLElement,
  onCredential: (credential: string) => void | Promise<void>,
): Promise<() => void> {
  await ensureGoogleIdentityInitialized();
  credentialHandler = onCredential;
  container.innerHTML = "";

  const width = Math.max(container.offsetWidth || container.parentElement?.offsetWidth || 320, 200);
  window.google!.accounts.id.renderButton(container, {
    type: "standard",
    theme: "outline",
    size: "large",
    width,
    text: "continue_with",
    shape: "rectangular",
  });

  return () => {
    credentialHandler = null;
    container.innerHTML = "";
  };
}
