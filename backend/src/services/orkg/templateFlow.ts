import { EXTERNAL_HIERARCHY_LIMITS } from '../../config/mcp.js';
import {
  ExternalHttpError,
  type ExternalHttpOptions,
} from '../externalHttp.js';
import { checkExecution, linkExecutionAbort } from '../mcp/executionScope.js';
/**
 * Load an ORKG template and its linked subtemplates (same flow as the Atlas UI).
 */

import { orkgRest, type OrkgTemplate } from './orkgClient.js';
import type { Template } from '../../../../shared/templateTypes.js';

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

const getTemplatesByClass = async (
  classId: string,
  warnings?: string[],
  http?: ExternalHttpOptions
): Promise<string[]> => {
  const res = await orkgRest.getStatements(
    {
      object_id: classId,
      predicate_id: SHACL_TARGET_CLASS,
      size: EXTERNAL_HIERARCHY_LIMITS.lookupPageSize,
    },
    http
  );
  const statements = res.content ?? [];
  if (
    warnings &&
    (res.totalElements ?? statements.length) > statements.length
  ) {
    warnings.push(`Subtemplate lookup for ${classId} was truncated.`);
  }
  return statements
    .filter((s) => s.subject.classes?.includes(NODE_SHAPE_CLASS))
    .map((s) => s.subject.id)
    .filter((id): id is string => !!id && isTemplateNode(id));
};

type TemplateFlowNode = Template & { neighbors?: TemplateFlowNode[] };

