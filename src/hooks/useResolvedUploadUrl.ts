import { useEffect, useState } from "react";
import { resolveUploadUrl } from "@/lib/uploadStorage";

/** Resolve legacy public URLs or uploads: storage refs to a fetchable URL. */
export function useResolvedUploadUrl(stored: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!stored?.trim()) {
      setUrl(null);
      return;
    }
    const value = stored.trim();
    if (value.startsWith("http://") || value.startsWith("https://")) {
      setUrl(value);
      return;
    }
    void resolveUploadUrl(value).then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [stored]);

  return url;
}
