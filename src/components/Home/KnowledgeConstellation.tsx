import { Box, Typography, useTheme } from '@mui/material';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState, type PointerEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Template,
  TemplateCoverageCard,
} from '../../firestore/CRUDHomeContent';
import { ATLAS_DISPLAY_FONT, atlasSteel } from './atlasTokens';
import { brandColors } from '../../constants/brandColors';
import {
  buildNodes,
  CX,
  CY,
  VB_H,
  VB_W,
  wrapLabel,
} from './constellationLayout';

interface KnowledgeConstellationProps {
  templates: Template[];
  coverageCards?: TemplateCoverageCard[];
}

const KnowledgeConstellation = ({
  templates,
  coverageCards = [],
}: KnowledgeConstellationProps) => {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  const navigate = useNavigate();
  const { templateId } = useParams<{ templateId: string }>();
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ lat: '52.4', lon: '9.7' });

  const dark = theme.palette.mode === 'dark';
  const steel = dark ? '#9bb0bd' : atlasSteel;
  const coral = brandColors.primary.main;
  const ink = dark ? '#f3eeeb' : '#1a2328';
  const grid = dark ? 'rgba(255,255,255,0.12)' : 'rgba(58,83,102,0.22)';

  const nodes = useMemo(
    () => buildNodes(templates, coverageCards),
    [templates, coverageCards]
  );
  const satellites = nodes.filter((n) => n.kind !== 'hub');

  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const lat = 90 - y * 180;
    const lon = x * 360 - 180;
    setCursor({
      lat: `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`,
      lon: `${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`,
    });
  };

  return (
    <Box
      sx={{ position: 'relative', width: '100%', maxWidth: 560, mx: 'auto' }}
    >
      <Box
        component="svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label="Knowledge graph of Atlas templates and research lenses"
        onPointerMove={onMove}
        sx={{
          width: '100%',
          height: 'auto',
          display: 'block',
          overflow: 'visible',
          cursor: 'crosshair',
          '& g[tabindex]:focus': { outline: 'none' },
          '& g[tabindex]:focus-visible circle': {
            filter: `drop-shadow(0 0 6px ${coral})`,
          },
        }}
      >
        <title>ORKG Atlas constellation</title>
        {[70, 126, 198].map((r) => (
          <circle
            key={r}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke={grid}
            strokeWidth={r === 126 ? 1.1 : 0.7}
          />
        ))}
        <line
          x1={CX}
          y1={32}
          x2={CX}
          y2={VB_H - 32}
          stroke={grid}
          strokeWidth={0.7}
        />
        <line
          x1={32}
          y1={CY}
          x2={VB_W - 32}
          y2={CY}
          stroke={grid}
          strokeWidth={0.7}
        />

        {satellites.map((node) => {
          const active = hovered === node.id || hovered === 'atlas';
          return (
            <motion.line
              key={`e-${node.id}`}
              x1={CX}
              y1={CY}
              x2={node.x}
              y2={node.y}
              stroke={active ? coral : steel}
              strokeWidth={active ? 1.8 : 1}
              strokeDasharray="5 7"
              opacity={hovered && !active ? 0.25 : 0.85}
              animate={
                reduceMotion ? undefined : { strokeDashoffset: [0, -24] }
              }
              transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
            />
          );
        })}

        {nodes.map((node) => {
          const here = node.kind === 'template' && node.id === templateId;
          const r =
            node.kind === 'hub' ? 16 : node.kind === 'template' ? 11 : 8;
          const fill =
            node.kind === 'hub' || here
              ? coral
              : node.kind === 'template'
                ? steel
                : 'transparent';
          const stroke = node.kind === 'concept' ? steel : fill;
          const lines = wrapLabel(node.label);
          const placeBelow = node.kind === 'hub' || node.y >= CY;
          const labelY = placeBelow
            ? node.y + r + 16
            : node.y - r - 4 - (lines.length - 1) * 14;
          return (
            <motion.g
              key={node.id}
              onPointerEnter={() => setHovered(node.id)}
              onPointerLeave={() => setHovered(null)}
              onClick={() => node.to && navigate(node.to)}
              onKeyDown={(event) => {
                if (!node.to) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(node.to);
                }
              }}
              tabIndex={node.to ? 0 : undefined}
              role={node.to ? 'link' : undefined}
              aria-label={node.to ? `Open ${node.label}` : undefined}
              style={{ cursor: node.to ? 'pointer' : 'default' }}
            >
              {here && !reduceMotion && (
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={r + 8}
                  fill="none"
                  stroke={coral}
                  strokeWidth={1.2}
                  initial={{ opacity: 0.7 }}
                  animate={{ opacity: [0.55, 0], r: [r + 8, r + 20] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: 'easeOut',
                  }}
                />
              )}
              <motion.circle
                cx={node.x}
                cy={node.y}
                r={r}
                fill={fill}
                stroke={stroke}
                strokeWidth={2}
                animate={
                  reduceMotion || node.kind !== 'hub'
                    ? undefined
                    : { r: [r, r + 2, r] }
                }
                transition={{
                  duration: 3.4,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <text
                x={node.x}
                y={labelY}
                textAnchor="middle"
                fill={ink}
                fontSize={node.kind === 'hub' ? 15 : 11.5}
                fontFamily={ATLAS_DISPLAY_FONT}
                fontWeight={node.kind === 'hub' ? 800 : 600}
              >
                {lines.map((line, lineIndex) => (
                  <tspan key={line} x={node.x} dy={lineIndex === 0 ? 0 : 14}>
                    {line}
                  </tspan>
                ))}
              </text>
            </motion.g>
          );
        })}
      </Box>

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 1,
          px: 0.5,
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            letterSpacing: '0.08em',
            color: 'text.secondary',
          }}
        >
          {cursor.lat} · {cursor.lon}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Hover a node · coral marks where you are
        </Typography>
      </Box>
    </Box>
  );
};

export default KnowledgeConstellation;