const loadTemplateFlowById = async (
  id: string,
  loaded: Set<string>,
  warnings?: string[],
  http?: ExternalHttpOptions
): Promise<TemplateFlowNode | Record<string, never>> => {
  if (loaded.has(id)) return {};
  loaded.add(id);

  const raw = await orkgRest.getTemplate(id, http);
  const t = asTemplate(raw);
  if (warnings) {
    const target =
      typeof raw.target_class === 'string'
        ? raw.target_class
        : raw.target_class?.id;
    t.target_class.id = typeof target === 'string' ? target.trim() : '';
    if (!t.target_class.id)
      warnings.push(`Target class is missing for template ${id}.`);
    if (!t.properties?.length)
      warnings.push(`No properties were provided for template ${id}.`);
    if (t.properties?.some((p) => !p.path.id))
      warnings.push(`Some properties in template ${id} have no predicate ID.`);
  }

  const neighborPromises = (t.properties ?? [])
    .filter((ps) => ps.class?.id)
    .map(async (ps) => {
      try {
        const templateIds = await getTemplatesByClass(
          ps.class!.id,
          warnings,
          http
        );
        const resourceIds = templateIds.filter(isTemplateNode);
        if (resourceIds.length === 0) {
          warnings?.push(
            `No subtemplate was resolved for value class ${ps.class!.id}; its properties are unknown.`
          );
          return {};
        }
        if (resourceIds.length > 1)
          warnings?.push(
            `Multiple subtemplates exist for value class ${ps.class!.id}; only ${resourceIds[0]} was loaded.`
          );
        const child = loadTemplateFlowById(
          resourceIds[0],
          loaded,
          warnings,
          http
        );
        // Preserve internal rejection behavior; external callers receive partial-schema warnings.
        return warnings ? await child : child;
      } catch (err) {
        if (http?.externalMcp && err instanceof ExternalHttpError) throw err;
        warnings?.push(
          `Could not load the hierarchy for value class ${ps.class!.id}.`
        );
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

/**
 * Provisional external hierarchy budgets. Twenty templates and forty distinct
 * value-class lookups cover small research schemas without graph-wide crawling.
 * Requests are deliberately sequential (maximum concurrency: one).
 * The deadline spans all REST calls and their existing HTTP retries/body reads.
 */
export { EXTERNAL_HIERARCHY_LIMITS } from '../../config/mcp.js';

async function loadExternalTemplateFlow(templateId: string) {
  const templates: Template[] = [];
  const warnings = new Set<string>();
  const pending = [templateId];
  const scheduled = new Set(pending);
  const classes = new Set<string>();
  const controller = new AbortController();
  const unlink = linkExecutionAbort(controller);
  const deadline = Date.now() + EXTERNAL_HIERARCHY_LIMITS.timeoutMs;
  const timer = setTimeout(
    () => controller.abort(),
    EXTERNAL_HIERARCHY_LIMITS.timeoutMs
  );
  const http = { externalMcp: true, signal: controller.signal };
  const expired = () => {
    checkExecution();
    if (Date.now() >= deadline) controller.abort();
    if (controller.signal.aborted) {
      warnings.add(
        'Template hierarchy time budget reached; schema information is incomplete.'
      );
      return true;
    }
    return false;
  };
  try {
    for (const id of pending) {
      if (expired()) break;
      let raw: OrkgTemplate;
      try {
        raw = await orkgRest.getTemplate(id, http);
      } catch (err) {
        if (expired()) break;
        if (id === templateId || err instanceof ExternalHttpError) throw err;
        warnings.add(
          'A subtemplate could not be loaded; schema information is incomplete.'
        );
        continue;
      }
      const template = asTemplate(raw);
      const target =
        typeof raw.target_class === 'string'
          ? raw.target_class
          : raw.target_class?.id;
      template.target_class.id =
        typeof target === 'string' ? target.trim() : '';
      if (!template.target_class.id)
        warnings.add(`Target class is missing for template ${id}.`);
      if (!template.properties?.length)
        warnings.add(`No properties were provided for template ${id}.`);
      if (template.properties?.some((p) => !p.path.id))
        warnings.add(`Some properties in template ${id} have no predicate ID.`);
      templates.push(template);
      for (const property of template.properties ?? []) {
        if (expired()) break;
        const classId = property.class?.id;
        if (!classId || classes.has(classId)) continue;
        if (classes.size >= EXTERNAL_HIERARCHY_LIMITS.maxLookups) {
          warnings.add(
            'Template hierarchy lookup limit reached; schema information is incomplete.'
          );
          break;
        }
        classes.add(classId);
        try {
          const lookupWarnings: string[] = [];
          const ids = await getTemplatesByClass(classId, lookupWarnings, http);
          lookupWarnings.forEach((warning) => warnings.add(warning));
          if (!ids.length)
            warnings.add(
              `No subtemplate was resolved for value class ${classId}; its properties are unknown.`
            );
          if (ids.length > 1)
            warnings.add(
              `Multiple subtemplates exist for value class ${classId}; only ${ids[0]} was loaded.`
            );
          const childId = ids[0];
          if (!childId || scheduled.has(childId)) continue;
          if (scheduled.size >= EXTERNAL_HIERARCHY_LIMITS.maxTemplates) {
            warnings.add(
              'Template hierarchy template limit reached; schema information is incomplete.'
            );
            continue;
          }
          scheduled.add(childId);
          pending.push(childId);
        } catch (err) {
          if (expired()) break;
          if (err instanceof ExternalHttpError) throw err;
          warnings.add(
            `Could not load the hierarchy for value class ${classId}.`
          );
        }
      }
    }
    if (!templates.length)
      throw new Error(
        'Template hierarchy could not be loaded within its budget.'
      );
    return {
      templates,
      targetClassId: templates[0].target_class.id || undefined,
      warnings: [...warnings],
    };
  } finally {
    clearTimeout(timer);
    unlink();
  }
}

export const loadTemplateFlow = async (
  templateId: string,
  options?: { reportIncomplete?: boolean; externalMcp?: boolean }
): Promise<{
  templates: Template[];
  targetClassId?: string;
  warnings?: string[];
}> => {
  if (options?.externalMcp) return loadExternalTemplateFlow(templateId);
  const warnings = options?.reportIncomplete ? ([] as string[]) : undefined;
  const flow = await loadTemplateFlowById(
    templateId,
    new Set(),
    warnings,
    options?.externalMcp ? { externalMcp: true } : undefined
  );
  const templates = collectTemplatesFromFlow(flow);
  const root = templates.find((t) => t.id === templateId) ?? templates[0];
  const targetClassId = root?.target_class?.id;
  return { templates, targetClassId, ...(warnings && { warnings }) };
};
