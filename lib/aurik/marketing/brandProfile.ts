// lib/aurik/marketing/brandProfile.ts

export interface BrandProfile {
  brandName?: string;
  description?: string;
  toneOfVoice?: string;
  targetAudience?: string;
  // Palette de couleurs optionnelle (utilisée pour les briefs visuels)
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
  // Tout autre champ qu’on pourrait ajouter plus tard
  [key: string]: any;
}

export const defaultBrandProfile: BrandProfile = {
  brandName: '',
  description: '',
  toneOfVoice: '',
  targetAudience: '',
  colors: {},
};

export function normalizeBrandProfile(input?: BrandProfile | null): BrandProfile {
  if (!input) return { ...defaultBrandProfile };
  return {
    ...defaultBrandProfile,
    ...input,
    colors: {
      ...(defaultBrandProfile.colors ?? {}),
      ...(input.colors ?? {}),
    },
  };
}
