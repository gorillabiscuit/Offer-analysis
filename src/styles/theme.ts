import { createTheme } from '@mui/material/styles';

const darkTheme = createTheme({
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
      color: '#919EAB',
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

export default darkTheme; 