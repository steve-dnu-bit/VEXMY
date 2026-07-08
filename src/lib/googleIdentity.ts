import { isNativeAppShell } from "@/lib/platform";

/**
 * Web OAuth client ID — same as Supabase Google provider (public).
 * Fallback matches .env.example so production builds always have a client ID.
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
            nonce?: string;
            use_fedcm_for_prompt?: boolean;
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
          cancel?: () => void;
        };
      };
    };
  }
}

export function isGoogleIdentitySignInAvailable(): boolean {
  return !!GOOGLE_WEB_CLIENT_ID && typeof window !== "undefined";
}

/** Raw nonce for Supabase + SHA-256 hex nonce for Google GIS (see Supabase Google auth docs). */
export async function generateGoogleNonce(): Promise<[rawNonce: string, hashedNonce: string]> {
  const rawNonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const encoded = new TextEncoder().encode(rawNonce);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [rawNonce, hashedNonce];
}

let scriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Sign-In unavailable"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google?.accounts?.id) {
        resolve();
        return;
      }
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

function waitForGoogleButton(host: HTMLElement, attempts = 30): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const tick = (left: number) => {
      const btn = host.querySelector('[role="button"]') as HTMLElement | null;
      if (btn) {
        resolve(btn);
        return;
      }
      if (left <= 0) {
        reject(
          new Error(
            isNativeAppShell()
              ? "Google Sign-In could not start. In Google Cloud Console, add https://localhost to Authorized JavaScript origins for your Web client."
              : "Google Sign-In could not start. In Google Cloud Console, add https://velbok.com to Authorized JavaScript origins for your Web client.",
          ),
        );
        return;
      }
      window.setTimeout(() => tick(left - 1), 50);
    };
    tick(attempts);
  });
}

/**
 * Opens Google account picker in a popup (Velbok branding, no supabase.co redirect).
 * Call from a user click handler.
 */
export async function triggerGoogleSignIn(
  onCredential: (credential: string, rawNonce: string) => void | Promise<void>,
): Promise<void> {
  await loadGoogleIdentityScript();
  const [rawNonce, hashedNonce] = await generateGoogleNonce();

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    try {
      window.google!.accounts.id.cancel?.();
    } catch {
      /* optional API */
    }

    window.google!.accounts.id.initialize({
      client_id: GOOGLE_WEB_CLIENT_ID,
      callback: (response) => {
        void (async () => {
          try {
            await onCredential(response.credential, rawNonce);
            finish(() => resolve());
          } catch (e) {
            finish(() => reject(e instanceof Error ? e : new Error(String(e))));
          }
        })();
      },
      nonce: hashedNonce,
      ux_mode: "popup",
      auto_select: false,
      context: "signin",
      use_fedcm_for_prompt: false,
    });

    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:320px;height:48px;overflow:hidden";
    document.body.appendChild(host);

    window.google!.accounts.id.renderButton(host, {
      type: "standard",
      theme: "outline",
      size: "large",
      width: 320,
      text: "continue_with",
      shape: "rectangular",
    });

    void waitForGoogleButton(host)
      .then((btn) => {
        btn.click();
        window.setTimeout(() => host.remove(), 5000);
      })
      .catch((e) => {
        host.remove();
        finish(() => reject(e instanceof Error ? e : new Error(String(e))));
      });

    window.setTimeout(() => {
      host.remove();
      finish(() => reject(new Error("Google Sign-In cancelled")));
    }, 120_000);
  });
}

/** @deprecated Use triggerGoogleSignIn from a click handler instead. */
export async function mountGoogleSignInOverlay(
  container: HTMLElement,
  onCredential: (credential: string) => void | Promise<void>,
): Promise<() => void> {
  const handler = async () => {
    await triggerGoogleSignIn(async (credential, rawNonce) => {
      await onCredential(credential);
      void rawNonce;
    });
  };
  container.onclick = () => void handler();
  return () => {
    container.onclick = null;
  };
}
