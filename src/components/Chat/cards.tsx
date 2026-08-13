/**
 * Inline ORKG cards rendered from tool result envelopes.
 *
 * Each card is intentionally compact and link-out friendly so the chat page
 * stays readable when the model emits several cards back-to-back.
 */

import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Stack,
  IconButton,
  Tooltip,
  Link as MuiLink,
  Collapse,
  Divider,
} from '@mui/material';
import {
  OpenInNew,
  Article,
  Schema,
  Compare,
  Hub,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { useState, type MouseEvent } from 'react';
import { useChatPreviewOptional } from '../../context/ChatPreviewContext';
import { canOpenInChatPreview } from '../../utils/chatPreview';
import PreviewLink from './PreviewLink';

interface OrkgPaperLike {
  id: string;
  title?: string;
  identifiers?: { doi?: string | string[] };
  publication_info?: {
    published_year?: number;
    published_month?: number;
    published_in?: string;
  };
  authors?: Array<{ name?: string }>;
  abstract?: string;
  link?: string;
  doi?: string;
  year?: number;
}

interface OrkgResourceLike {
  id: string;
  label?: string;
  classes?: string[];
  link?: string;
}

interface OrkgComparisonLike {
  id: string;
  title?: string;
  description?: string;
  contributions?: Array<{ id: string; label?: string }>;
  predicates?: Array<{ id: string; label?: string }>;
  link?: string;
}

interface OrkgTemplateLike {
  id: string;
  label?: string;
  description?: string;
  target_class?: { id: string; label?: string } | string;
  properties?: Array<{
    id?: string;
    label?: string;
    path?: { id: string; label?: string };
    class?: { id: string; label?: string } | null;
    datatype?: string | null;
  }>;
  link?: string;
}

const cardSx = { borderRadius: 2, mb: 1.5 };

const ExternalLinkButton = ({
  href,
  label,
}: {
  href?: string;
  label: string;
}) => {
  const { tryOpenPreviewFromClick } = useChatPreviewOptional();
  if (!href) return null;

  const openInPanel = canOpenInChatPreview(href);
  const tooltip = openInPanel ? `${label} (side panel)` : label;

  const onClick = (e: MouseEvent) => {
    if (openInPanel) {
      if (tryOpenPreviewFromClick(e, href, label)) return;
    }
    if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Tooltip title={tooltip} arrow>
      <IconButton
        size="small"
        component="a"
        href={href}
        target={openInPanel ? undefined : '_blank'}
        rel={openInPanel ? undefined : 'noreferrer'}
        onClick={onClick}
      >
        <OpenInNew fontSize="small" />
      </IconButton>
    </Tooltip>
  );
};

export const PaperCard = ({ paper }: { paper: OrkgPaperLike }) => {
  const [open, setOpen] = useState(false);
  const year = paper.year ?? paper.publication_info?.published_year;
  const venue = paper.publication_info?.published_in;
  const authors = (paper.authors || [])
    .map((a) => a.name)
    .filter((s): s is string => !!s);
  const doiVal = Array.isArray(paper.identifiers?.doi)
    ? paper.identifiers?.doi?.[0]
    : ((paper.identifiers?.doi as string | undefined) ?? paper.doi);

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Article color="primary" fontSize="small" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ mb: 0.5 }}
            >
              <Chip size="small" label="ORKG Paper" variant="outlined" />
              <Chip size="small" label={paper.id} variant="outlined" />
              {year && (
                <Chip size="small" label={String(year)} variant="outlined" />
              )}
              <Box sx={{ flex: 1 }} />
              <ExternalLinkButton href={paper.link} label="Open in ORKG" />
              {doiVal && (
                <ExternalLinkButton
                  href={`https://doi.org/${String(doiVal).replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`}
                  label="Open DOI"
                />
              )}
            </Stack>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {paper.title ?? paper.id}
            </Typography>
            {authors.length > 0 && (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                {authors.slice(0, 6).join(', ')}
                {authors.length > 6 && ` +${authors.length - 6} more`}
                {venue ? ` — ${venue}` : ''}
              </Typography>
            )}
            {paper.abstract && (
              <>
                <Box sx={{ mt: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      display: open ? 'block' : '-webkit-box',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      WebkitLineClamp: open ? 'unset' : 3,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {paper.abstract}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => setOpen((v) => !v)}>
                  {open ? (
                    <ExpandLess fontSize="small" />
                  ) : (
                    <ExpandMore fontSize="small" />
                  )}
                </IconButton>
              </>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
};

export const ResourceCard = ({ resource }: { resource: OrkgResourceLike }) => (
  <Card variant="outlined" sx={cardSx}>
    <CardContent>
      <Stack direction="row" spacing={1} alignItems="center">
        <Hub color="primary" fontSize="small" />
        <Chip size="small" label="Resource" variant="outlined" />
        <Chip size="small" label={resource.id} variant="outlined" />
        {(resource.classes || []).slice(0, 4).map((c) => (
          <Chip key={c} size="small" label={c} />
        ))}
        <Box sx={{ flex: 1 }} />
        <ExternalLinkButton href={resource.link} label="Open in ORKG" />
      </Stack>
      <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 600 }}>
        {resource.label ?? resource.id}
      </Typography>
    </CardContent>
  </Card>
);

