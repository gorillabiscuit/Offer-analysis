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
  SelectChangeEvent
} from '@mui/material';
import { formatETH, formatPercentage, formatDuration } from '../utils/formatting';
import { LoanOffer } from '../types';

interface InputControlsProps {
  collections: string[];
  onUserOfferChange: (userOffer: Partial<LoanOffer>) => void;
  userOffer: Partial<LoanOffer>;
  selectedCurrency: 'WETH' | 'USDC';
}

const InputControls: React.FC<InputControlsProps> = ({ 
  collections, 
  onUserOfferChange,
  userOffer,
  selectedCurrency
}) => {
  // Handlers for controlled fields
  const handleCollectionChange = (event: SelectChangeEvent) => {
    const value = event.target.value;
    onUserOfferChange({ collection: value });
  };

  const handleLoanAmountChange = (value: string) => {
    const numValue = Number(value);
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
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      onUserOfferChange({ interestRate: numValue });
    } else {
      onUserOfferChange({ interestRate: undefined });
    }
  };

  // Add rounding on blur for loan amount
  const handleLoanAmountBlur = () => {
    if (userOffer.loanAmount !== undefined && !isNaN(userOffer.loanAmount)) {
      const rounded = Math.round(userOffer.loanAmount * 1000) / 1000;
      if (rounded !== userOffer.loanAmount) {
        onUserOfferChange({ loanAmount: rounded });
      }
    }
  };

  // Add rounding on blur for interest rate
  const handleInterestRateBlur = () => {
    if (userOffer.interestRate !== undefined && !isNaN(userOffer.interestRate)) {
      const rounded = Math.round(userOffer.interestRate * 100) / 100;
      if (rounded !== userOffer.interestRate) {
        onUserOfferChange({ interestRate: rounded });
      }
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
        gap: 3
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
          type="number"
          value={userOffer.loanAmount ?? ''}
          onChange={(e) => handleLoanAmountChange(e.target.value)}
          onBlur={handleLoanAmountBlur}
          InputProps={{
            endAdornment: <Typography variant="body2">{selectedCurrency}</Typography>
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
          type="number"
          value={userOffer.interestRate ?? ''}
          onChange={(e) => handleInterestRateChange(e.target.value)}
          onBlur={handleInterestRateBlur}
          InputProps={{
            endAdornment: <Typography variant="body2">%</Typography>
          }}
        />
      </Box>

      {/* Summary Section */}
      <Box sx={{ mt: 'auto', pt: 2, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          Your Offer Summary
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2">
            Loan Amount: {userOffer.loanAmount !== undefined ? `${Number(userOffer.loanAmount).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${selectedCurrency}` : '-'}
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