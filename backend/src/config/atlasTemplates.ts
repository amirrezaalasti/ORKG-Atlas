/** Built-in Atlas templates with precomputed Firestore statistics. */
export const ATLAS_BUILTIN_TEMPLATES: Record<
  string,
  {
    label: string;
    statisticId: string;
    /** Contribution class for papers in this template (orkgc:…). */
    targetClassId: string;
  }
> = {
  R186491: {
    label: 'Empirical Research Practice',
    statisticId: 'empire-statistics',
    targetClassId: 'C27001',
  },
  R1544125: {
    label: 'NLP4RE ID Card',
    statisticId: 'nlp4re-statistics',
    targetClassId: 'C121001',
  },
};

export const listBuiltinAtlasTemplates = () =>
  Object.entries(ATLAS_BUILTIN_TEMPLATES).map(([id, meta]) => ({
    id,
    label: meta.label,
    targetClassId: meta.targetClassId,
    hasPrecomputedStats: true,
  }));

export const resolveAtlasTemplateId = (hint: string): string | undefined => {
  const normalized = hint.trim();
  if (ATLAS_BUILTIN_TEMPLATES[normalized]) return normalized;
  const lower = normalized.toLowerCase();
  for (const [id, meta] of Object.entries(ATLAS_BUILTIN_TEMPLATES)) {
    if (
      meta.label.toLowerCase() === lower ||
      meta.label.toLowerCase().includes(lower) ||
      lower.includes(meta.label.toLowerCase()) ||
      (lower.includes('empire') && id === 'R186491') ||
      (lower.includes('nlp4re') && id === 'R1544125')
    ) {
      return id;
    }
  }
  return undefined;
};
