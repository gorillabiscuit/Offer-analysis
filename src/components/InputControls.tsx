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
  initialValues?: Partial<LoanOffer>;
}

const InputControls: React.FC<InputControlsProps> = ({ 
  collections, 
  onUserOfferChange,
  initialValues = {}
}) => {
  const [loanAmount, setLoanAmount] = React.useState<string>(initialValues.loanAmount?.toString() || '');
  const [duration, setDuration] = React.useState<string>(initialValues.duration?.toString() || '');
  const [interestRate, setInterestRate] = React.useState<string>(initialValues.interestRate?.toString() || '');
  const [collection, setCollection] = React.useState<string>(initialValues.collection || '');

  const handleCollectionChange = (event: SelectChangeEvent) => {
    const value = event.target.value;
    setCollection(value);
    onUserOfferChange({ collection: value });
  };

  const handleLoanAmountChange = (value: string) => {
    setLoanAmount(value);
  };

  const handleDurationChange = (value: string) => {
    setDuration(value);
  };

  const handleInterestRateChange = (value: string) => {
    setInterestRate(value);
  };

  const handleInputComplete = (field: keyof LoanOffer, value: string) => {
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      onUserOfferChange({ [field]: numValue });
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLDivElement>, field: keyof LoanOffer, value: string) => {
    if (event.key === 'Enter') {
      handleInputComplete(field, value);
    }
  };

  // Handle immediate updates for stepper controls
  const handleStepperChange = (field: keyof LoanOffer, value: string) => {
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      // Update local state
      switch (field) {
        case 'loanAmount':
          setLoanAmount(value);
          break;
        case 'duration':
          setDuration(value);
          break;
        case 'interestRate':
          setInterestRate(value);
          break;
      }
      // Immediately update the graph
      onUserOfferChange({ [field]: numValue });
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
            value={collection}
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
          value={loanAmount}
          onChange={(e) => handleLoanAmountChange(e.target.value)}
          onBlur={() => handleInputComplete('loanAmount', loanAmount)}
          onKeyPress={(e) => handleKeyPress(e, 'loanAmount', loanAmount)}
          onInput={(e) => handleStepperChange('loanAmount', (e.target as HTMLInputElement).value)}
          InputProps={{
            endAdornment: <Typography variant="body2">ETH</Typography>
          }}
        />

        {/* Duration Input */}
        <TextField
          fullWidth
          label="Duration"
          type="number"
          value={duration}
          onChange={(e) => handleDurationChange(e.target.value)}
          onBlur={() => handleInputComplete('duration', duration)}
          onKeyPress={(e) => handleKeyPress(e, 'duration', duration)}
          onInput={(e) => handleStepperChange('duration', (e.target as HTMLInputElement).value)}
          InputProps={{
            endAdornment: <Typography variant="body2">days</Typography>
          }}
        />

        {/* Interest Rate Input */}
        <TextField
          fullWidth
          label="Interest Rate"
          type="number"
          value={interestRate}
          onChange={(e) => handleInterestRateChange(e.target.value)}
          onBlur={() => handleInputComplete('interestRate', interestRate)}
          onKeyPress={(e) => handleKeyPress(e, 'interestRate', interestRate)}
          onInput={(e) => handleStepperChange('interestRate', (e.target as HTMLInputElement).value)}
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
            Loan Amount: {loanAmount ? formatETH(Number(loanAmount)) : '-'}
          </Typography>
          <Typography variant="body2">
            Duration: {duration ? formatDuration(Number(duration)) : '-'}
          </Typography>
          <Typography variant="body2">
            Interest Rate: {interestRate ? formatPercentage(Number(interestRate)) : '-'}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default InputControls; 