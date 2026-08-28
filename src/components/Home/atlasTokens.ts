import { alpha, PaletteMode, SxProps, Theme } from '@mui/material';
import { brandColors } from '../../constants/brandColors';

/** Geometric display face — used only for atlas headlines. */
export const ATLAS_DISPLAY_FONT =
  '"Syne", "Avenir Next", "Segoe UI", sans-serif';

export const atlasSteel = '#3a5366';

export const displayFontSx = {
  fontFamily: ATLAS_DISPLAY_FONT,
} as const;

export const homeContainerSx = {
  maxWidth: 1120,
  mx: 'auto',
  px: { xs: 2.5, sm: 3, md: 4 },
  width: '100%',
} as const;

export function atlasFieldSx(mode: PaletteMode): SxProps<Theme> {
  const line =
    mode === 'dark' ? 'rgba(255,255,255,0.045)' : 'rgba(58, 83, 102, 0.1)';
  const major =
    mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(58, 83, 102, 0.18)';
  const field = mode === 'dark' ? brandColors.surfacesDark.default : '#e4eaee';
  const wash =
    mode === 'dark'
      ? 'radial-gradient(ellipse at 50% -10%, rgba(232,97,97,0.12), transparent 52%)'
      : 'radial-gradient(ellipse at 50% -10%, rgba(232,97,97,0.1), transparent 52%)';

  return {
    backgroundColor: field,
    backgroundImage: `${wash}, linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px), linear-gradient(${major} 1px, transparent 1px), linear-gradient(90deg, ${major} 1px, transparent 1px)`,
    backgroundSize: 'auto, 32px 32px, 32px 32px, 160px 160px, 160px 160px',
    '@keyframes atlasGridDrift': {
      '0%': { backgroundPosition: '0 0, 0 0, 0 0, 0 0, 0 0' },
      '100%': {
        backgroundPosition:
          '0 0, 160px 160px, 160px 160px, 160px 160px, 160px 160px',
      },
    },
    '@media (prefers-reduced-motion: no-preference)': {
      animation: 'atlasGridDrift 72s linear infinite',
    },
  };
}

export function plateSx(mode: PaletteMode): SxProps<Theme> {
  return {
    p: { xs: 3, sm: 3.5, md: 4 },
    borderRadius: 1,
    border: '1px solid',
    borderColor:
      mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(58,83,102,0.14)',
    backgroundColor:
      mode === 'dark'
        ? alpha(brandColors.surfacesDark.paper, 0.92)
        : alpha('#f7f9fb', 0.92),
    backdropFilter: 'blur(12px)',
    boxShadow: 'none',
    overflow: 'hidden',
  };
}
