import { useEffect } from "react";
import { registerNativeOAuthListener } from "@/lib/oauth";

/** Registers Capacitor deep-link handling for native OAuth (Google / Apple). */
const NativeOAuthBootstrap = () => {
  useEffect(() => {
    registerNativeOAuthListener();
  }, []);
  return null;
};

export default NativeOAuthBootstrap;
