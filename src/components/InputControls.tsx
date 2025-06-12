import React from 'react';
import { 
  Box, 
  Typography, 
  Paper, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  SelectChangeEvent,
  FormControlLabel,
  Switch
} from '@mui/material';
import { formatETH, formatPercentage, formatDuration, formatCurrency, formatPercentageAxis } from '../utils/formatting';
import { LoanOffer } from '../types';

interface InputControlsProps {
  collections: string[];
  onUserOfferChange: (userOffer: Partial<LoanOffer>) => void;
  userOffer: Partial<LoanOffer>;
  selectedCurrency: 'WETH' | 'USDC';
  showContours?: boolean;
  onShowContoursChange?: (show: boolean) => void;
}

const InputControls: React.FC<InputControlsProps> = ({ 
  collections, 
  onUserOfferChange,
  userOffer,
  selectedCurrency,
  showContours = true,
  onShowContoursChange
}) => {
  // Add local state for input display
  const [loanAmountInput, setLoanAmountInput] = React.useState<string>('');
  const [interestRateInput, setInterestRateInput] = React.useState<string>('');
  React.useEffect(() => {
    // Sync input when userOffer.loanAmount changes externally
    if (userOffer.loanAmount !== undefined && !isNaN(userOffer.loanAmount)) {
      setLoanAmountInput(formatCurrency(userOffer.loanAmount, selectedCurrency));
    } else {
      setLoanAmountInput('');
    }
    // Sync interest rate input
    if (userOffer.interestRate !== undefined && !isNaN(userOffer.interestRate)) {
      setInterestRateInput(formatPercentageAxis(userOffer.interestRate));
    } else {
      setInterestRateInput('');
    }
  }, [userOffer.loanAmount, userOffer.interestRate, selectedCurrency]);

  // Handlers for controlled fields
  const handleCollectionChange = (event: SelectChangeEvent) => {
    const value = event.target.value;
    onUserOfferChange({ collection: value });
  };

  const handleLoanAmountChange = (value: string) => {
    setLoanAmountInput(value);
    const numValue = Number(value.replace(/[^0-9.]/g, ''));
    if (!isNaN(numValue)) {
      onUserOfferChange({ loanAmount: numValue });
    } else {
      onUserOfferChange({ loanAmount: undefined });
    }
  };

  const handleDurationDropdownChange = (event: SelectChangeEvent) => {
    const value = event.target.value;
    if (value === 'all') {
      onUserOfferChange({ duration: undefined });
    } else {
      onUserOfferChange({ duration: Number(value) });
    }
  };

  const handleInterestRateChange = (value: string) => {
    setInterestRateInput(value);
    // Remove all non-numeric and non-dot/decimal chars
    const numValue = Number(value.replace(/[^0-9.]/g, ''));
    if (!isNaN(numValue)) {
      onUserOfferChange({ interestRate: numValue });
    } else {
      onUserOfferChange({ interestRate: undefined });
    }
  };

  // Add rounding and formatting on blur for loan amount
  const handleLoanAmountBlur = () => {
    if (userOffer.loanAmount !== undefined && !isNaN(userOffer.loanAmount)) {
      const rounded = Math.round(userOffer.loanAmount * 1000) / 1000;
      if (rounded !== userOffer.loanAmount) {
        onUserOfferChange({ loanAmount: rounded });
      }
      setLoanAmountInput(formatCurrency(rounded, selectedCurrency));
    } else {
      setLoanAmountInput('');
    }
  };

  // Add rounding and formatting on blur for interest rate
  const handleInterestRateBlur = () => {
    if (userOffer.interestRate !== undefined && !isNaN(userOffer.interestRate)) {
      const rounded = Math.round(userOffer.interestRate * 100) / 100;
      if (rounded !== userOffer.interestRate) {
        onUserOfferChange({ interestRate: rounded });
      }
      setInterestRateInput(formatPercentageAxis(rounded));
    } else {
      setInterestRateInput('');
    }
  };

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        p: 3, 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        boxShadow: '0px 0px 2px rgba(0,0,0,0.24), 0px 12px 24px -4px rgba(0,0,0,0.24)',
        borderRadius: '16px',
      }}
    >
      <Typography variant="h6" gutterBottom>
        Your Offer
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Collection Selection */}
        <FormControl fullWidth>
          <InputLabel id="collection-select-label">Collection</InputLabel>
          <Select
            labelId="collection-select-label"
            id="collection-select"
            value={userOffer.collection || ''}
            label="Collection"
            onChange={handleCollectionChange}
          >
            {collections.map((coll) => (
              <MenuItem key={coll} value={coll}>
                {coll.charAt(0).toUpperCase() + coll.slice(1)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Loan Amount Input */}
        <TextField
          fullWidth
          label="Loan Amount"
          type="text"
          value={loanAmountInput}
          onChange={(e) => handleLoanAmountChange(e.target.value)}
          onBlur={handleLoanAmountBlur}
          InputProps={{
            endAdornment: <Typography variant="body2">{selectedCurrency}</Typography>,
          }}
        />

        {/* Duration Dropdown */}
        <FormControl fullWidth>
          <InputLabel id="duration-select-label">Duration</InputLabel>
          <Select
            labelId="duration-select-label"
            id="duration-select"
            value={userOffer.duration === undefined ? 'all' : String(userOffer.duration)}
            label="Duration"
            onChange={handleDurationDropdownChange}
          >
            <MenuItem value="all">All durations</MenuItem>
            <MenuItem value="7">7 days</MenuItem>
            <MenuItem value="14">14 days</MenuItem>
            <MenuItem value="30">30 days</MenuItem>
            <MenuItem value="60">60 days</MenuItem>
            <MenuItem value="180">180 days</MenuItem>
          </Select>
        </FormControl>

        {/* Interest Rate Input */}
        <TextField
          fullWidth
          label="Interest Rate"
          type="text"
          value={interestRateInput}
          onChange={(e) => handleInterestRateChange(e.target.value)}
          onBlur={handleInterestRateBlur}
          InputProps={{
            endAdornment: <Typography variant="body2">%</Typography>,
          }}
        />

        {/* Toggle for loan density contours */}
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={showContours}
                onChange={(_, checked) => onShowContoursChange && onShowContoursChange(checked)}
                color="primary"
              />
            }
            label={<span style={{ color: '#fff' }}>Show Loan Density Contours</span>}
          />
        </Box>
      </Box>

      {/* Summary Section */}
      <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" gutterBottom>
          Your Offer Summary
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2">
            Loan Amount: {userOffer.loanAmount !== undefined ? `${formatCurrency(Number(userOffer.loanAmount), selectedCurrency)} ${selectedCurrency}` : '-'}
          </Typography>
          <Typography variant="body2">
            Duration: {userOffer.duration !== undefined ? formatDuration(Number(userOffer.duration)) : '-'}
          </Typography>
          <Typography variant="body2">
            Interest Rate: {userOffer.interestRate !== undefined ? formatPercentage(Number(userOffer.interestRate)) : '-'}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default InputControls; 