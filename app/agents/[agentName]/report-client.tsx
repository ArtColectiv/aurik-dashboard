"use client";

import { useEffect, useState } from "react";

type Props = {
  agentId: string;
};

type ReelRow = Record<string, unknown>;

function pickVideoUrl(r: ReelRow): string | null {
  const candidates = [
    r.video_url,
    r.videoUrl,
    r.url,
    r.public_url,
    r.publicUrl,
    r.output_url,
    r.outputUrl,
    r.file_url,
    r.fileUrl,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

export default function ReportClient({ agentId }: Props) {
  const [loading, setLoading] = useState(true);
  const [reels, setReels] = useState<ReelRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams({ agentId });
        const res = await fetch(`/api/marketing/generated-reels?${qs.toString()}`, {
          method: "GET",
          cache: "no-store",
        });

        const json = (await res.json()) as { ok?: boolean; error?: string; reels?: ReelRow[] };

        if (cancelled) return;

        if (!res.ok || !json.ok) {
          setError(json.error ?? `HTTP ${res.status}`);
          setReels([]);
          return;
        }

        setReels(Array.isArray(json.reels) ? json.reels : []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setReels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) return <div>Loading generated reels…</div>;
  if (error) return <div className="text-red-600">Generated reels error: {error}</div>;

  const items = reels
    .map((r) => ({ r, url: pickVideoUrl(r) }))
    .filter((x) => !!x.url) as Array<{ r: ReelRow; url: string }>;

  return (
    <div className="space-y-4">
      <div className="text-xl font-semibold">Generated Reels</div>

      {items.length === 0 ? (
        <div className="text-sm text-gray-500">Aucune vidéo générée trouvée.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {items.map(({ r, url }, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2">
              <video controls className="w-full rounded" src={url} />
              <div className="text-xs break-all text-gray-600">{url}</div>
              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500">debug row</summary>
                <pre className="bg-black/5 p-2 rounded overflow-auto">
                  {JSON.stringify(r, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}