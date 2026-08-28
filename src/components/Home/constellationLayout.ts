import {
  Template,
  TemplateCoverageCard,
} from '../../firestore/CRUDHomeContent';

export const VB_W = 560;
export const VB_H = 540;
export const CX = 280;
export const CY = 260;

export interface GraphNode {
  id: string;
  label: string;
  kind: 'hub' | 'template' | 'concept';
  x: number;
  y: number;
  to?: string;
}

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
};

const stripDecor = (label: string) =>
  label.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();

export const wrapLabel = (label: string): string[] => {
  const clean = label.trim();
  if (clean.length <= 16) return [clean];
  const words = clean.split(/\s+/);
  if (words.length === 1) return [`${clean.slice(0, 15)}…`];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
};

const anglesFor = (count: number, start: number) =>
  Array.from({ length: count }, (_, i) => start + (360 / count) * i);

export const buildNodes = (
  templates: Template[],
  cards: TemplateCoverageCard[]
): GraphNode[] => {
  const hub: GraphNode = {
    id: 'atlas',
    label: 'Atlas',
    kind: 'hub',
    x: CX,
    y: CY,
  };
  const t = templates.slice(0, 6);
  const c = cards.slice(0, 4);
  const tStart = t.length === 2 ? 180 : -90;
  const tNodes: GraphNode[] = t.map((tpl, i) => {
    const deg =
      t.length === 2 ? (i === 0 ? 180 : 0) : anglesFor(t.length, tStart)[i];
    return {
      id: tpl.id,
      label: tpl.title,
      kind: 'template',
      ...polar(126, deg),
      to: `/${tpl.id}/allquestions`,
    };
  });
  const cNodes: GraphNode[] = c.map((card, i) => {
    const deg = anglesFor(c.length, t.length === 2 ? -90 : -60)[i];
    return {
      id: `concept-${i}`,
      label: stripDecor(card.title),
      kind: 'concept',
      ...polar(198, deg),
    };
  });
  return [hub, ...tNodes, ...cNodes];
};
