import { useEffect, useState } from "react";
import { loadOrgServices, type OrgService } from "@/lib/shopServices";

export type Service = OrgService;

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-500/20 border-blue-500/40 text-blue-300",
  amber: "bg-amber-500/20 border-amber-500/40 text-amber-300",
  gold: "bg-yellow-600/20 border-yellow-600/40 text-yellow-300",
  red: "bg-red-500/20 border-red-500/40 text-red-300",
  violet: "bg-violet-500/20 border-violet-500/40 text-violet-300",
  emerald: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
  pink: "bg-pink-500/20 border-pink-500/40 text-pink-300",
  orange: "bg-orange-500/20 border-orange-500/40 text-orange-300",
  cyan: "bg-cyan-500/20 border-cyan-500/40 text-cyan-300",
};

const DOT_MAP: Record<string, string> = {
  blue: "bg-blue-500", amber: "bg-amber-500", gold: "bg-yellow-600",
  red: "bg-red-500", violet: "bg-violet-500", emerald: "bg-emerald-500",
  pink: "bg-pink-500", orange: "bg-orange-500", cyan: "bg-cyan-500",
};

export const getServiceColorClass = (color: string) => COLOR_MAP[color] || COLOR_MAP.blue;
export const getServiceDotClass = (color: string) => DOT_MAP[color] || DOT_MAP.blue;

export const useServices = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    const data = await loadOrgServices({ activeOnly: true });
    setServices(data);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  return { services, loading, refetch: fetch };
};
