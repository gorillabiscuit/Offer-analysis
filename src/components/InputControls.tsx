import React from 'react';
import { 
  Box, 
  Typography, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  SelectChangeEvent,
  CircularProgress
} from '@mui/material';
import { formatCurrency, formatPercentageAxis } from '../utils/formatting';
import { LoanOffer } from '../types';
import { useCollections } from '../hooks/useCollections';

interface InputControlsProps {
  onUserOfferChange: (userOffer: Partial<LoanOffer>) => void;
  userOffer: Partial<LoanOffer>;
  selectedCurrency: 'WETH' | 'USDC';
}

const InputControls: React.FC<InputControlsProps> = ({ 
  onUserOfferChange,
  userOffer,
  selectedCurrency,
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

  // Filter out unwanted collections by name or slug
  const filteredCollections = collections.filter(
    (c) => {
      const name = c.name.toLowerCase();
      const slug = c.slug?.toLowerCase?.() || '';
      // Exclude 'cryptopunks', 'cryptopunks 721' (but NOT wrapped cryptopunks), and 'art blocks curated'
      if (
        name === 'cryptopunks' ||
        slug === 'cryptopunks' ||
        name === 'cryptopunks 721' ||
        slug === 'cryptopunks-721' ||
        name === 'art blocks curated' ||
        slug === 'art-blocks-curated'
      ) {
        // Allow wrapped cryptopunks (e.g., "CryptoPunks V1 (wrapped)")
        if (name.includes('wrapped')) return true;
        return false;
      }
      return true;
    }
  );

  React.useEffect(() => {
    if (loading || filteredCollections.length === 0) return;
    const hasValidSelection = filteredCollections.some(
      (collection) => collection.contract_address === userOffer.collectionAddress
    );
    if (!hasValidSelection) {
      const firstCollection = filteredCollections[0];
      onUserOfferChange({
        collection: firstCollection.name,
        collectionAddress: firstCollection.contract_address,
      });
    }
  }, [loading, filteredCollections, userOffer.collectionAddress, onUserOfferChange]);

  // Handlers for controlled fields
  const handleCollectionChange = (event: SelectChangeEvent) => {
    const value = event.target.value;
    const selectedCollection = filteredCollections.find(c => c.contract_address === value);
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
    <Box
      sx={{ 
        p: 3, 
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        color: (theme) => theme.palette.text.primary,
        boxSizing: 'border-box',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h6" sx={{ mb: 0 }}>
          Your Offer
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: '1fr',
          '@media (max-width:900px)': {
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 2,
          },
          '& .MuiFormControl-root, & .MuiTextField-root': {
            minWidth: 0,
          },
        }}
      >
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
              filteredCollections.map((collection) => (
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
            <MenuItem value="604800">7 Days or Less</MenuItem>
            <MenuItem value="1209600">14 Days or Less</MenuItem>
            <MenuItem value="2592000">30 Days or Less</MenuItem>
            <MenuItem value="5184000">60 Days or Less</MenuItem>
            <MenuItem value="7776000">90 Days or Less</MenuItem>
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

      </Box>
    </Box>
  );
};

export default InputControls; 