/**
 * Load an ORKG template and its linked subtemplates (same flow as the Atlas UI).
 */

import { orkgRest, type OrkgTemplate } from './orkgClient.js';
import type { Template } from '../_shared/templateTypes.js';

const SHACL_TARGET_CLASS = 'sh:targetClass';
const NODE_SHAPE_CLASS = 'NodeShape';

const isTemplateNode = (id: string) => id.startsWith('R');

const asTemplate = (tpl: OrkgTemplate): Template => ({
  id: tpl.id,
  label: tpl.label ?? tpl.id,
  description: tpl.description ?? null,
  target_class: {
    id:
      typeof tpl.target_class === 'object' && tpl.target_class?.id
        ? tpl.target_class.id
        : String(tpl.target_class ?? ''),
    label:
      typeof tpl.target_class === 'object' && tpl.target_class?.id
        ? tpl.target_class.id
        : String(tpl.target_class ?? ''),
  },
  properties: (tpl.properties ?? []).map((p) => ({
    id: p.id ?? p.path?.id ?? '',
    label: p.label ?? p.path?.label ?? '',
    description: p.description ?? null,
    order: undefined,
    min_count: p.min_count ?? null,
    max_count: p.max_count ?? null,
    path: {
      id: p.path?.id ?? '',
      label: p.path?.label ?? '',
    },
    class: p.class?.id
      ? { id: p.class.id, label: p.class.label ?? p.class.id }
      : undefined,
  })),
});

const getTemplatesByClass = async (classId: string): Promise<string[]> => {
  const res = await orkgRest.getStatements({
    object_id: classId,
    predicate_id: SHACL_TARGET_CLASS,
    size: 200,
  });
  const statements = res.content ?? [];
  return statements
    .filter((s) => s.subject.classes?.includes(NODE_SHAPE_CLASS))
    .map((s) => s.subject.id)
    .filter((id): id is string => !!id && isTemplateNode(id));
};

type TemplateFlowNode = Template & { neighbors?: TemplateFlowNode[] };

const loadTemplateFlowById = async (
  id: string,
  loaded: Set<string>
): Promise<TemplateFlowNode | Record<string, never>> => {
  if (loaded.has(id)) return {};
  loaded.add(id);

  const raw = await orkgRest.getTemplate(id);
  const t = asTemplate(raw);

  const neighborPromises = (t.properties ?? [])
    .filter((ps) => ps.class?.id)
    .map(async (ps) => {
      try {
        const templateIds = await getTemplatesByClass(ps.class!.id);
        const resourceIds = templateIds.filter(isTemplateNode);
        if (resourceIds.length === 0) return {};
        return loadTemplateFlowById(resourceIds[0], loaded);
      } catch {
        return {};
      }
    });

  const neighbors = (await Promise.all(neighborPromises)).filter(
    (n): n is TemplateFlowNode =>
      typeof n === 'object' &&
      n !== null &&
      'id' in n &&
      typeof (n as TemplateFlowNode).id === 'string' &&
      isTemplateNode((n as TemplateFlowNode).id)
  );

  return { ...t, neighbors };
};

/** Collect the root template and all nested subtemplates from a template flow. */
export const collectTemplatesFromFlow = (
  node: TemplateFlowNode | Record<string, never>
): Template[] => {
  const out: Template[] = [];
  const seen = new Set<string>();

  const walk = (n: TemplateFlowNode | Record<string, never>) => {
    if (!('id' in n) || !n.id || seen.has(n.id)) return;
    seen.add(n.id);
    const { neighbors, ...template } = n as TemplateFlowNode;
    out.push(template);
    if (neighbors?.length) {
      for (const child of neighbors) walk(child);
    }
  };

  walk(node);
  return out;
};

export const loadTemplateFlow = async (
  templateId: string
): Promise<{ templates: Template[]; targetClassId?: string }> => {
  const flow = await loadTemplateFlowById(templateId, new Set());
  const templates = collectTemplatesFromFlow(flow);
  const root = templates.find((t) => t.id === templateId) ?? templates[0];
  const targetClassId = root?.target_class?.id;
  return { templates, targetClassId };
};
