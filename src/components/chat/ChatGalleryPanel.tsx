import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MediaRow } from "./UnifiedChatWorkspace";

export interface ChatGalleryPanelProps {
  gallery: MediaRow[];
  signedUrls: Record<string, string>;
  pinsByMedia: Record<string, boolean>;
  togglePin: (mediaId: string) => void;
}

const ChatGalleryPanel = ({
  gallery,
  signedUrls,
  pinsByMedia,
  togglePin,
}: ChatGalleryPanelProps) => {
  const { t } = useTranslation();
  return (
  <div className="border rounded-lg bg-card overflow-y-auto relative z-10">
    <div className="p-3 border-b">
      <p className="text-sm font-semibold">{t("chat.gallery")}</p>
    </div>
    <div className="p-3 grid grid-cols-2 gap-2">
      {gallery.map((g) => (
        <div key={g.id} className="border rounded overflow-hidden">
          <a href={signedUrls[g.id] || "#"} target="_blank" rel="noreferrer" className="block">
            {signedUrls[g.id] ? (
              <img src={signedUrls[g.id]} alt={g.caption || t("chat.chatMediaAlt")} loading="lazy" className="w-full h-24 object-cover" />
            ) : (
              <div className="h-24 bg-secondary" />
            )}
          </a>
          <button
            className={`w-full text-[10px] px-2 py-1 border-t flex items-center justify-center gap-1 ${pinsByMedia[g.id] ? "text-amber-400" : "text-muted-foreground"}`}
            onClick={() => togglePin(g.id)}
          >
            <Pin className="h-3 w-3" /> {pinsByMedia[g.id] ? t("chat.pinned") : t("chat.pin")}
          </button>
        </div>
      ))}
    </div>
  </div>
  );
};

export default ChatGalleryPanel;