export const ComparisonCard = ({
  comparison,
}: {
  comparison: OrkgComparisonLike;
}) => (
  <Card variant="outlined" sx={cardSx}>
    <CardContent>
      <Stack direction="row" spacing={1} alignItems="center">
        <Compare color="primary" fontSize="small" />
        <Chip size="small" label="Comparison" variant="outlined" />
        <Chip size="small" label={comparison.id} variant="outlined" />
        <Box sx={{ flex: 1 }} />
        <ExternalLinkButton href={comparison.link} label="Open in ORKG" />
      </Stack>
      <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 600 }}>
        {comparison.title ?? comparison.id}
      </Typography>
      {comparison.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {comparison.description}
        </Typography>
      )}
      {comparison.contributions && comparison.contributions.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Typography variant="caption" color="text.secondary">
            Contributions ({comparison.contributions.length})
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
            {comparison.contributions.slice(0, 8).map((c) => (
              <Chip
                key={c.id}
                size="small"
                label={c.label ?? c.id}
                variant="outlined"
              />
            ))}
            {comparison.contributions.length > 8 && (
              <Chip
                size="small"
                label={`+${comparison.contributions.length - 8}`}
              />
            )}
          </Stack>
        </>
      )}
    </CardContent>
  </Card>
);

export const TemplateCard = ({ template }: { template: OrkgTemplateLike }) => {
  const [open, setOpen] = useState(false);
  const targetClass =
    typeof template.target_class === 'string'
      ? template.target_class
      : template.target_class?.label || template.target_class?.id;
  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center">
          <Schema color="primary" fontSize="small" />
          <Chip size="small" label="Template" variant="outlined" />
          <Chip size="small" label={template.id} variant="outlined" />
          {targetClass && (
            <Chip
              size="small"
              label={`class: ${targetClass}`}
              variant="outlined"
            />
          )}
          <Box sx={{ flex: 1 }} />
          <ExternalLinkButton href={template.link} label="Open in ORKG" />
        </Stack>
        <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: 600 }}>
          {template.label ?? template.id}
        </Typography>
        {template.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {template.description}
          </Typography>
        )}
        {template.properties && template.properties.length > 0 && (
          <>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ mt: 1 }}
            >
              <Typography variant="caption" color="text.secondary">
                {template.properties.length} properties
              </Typography>
              <IconButton size="small" onClick={() => setOpen((v) => !v)}>
                {open ? (
                  <ExpandLess fontSize="small" />
                ) : (
                  <ExpandMore fontSize="small" />
                )}
              </IconButton>
            </Stack>
            <Collapse in={open}>
              <Stack spacing={0.5} sx={{ mt: 1 }}>
                {template.properties.slice(0, 30).map((p) => (
                  <Box
                    key={
                      (p.path?.id ||
                        p.id ||
                        p.label ||
                        Math.random().toString()) + ''
                    }
                    sx={{
                      display: 'flex',
                      gap: 1,
                      fontSize: '0.85rem',
                      borderBottom: '1px dashed',
                      borderColor: 'divider',
                      pb: 0.25,
                    }}
                  >
                    <Box sx={{ flex: 1, fontWeight: 500 }}>
                      {p.label ??
                        p.path?.label ??
                        p.path?.id ??
                        p.id ??
                        'property'}
                    </Box>
                    <Box sx={{ color: 'text.secondary' }}>
                      {p.class?.label ?? p.class?.id ?? p.datatype ?? '—'}
                    </Box>
                  </Box>
                ))}
                {template.properties.length > 30 && (
                  <Typography variant="caption" color="text.secondary">
                    +{template.properties.length - 30} more
                  </Typography>
                )}
              </Stack>
            </Collapse>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export interface TemplateListItemLike {
  id: string;
  label: string;
  description?: string;
  targetClassId?: string;
  link?: string;
  inAtlas?: boolean;
  hasPrecomputedStats?: boolean;
}

