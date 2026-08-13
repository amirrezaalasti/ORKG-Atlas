/** Shared ORKG template types used by prompt generation (frontend + backend). */

export type Template = {
  id: string;
  label: string;
  description?: string | null;
  target_class: {
    id: string;
    label: string;
  };
  properties?: TemplateProperty[];
};

export type TemplateProperty = {
  id: string;
  label: string;
  description?: string | null;
  order?: number;
  min_count: number | null;
  max_count: number | null;
  path: { id: string; label: string };
  class?: { id: string; label: string };
  datatype?: { id: string; label: string };
};

export type PropertyMapping = {
  label: string;
  cardinality: string;
  description: string;
  predicate_label?: string;
  class_id?: string;
  class_label?: string;
  subtemplate_id?: string;
  subtemplate_label?: string;
  subtemplate_properties?: Record<string, PropertyMapping>;
};

export type PredicatesMapping = Record<string, PropertyMapping>;
