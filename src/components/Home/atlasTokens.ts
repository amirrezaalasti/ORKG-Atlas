import { alpha, PaletteMode, SxProps, Theme } from '@mui/material';
import { brandColors } from '../../constants/brandColors';

export const homeContainerSx = {
  maxWidth: 1120,
  mx: 'auto',
  px: { xs: 2.5, sm: 3, md: 4 },
  width: '100%',
} as const;

export function plateSx(mode: PaletteMode): SxProps<Theme> {
  return {
    p: { xs: 3, sm: 3.5, md: 4 },
    borderRadius: 2,
    border: '1px solid',
    borderColor:
      mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    backgroundColor:
      mode === 'dark'
        ? brandColors.surfacesDark.paper
        : brandColors.surfaces.paper,
    boxShadow: 'none',
    overflow: 'hidden',
  };
}

export const heroWashSx = {
  backgroundImage: (theme: Theme) =>
    theme.palette.mode === 'dark'
      ? `radial-gradient(ellipse at 80% 0%, ${alpha(brandColors.primary.main, 0.14)}, transparent 48%)`
      : `radial-gradient(ellipse at 80% 0%, ${alpha(brandColors.primary.main, 0.08)}, transparent 48%)`,
} as const;