export const TemplatesListCard = ({
  items,
  total,
  page,
}: {
  items: TemplateListItemLike[];
  total?: number;
  page?: number;
}) => (
  <Card variant="outlined" sx={cardSx}>
    <CardContent>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip size="small" label="Templates" variant="outlined" />
        <Typography variant="caption" color="text.secondary">
          {items.length} shown
          {total != null ? ` · ${total} in ORKG` : ''}
          {page != null ? ` · page ${page}` : ''}
        </Typography>
      </Stack>
      <Stack spacing={0.75}>
        {items.slice(0, 25).map((t) => (
          <Box
            key={t.id}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              py: 0.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack
                direction="row"
                spacing={0.5}
                flexWrap="wrap"
                alignItems="center"
              >
                <Chip
                  size="small"
                  label={t.id}
                  sx={{ fontFamily: 'monospace', height: 20 }}
                />
                {t.inAtlas && (
                  <Chip
                    size="small"
                    label="Atlas"
                    color="primary"
                    variant="outlined"
                    sx={{ height: 20 }}
                  />
                )}
                {t.hasPrecomputedStats && (
                  <Chip
                    size="small"
                    label="stats"
                    variant="outlined"
                    sx={{ height: 20 }}
                  />
                )}
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>
                {t.link ? (
                  <MuiLink
                    href={t.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                  >
                    {t.label}
                  </MuiLink>
                ) : (
                  t.label
                )}
              </Typography>
              {t.targetClassId && (
                <Typography variant="caption" color="text.secondary">
                  class {t.targetClassId}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
        {items.length > 25 && (
          <Typography variant="caption" color="text.secondary">
            +{items.length - 25} more — use atlas_list_templates with a higher
            page/size
          </Typography>
        )}
      </Stack>
    </CardContent>
  </Card>
);

export const StatsCard = ({
  data,
}: {
  data: {
    templateId?: string;
    templateLabel?: string;
    statistics?: Array<{ id: string }>;
    statisticId?: string;
    paperCount?: number;
    paperCountSource?: string;
    venueCount?: number;
    relatedStatisticIds?: string[];
    data?: Record<string, unknown>;
  };
}) => {
  if (data.statistics) {
    return (
      <Card variant="outlined" sx={cardSx}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>
            Statistics for {data.templateId}
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {data.statistics.map((s) => (
              <Chip key={s.id} size="small" label={s.id} />
            ))}
          </Stack>
        </CardContent>
      </Card>
    );
  }
  const stats = (data.data || {}) as Record<string, unknown>;
  const paperCount =
    data.paperCount ??
    (typeof stats.paperCount === 'number' ? stats.paperCount : undefined);
  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" label="Stats" variant="outlined" />
          <Typography variant="subtitle2">
            {data.templateLabel ?? data.templateId} · {data.statisticId}
          </Typography>
        </Stack>
        {paperCount != null && paperCount > 0 && (
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
            {paperCount.toLocaleString()} papers
            {data.paperCountSource && data.paperCountSource !== data.statisticId
              ? ` (${data.paperCountSource})`
              : ''}
          </Typography>
        )}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 1,
            mt: 1,
          }}
        >
          {Object.entries(stats)
            .filter(([k]) => !['id', 'updatedAt'].includes(k))
            .map(([k, v]) => (
              <Box
                key={k}
                sx={{ p: 1, bgcolor: 'action.hover', borderRadius: 1 }}
              >
                <Typography variant="caption" color="text.secondary">
                  {k}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {typeof v === 'number' || typeof v === 'string'
                    ? String(v)
                    : JSON.stringify(v)}
                </Typography>
              </Box>
            ))}
        </Box>
      </CardContent>
    </Card>
  );
};

export const AskSynthesisCard = ({
  question,
  synthesis,
}: {
  question: string;
  synthesis: string;
}) => (
  <Card variant="outlined" sx={cardSx}>
    <CardContent>
      <Chip
        size="small"
        label="ORKG Ask synthesis"
        variant="outlined"
        sx={{ mb: 1 }}
      />
      <Typography variant="subtitle2" gutterBottom>
        {question}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {synthesis || '(no synthesis returned)'}
      </Typography>
    </CardContent>
  </Card>
);

const ORKG_ASK_ITEM_URL = 'https://ask.orkg.org/item/';

export interface AskRelatedItem {
  id: string;
  title?: string;
  abstract?: string;
  year?: number;
  doi?: string;
  link?: string;
}

export const AskPaperRelatedCard = ({
  sourcePaper,
  relatedItems,
  totalHits,
}: {
  sourcePaper: OrkgPaperLike & { link?: string };
  relatedItems: AskRelatedItem[];
  totalHits?: number;
}) => {
  const { openPreview } = useChatPreviewOptional();
  const [idx, setIdx] = useState(0);
  const rp = relatedItems[idx];
  const authors = (sourcePaper.authors || [])
    .map((a) => a.name)
    .filter((s): s is string => !!s);

  return (
    <Card variant="outlined" sx={cardSx}>
      <CardContent>
        <Chip
          size="small"
          label="ORKG Ask · related literature"
          variant="outlined"
          sx={{ mb: 1 }}
        />
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Article color="primary" fontSize="small" />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2">
              {sourcePaper.title || sourcePaper.id}
            </Typography>
            {authors.length > 0 && (
              <Typography variant="caption" color="text.secondary">
                {authors.join(', ')}
                {sourcePaper.year ? ` · ${sourcePaper.year}` : ''}
              </Typography>
            )}
          </Box>
          <ExternalLinkButton href={sourcePaper.link} label="Open in ORKG" />
        </Stack>

        {relatedItems.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No related papers found in ORKG Ask.
          </Typography>
        ) : (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Related in ORKG Ask ({idx + 1} / {relatedItems.length}
              {totalHits != null && totalHits > relatedItems.length
                ? ` · ${totalHits} total hits`
                : ''}
              )
            </Typography>
            {rp && (
              <Card
                variant="outlined"
                sx={{
                  mt: 1,
                  borderColor: 'primary.light',
                  cursor: rp.link ? 'pointer' : 'default',
                }}
                onClick={() => {
                  const url = rp.link || `${ORKG_ASK_ITEM_URL}${rp.id}`;
                  openPreview(url, rp.title || rp.id);
                }}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <PreviewLink
                    href={rp.link || `${ORKG_ASK_ITEM_URL}${rp.id}`}
                    underline="hover"
                    variant="subtitle2"
                    sx={{ fontWeight: 600 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {rp.title || rp.id}
                  </PreviewLink>
                  {rp.year && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                    >
                      {rp.year}
                    </Typography>
                  )}
                  {rp.abstract && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mt: 0.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: '0.8rem',
                      }}
                    >
                      {rp.abstract}
                    </Typography>
                  )}
                </CardContent>
              </Card>
            )}
            {relatedItems.length > 1 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Chip
                  size="small"
                  label="Previous"
                  disabled={idx === 0}
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  variant="outlined"
                />
                <Chip
                  size="small"
                  label="Next"
                  disabled={idx >= relatedItems.length - 1}
                  onClick={() =>
                    setIdx((i) => Math.min(relatedItems.length - 1, i + 1))
                  }
                  variant="outlined"
                />
              </Stack>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export const AskAnswerCard = ({
  prompt,
  answer,
}: {
  prompt: string;
  answer: string;
}) => (
  <Card variant="outlined" sx={cardSx}>
    <CardContent>
      <Chip size="small" label="ORKG Ask" variant="outlined" sx={{ mb: 1 }} />
      <Typography
        variant="caption"
        color="text.secondary"
        display="block"
        gutterBottom
      >
        {prompt}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
        {answer}
      </Typography>
    </CardContent>
  </Card>
);

export const DynamicQuestionsCard = ({
  items,
}: {
  items: Array<{
    id: string;
    name?: string;
    state?: { question?: string };
    templateId?: string;
  }>;
}) => (
  <Card variant="outlined" sx={cardSx}>
    <CardContent>
      <Typography variant="subtitle2" gutterBottom>
        Saved dynamic questions ({items.length})
      </Typography>
      <Stack spacing={0.5}>
        {items.slice(0, 12).map((q) => (
          <MuiLink
            key={q.id}
            href={
              q.templateId
                ? `/${q.templateId}/community-questions/${q.id}`
                : `/community-questions/${q.id}`
            }
            target="_blank"
            rel="noreferrer"
            underline="hover"
            sx={{ fontSize: '0.9rem' }}
          >
            {q.name || q.state?.question || q.id}
          </MuiLink>
        ))}
      </Stack>
    </CardContent>
  </Card>
);
