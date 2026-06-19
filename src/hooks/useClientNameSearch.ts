import { useCallback, useEffect, useRef, useState } from "react";
import { searchOrganizationClients, type ClientPick } from "@/lib/clientSearch";

export function useClientNameSearch(clientName: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<ClientPick[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    try {
      setSuggestions(await searchOrganizationClients(q));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = clientName.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(q);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [clientName, enabled, fetchSuggestions]);

  return { suggestions, open, setOpen, loading, setSuggestions };
}
