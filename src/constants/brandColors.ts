/**
 * Brand palette: light blue primary; warm coral as MUI secondary accent.
 * Keep in sync with hardcoded chart/UI hex where imports are not used.
 */
export const brandColors = {
  primary: {
    main: '#039be5',
    light: '#4fc3f7',
    dark: '#006db3',
    hover: '#0277bd',
  },
  primaryDarkMode: {
    main: '#4fc3f7',
    light: '#81d4fa',
    dark: '#0288d1',
    contrastText: 'rgba(0, 0, 0, 0.87)',
  },
  secondary: {
    main: '#e86161',
    light: '#ff8f8f',
    dark: '#b13737',
  },
  secondaryDarkMode: {
    main: '#ff7b7b',
    light: '#ff9d9d',
    dark: '#cc4444',
  },
} as const;
