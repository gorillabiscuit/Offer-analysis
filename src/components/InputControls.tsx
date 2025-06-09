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
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      onUserOfferChange({ loanAmount: numValue });
    }
  };

  const handleDurationChange = (value: string) => {
    setDuration(value);
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      onUserOfferChange({ duration: numValue });
    }
  };

  const handleInterestRateChange = (value: string) => {
    setInterestRate(value);
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      onUserOfferChange({ interestRate: numValue });
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