import React from 'react';
import { Container, Grid, Box, CircularProgress } from '@mui/material';
import InputControls from './components/InputControls';
import ScatterPlot from './components/ScatterPlot';
import { useLoanOffers } from './hooks/useLoanOffers';
import { useUserOffer } from './hooks/useUserOffer';

function App() {
  const { loanOffers, collections, loading, error, selectedCurrency, setSelectedCurrency } = useLoanOffers();
  const { userOffer, updateUserOffer } = useUserOffer();

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <InputControls
              collections={collections}
              onUserOfferChange={updateUserOffer}
              initialValues={userOffer}
            />
          </Grid>
          <Grid item xs={12} md={8}>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <CircularProgress />
              </Box>
            ) : error ? (
              <Box sx={{ color: 'error.main', p: 2 }}>{error}</Box>
            ) : (
              <ScatterPlot
                data={loanOffers}
                userOffer={userOffer}
                selectedCurrency={selectedCurrency}
                onCurrencyChange={setSelectedCurrency}
              />
            )}
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}

export default App; 