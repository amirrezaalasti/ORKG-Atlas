/**
 * Discover ORKG templates from the ORKG API and merge Atlas metadata.
 */

import { db } from '../config/firebase.js';
import {
  ATLAS_BUILTIN_TEMPLATES,
  listBuiltinAtlasTemplates,
} from '../config/atlasTemplates.js';
import { orkgPublicLink, orkgRest } from './orkg/orkgClient.js';

export interface TemplateListItem {
  id: string;
  label: string;
  description?: string;
  targetClassId?: string;
  link: string;
  /** Listed in Atlas Firestore / has bundled questions or stats. */
  inAtlas: boolean;
  hasPrecomputedStats: boolean;
}

export const listOrkgTemplates = async (options?: {
  query?: string;
  page?: number;
  size?: number;
}): Promise<{ items: TemplateListItem[]; total?: number; page: number }> => {
  const page = options?.page ?? 0;
  const size = Math.min(options?.size ?? 50, 100);

  const [orkgRes, firestoreSnap] = await Promise.all([
    orkgRest.listTemplates({
      q: options?.query?.trim() || undefined,
      page,
      size,
    }),
    db.collection('Templates').get(),
  ]);

  const firestoreById = new Map<
    string,
    { title?: string; description?: string }
  >();
  firestoreSnap.docs.forEach((d) => {
    const data = d.data() as { title?: string; description?: string };
    firestoreById.set(d.id, data);
  });

  const builtins = listBuiltinAtlasTemplates();
  const builtinIds = new Set(builtins.map((b) => b.id));

  const items: TemplateListItem[] = (orkgRes.content ?? []).map((t) => {
    const targetClassId =
      typeof t.target_class === 'object' && t.target_class?.id
        ? t.target_class.id
        : typeof t.target_class === 'string'
          ? t.target_class
          : ATLAS_BUILTIN_TEMPLATES[t.id]?.targetClassId;

    const fs = firestoreById.get(t.id);
    const builtin = ATLAS_BUILTIN_TEMPLATES[t.id];

    return {
      id: t.id,
      label: t.label ?? fs?.title ?? builtin?.label ?? t.id,
      description: t.description ?? fs?.description,
      targetClassId: targetClassId ?? builtin?.targetClassId,
      link: orkgPublicLink('template', t.id),
      inAtlas: !!fs || !!builtin,
      hasPrecomputedStats: !!builtin,
    };
  });

  const seen = new Set(items.map((i) => i.id));

  for (const b of builtins) {
    if (seen.has(b.id)) continue;
    const fs = firestoreById.get(b.id);
    items.unshift({
      id: b.id,
      label: b.label,
      description: fs?.description,
      targetClassId: b.targetClassId,
      link: orkgPublicLink('template', b.id),
      inAtlas: true,
      hasPrecomputedStats: true,
    });
  }

  for (const [id, fs] of firestoreById) {
    if (seen.has(id)) continue;
    items.push({
      id,
      label: fs.title ?? id,
      description: fs.description,
      targetClassId: ATLAS_BUILTIN_TEMPLATES[id]?.targetClassId,
      link: orkgPublicLink('template', id),
      inAtlas: true,
      hasPrecomputedStats: !!ATLAS_BUILTIN_TEMPLATES[id],
    });
  }

  return {
    items,
    total: orkgRes.totalElements ?? items.length,
    page,
  };
};
