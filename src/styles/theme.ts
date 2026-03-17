import { createTheme } from '@mui/material/styles';

const baseThemeOptions = {
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: 'Public Sans, sans-serif',
    h6: {
      fontWeight: 700,
      fontSize: '18px',
      lineHeight: '28px',
    },
    body1: {
      fontSize: '14px',
      lineHeight: '22px',
    },
    body2: {
      fontSize: '13px',
      lineHeight: '22px',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
} as const;

export const darkTheme = createTheme({
  ...baseThemeOptions,
  palette: {
    mode: 'dark',
    background: {
      paper: '#221E37',
      default: '#16152D',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#919EAB',
    },
    divider: 'rgba(145,158,171,0.2)',
    primary: {
      main: '#FFFFFF',
    },
    secondary: {
      main: '#919EAB',
    },
  },
  components: {
    ...baseThemeOptions.components,
    MuiInputBase: {
      styleOverrides: {
        root: {
          background: '#221E37',
          color: '#FFFFFF',
          '&.Mui-focused': {
            background: '#221E37',
          },
        },
        input: {
          color: '#FFFFFF',
          '&::placeholder': {
            color: '#919EAB',
            opacity: 1,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& fieldset': {
            borderColor: 'rgba(145,158,171,0.2)',
          },
          '&:hover fieldset': {
            borderColor: 'rgba(145,158,171,0.3)',
          },
          '&.Mui-focused fieldset': {
            borderColor: 'rgba(145,158,171,0.4)',
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#919EAB',
          '&.Mui-focused': {
            color: '#FFFFFF',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: '#FFFFFF',
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: '#919EAB',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          color: 'rgba(255,255,255,0.8)',
          '&.Mui-selected': {
            color: '#FFFFFF',
            background: '#221E37',
          },
        },
      },
    },
  },
});

export const lightTheme = createTheme({
  ...baseThemeOptions,
  palette: {
    mode: 'light',
    background: {
      paper: '#FFFFFF',
      default: '#EFF1F7',
    },
    text: {
      primary: '#1F2330',
      secondary: '#586072',
    },
    divider: 'rgba(31,35,48,0.18)',
    primary: {
      main: '#1F2330',
    },
    secondary: {
      main: '#586072',
    },
  },
  components: {
    ...baseThemeOptions.components,
    MuiInputBase: {
      styleOverrides: {
        root: {
          background: '#FFFFFF',
          color: '#1F2330',
          '&.Mui-focused': {
            background: '#FFFFFF',
          },
        },
        input: {
          color: '#1F2330',
          '&::placeholder': {
            color: '#586072',
            opacity: 1,
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& fieldset': {
            borderColor: 'rgba(31,35,48,0.2)',
          },
          '&:hover fieldset': {
            borderColor: 'rgba(31,35,48,0.35)',
          },
          '&.Mui-focused fieldset': {
            borderColor: 'rgba(31,35,48,0.5)',
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#586072',
          '&.Mui-focused': {
            color: '#1F2330',
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        icon: {
          color: '#1F2330',
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: '#586072',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          color: '#1F2330',
          '&.Mui-selected': {
            color: '#FFFFFF',
            background: '#1F2330',
          },
        },
      },
    },
  },
});

export default darkTheme;