// lib/aurik/actions/instagramClient.ts

const DRY_RUN = process.env.INSTAGRAM_DRY_RUN === "true";
const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN ?? "";
const ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID ?? "";

const GRAPH_API = "https://graph.facebook.com/v19.0";

export type InstagramPostResult = {
  ok: boolean;
  dryRun: boolean;
  mediaId?: string;
  postId?: string;
  error?: string;
};

export type InstagramReelPayload = {
  videoUrl: string;
  caption: string;
  agentName: string;
  experimentKey?: string;
};

export type InstagramImagePayload = {
  imageUrl: string;
  caption: string;
  agentName: string;
  experimentKey?: string;
};

// ─── DRY RUN HELPERS ─────────────────────────────────────────

function dryRunResult(label: string, payload: object): InstagramPostResult {
  console.log(`[INSTAGRAM DRY_RUN] ${label}`, JSON.stringify(payload, null, 2));
  return {
    ok: true,
    dryRun: true,
    mediaId: "dry_run_media_id",
    postId: "dry_run_post_id",
  };
}

// ─── REAL API HELPERS ─────────────────────────────────────────

async function createMediaContainer(params: {
  type: "REELS" | "IMAGE";
  url: string;
  caption: string;
}): Promise<string> {
  const body: Record<string, string> = {
    caption: params.caption,
    access_token: ACCESS_TOKEN,
  };

  if (params.type === "REELS") {
    body.media_type = "REELS";
    body.video_url = params.url;
    body.share_to_feed = "true";
  } else {
    body.image_url = params.url;
  }

  const res = await fetch(`${GRAPH_API}/${ACCOUNT_ID}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json() as { id?: string; error?: { message: string } };

  if (!res.ok || !data.id) {
    throw new Error(
      `Failed to create media container: ${data.error?.message ?? "Unknown error"}`
    );
  }

  return data.id;
}

async function waitForMediaReady(
  mediaId: string,
  maxAttempts = 10,
  intervalMs = 3000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${GRAPH_API}/${mediaId}?fields=status_code&access_token=${ACCESS_TOKEN}`
    );

    const data = await res.json() as { status_code?: string };

    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error("Media processing failed on Instagram side");
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error("Media processing timeout");
}

async function publishMediaContainer(mediaId: string): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${ACCOUNT_ID}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: mediaId,
      access_token: ACCESS_TOKEN,
    }),
  });

  const data = await res.json() as { id?: string; error?: { message: string } };

  if (!res.ok || !data.id) {
    throw new Error(
      `Failed to publish media: ${data.error?.message ?? "Unknown error"}`
    );
  }

  return data.id;
}

// ─── PUBLIC API ───────────────────────────────────────────────

export async function postReelToInstagram(
  payload: InstagramReelPayload
): Promise<InstagramPostResult> {
  if (DRY_RUN) {
    return dryRunResult("postReelToInstagram", payload);
  }

  try {
    const mediaId = await createMediaContainer({
      type: "REELS",
      url: payload.videoUrl,
      caption: payload.caption,
    });

    await waitForMediaReady(mediaId);

    const postId = await publishMediaContainer(mediaId);

    return { ok: true, dryRun: false, mediaId, postId };
  } catch (error) {
    return {
      ok: false,
      dryRun: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function postImageToInstagram(
  payload: InstagramImagePayload
): Promise<InstagramPostResult> {
  if (DRY_RUN) {
    return dryRunResult("postImageToInstagram", payload);
  }

  try {
    const mediaId = await createMediaContainer({
      type: "IMAGE",
      url: payload.imageUrl,
      caption: payload.caption,
    });

    const postId = await publishMediaContainer(mediaId);

    return { ok: true, dryRun: false, mediaId, postId };
  } catch (error) {
    return {
      ok: false,
      dryRun: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}