// Renders a live-chat attachment. Files live in a private bucket, so the
// reference stored on the message is resolved to a short-lived signed URL.
import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import { resolveAttachmentUrl } from "@/lib/live-chat/visitor";

export function ChatAttachment({
  value,
  type,
  maxSize = 220,
}: {
  value: string | null;
  type?: string | null;
  maxSize?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    void resolveAttachmentUrl(value).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [value]);

  if (!value) return null;
  const isImage = type?.startsWith("image/");

  if (!url) {
    return (
      <div className="text-[11px] text-muted-foreground flex items-center gap-1 mb-1">
        <Paperclip className="size-3" /> Dosya yükleniyor…
      </div>
    );
  }

  return isImage ? (
    <a href={url} target="_blank" rel="noopener">
      <img src={url} alt="Sohbet eki" className="rounded mb-1" style={{ maxWidth: maxSize, maxHeight: maxSize }} />
    </a>
  ) : (
    <a href={url} target="_blank" rel="noopener" className="underline text-xs flex items-center gap-1 mb-1">
      <Paperclip className="size-3" /> Dosya
    </a>
  );
}
