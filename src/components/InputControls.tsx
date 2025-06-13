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
  Switch,
  CircularProgress
} from '@mui/material';
import { formatPercentage, formatDuration, formatCurrency, formatPercentageAxis } from '../utils/formatting';
import { LoanOffer, Collection } from '../types';
import { useCollections } from '../hooks/useCollections';

interface InputControlsProps {
  onUserOfferChange: (userOffer: Partial<LoanOffer>) => void;
  userOffer: Partial<LoanOffer>;
  selectedCurrency: 'WETH' | 'USDC';
  showContours?: boolean;
  onShowContoursChange?: (show: boolean) => void;
}

const InputControls: React.FC<InputControlsProps> = ({ 
  onUserOfferChange,
  userOffer,
  selectedCurrency,
  showContours = true,
  onShowContoursChange
}) => {
  const { collections, loading, error } = useCollections();
  
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
    const selectedCollection = collections.find(c => c.contract_address === value);
    if (selectedCollection) {
      onUserOfferChange({ 
        collection: selectedCollection.name,
        collectionAddress: selectedCollection.contract_address 
      });
    }
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
      // Convert seconds to days for storage
      const durationInDays = Number(value) / 86400;
      onUserOfferChange({ duration: durationInDays });
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
            value={userOffer.collectionAddress || ''}
            label="Collection"
            onChange={handleCollectionChange}
            disabled={loading}
          >
            {loading ? (
              <MenuItem disabled>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                Loading collections...
              </MenuItem>
            ) : error ? (
              <MenuItem disabled>Error loading collections</MenuItem>
            ) : (
              collections.map((collection) => (
                <MenuItem 
                  key={`${collection.contract_address}-${collection.name}`} 
                  value={collection.contract_address}
                >
                  {collection.name}
                </MenuItem>
              ))
            )}
          </Select>
        </FormControl>

        {/* Loan Amount Input */}
        <TextField
          fullWidth
          label="Loan Amount"
          type="text"
          value={loanAmountInput}
          onChange={(e) => handleLoanAmountChange(e.target.value)}
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
            value={userOffer.duration ? (userOffer.duration * 86400).toString() : 'all'}
            label="Duration"
            onChange={handleDurationDropdownChange}
          >
            <MenuItem value="all">All Durations</MenuItem>
            <MenuItem value="2592000">30 Days</MenuItem>
            <MenuItem value="5184000">60 Days</MenuItem>
            <MenuItem value="7776000">90 Days</MenuItem>
          </Select>
        </FormControl>

        {/* Interest Rate Input */}
        <TextField
          fullWidth
          label="Interest Rate"
          type="text"
          value={interestRateInput}
          onChange={(e) => {
            setInterestRateInput(e.target.value);
            const numValue = Number(e.target.value.replace(/[^0-9.]/g, ''));
            if (!isNaN(numValue)) {
              onUserOfferChange({ interestRate: numValue });
            } else {
              onUserOfferChange({ interestRate: undefined });
            }
          }}
          InputProps={{
            endAdornment: <Typography variant="body2">%</Typography>,
          }}
        />

        {/* Show Contours Switch */}
        {onShowContoursChange && (
          <FormControlLabel
            control={
              <Switch
                checked={showContours}
                onChange={(e) => onShowContoursChange(e.target.checked)}
              />
            }
            label="Show Loan Depth"
          />
        )}
      </Box>
    </Paper>
  );
};

export default InputControls; 