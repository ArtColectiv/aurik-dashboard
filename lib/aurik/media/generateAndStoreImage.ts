import OpenAI from "openai";
import { supabaseServer } from "@/lib/aurik/supabaseServer";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ProductRow = {
  id: string;
  product_name: string;
  product_description: string;
  product_image_url: string;
  product_url: string;
};

export async function generateAndStoreImage(params: {
  agentId: string;
  caption: string;
}) {
  const supabase = supabaseServer();

  // 🔹 0. Products
const { data: products } = await supabase
  .from("agent_product_sources")
  .select("*")
  .eq("agent_id", params.agentId)
  .eq("is_active", true);
  
// 🔹 1. Performance data
const { data: performanceData } = await supabase
  .from("agent_posting_performance")
  .select(
    "product_source_id, content_angle, visual_style, combo_key, engagement_score, created_at"
  )
  .eq("agent_id", params.agentId)
  .order("created_at", { ascending: false })
  .limit(20);

// 🔹 2. Creative winners
const { data: creativeWinners } = await supabase
  .from("agent_creative_winners")
  .select("combo_key, hook, cta, performance_score")
  .eq("agent_id", params.agentId)
  .order("performance_score", { ascending: false })
  .limit(5);

  // 🔹 3. ANGLES
  const angles = [
    "product_spotlight",
    "problem_solution",
    "lifestyle_travel",
    "security",
    "travel_tip",
  ];

  // 🔹 4. STYLES VISUELS
  const visualStyles = [
    "cinematic travel photography",
    "luxury lifestyle instagram",
    "minimal product focus",
    "dynamic action shot",
    "close-up premium detail",
    "ugc style iphone photo",
    "dramatic lighting",
  ];

  // 🔹 5. Fonction sélection intelligente
  function pickBestCombo(products: ProductRow[], performance: any[]) {
    if (!products?.length) return null;

    const combos: any[] = [];

    for (const product of products) {
      for (const angle of angles) {
        const matches = performance?.filter(
          (p) =>
            p.product_source_id === product.id &&
            p.content_angle === angle
        );

        const avg =
  matches?.length > 0
    ? matches.reduce((s, m) => s + m.engagement_score, 0) /
      matches.length
    : 0.5;

const winnerBoost =
  matches?.some((m) => m.is_winner === true) ? 1.5 : 1;

const finalScore = avg * winnerBoost;

        combos.push({
          product,
          angle,
          score: finalScore,
        });
      }
    }

    const total = combos.reduce((s, c) => s + c.score, 0);
    let rand = Math.random() * total;

    for (const c of combos) {
      rand -= c.score;
      if (rand <= 0) return c;
    }

    return combos[0];
  }

  // 🔹 6. Exploration vs exploitation
  let combo;

  if (Math.random() < 0.2) {
    const randomProduct =
      products?.[Math.floor(Math.random() * products.length)];

    const randomAngle =
      angles[Math.floor(Math.random() * angles.length)];

    combo = {
      product: randomProduct,
      angle: randomAngle,
    };
  } else {
    combo = pickBestCombo(products ?? [], performanceData ?? []);
  }

  const selectedProduct = combo?.product ?? null;
const selectedAngle = combo?.angle ?? "product_spotlight";

let selectedVisualStyle =
  visualStyles[Math.floor(Math.random() * visualStyles.length)];

const recentComboKeys = (performanceData ?? [])
  .slice(0, 5)
  .map((item) => item.combo_key)
  .filter(Boolean);

let comboKey = [
  selectedProduct?.id ?? "no_product",
  selectedAngle,
  selectedVisualStyle,
].join("::");

let attempts = 0;

while (recentComboKeys.includes(comboKey) && attempts < 10) {
  selectedVisualStyle =
    visualStyles[Math.floor(Math.random() * visualStyles.length)];

  comboKey = [
    selectedProduct?.id ?? "no_product",
    selectedAngle,
    selectedVisualStyle,
  ].join("::");

  attempts += 1;
}

  // 🔹 7. PROMPT
  const prompt = `
Create a high-converting Instagram image.

Caption:
${params.caption}

Product:
${selectedProduct?.product_name}
${selectedProduct?.product_description}

Product image reference:
${selectedProduct?.product_image_url}

Creative direction:
- Content angle: ${selectedAngle}
- Visual style: ${selectedVisualStyle}

Make it realistic, premium, and engaging.
`.trim();

  const image = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size: "1024x1024",
  });

  const base64 = image.data?.[0]?.b64_json;

  if (!base64) throw new Error("Image generation failed");

  const buffer = Buffer.from(base64, "base64");
  const path = `agents/${params.agentId}/${Date.now()}.png`;

  await supabase.storage.from("marketing-assets").upload(path, buffer, {
    contentType: "image/png",
  });

  const { data } = supabase.storage
    .from("marketing-assets")
    .getPublicUrl(path);

  return {
    imageUrl: data.publicUrl,
    visualStyle: selectedVisualStyle,
    productSourceId: selectedProduct?.id ?? null,
    angle: selectedAngle,
  };
}