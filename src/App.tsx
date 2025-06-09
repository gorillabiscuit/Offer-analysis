import React, { useState, useCallback } from 'react';
import { Container, Grid, Box, CircularProgress } from '@mui/material';
import InputControls from './components/InputControls';
import ScatterPlot from './components/ScatterPlot';
import { useLoanOffers } from './hooks/useLoanOffers';
import { useUserOffer, UserOfferState } from './hooks/useUserOffer';
import { LoanOffer } from './types';

// Move getInitialDomain outside the component to avoid dependency issues
function getInitialDomain(offers: LoanOffer[], userOffer: UserOfferState) {
  const allLoanAmounts = [...offers.map(o => o.loanAmount), userOffer?.loanAmount ?? 0];
  const allInterestRates = [...offers.map(o => o.interestRate), userOffer?.interestRate ?? 0];
  const minLoan = Math.min(...allLoanAmounts);
  const maxLoan = Math.max(...allLoanAmounts);
  const minRate = Math.min(...allInterestRates);
  const maxRate = Math.max(...allInterestRates);
  const loanRange = maxLoan - minLoan;
  const rateRange = maxRate - minRate;
  return {
    x: [Math.max(0, minLoan - loanRange * 0.1), maxLoan + loanRange * 0.1] as [number, number],
    y: [Math.max(0, minRate - rateRange * 0.1), maxRate + rateRange * 0.1] as [number, number],
  };
}

function App() {
  const { loanOffers, collections, loading, error, selectedCurrency, setSelectedCurrency } = useLoanOffers();
  const { userOffer, updateUserOffer } = useUserOffer();

  const [domain, setDomain] = useState(() => getInitialDomain(loanOffers, userOffer));

  // Expand domain if user offer is in buffer zone
  const expandDomainIfNeeded = useCallback((loanAmount: number, interestRate: number) => {
    setDomain(prev => {
      let [xMin, xMax] = prev.x;
      let [yMin, yMax] = prev.y;
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      let changed = false;
      // Expand right
      if (loanAmount > xMax - xRange * 0.1) {
        xMax += xRange * 0.05;
        changed = true;
      }
      // Expand left
      if (loanAmount < xMin + xRange * 0.1) {
        xMin = Math.max(0, xMin - xRange * 0.05);
        changed = true;
      }
      // Expand top
      if (interestRate > yMax - yRange * 0.1) {
        yMax += yRange * 0.05;
        changed = true;
      }
      // Expand bottom
      if (interestRate < yMin + yRange * 0.1) {
        yMin = Math.max(0, yMin - yRange * 0.05);
        changed = true;
      }
      if (changed) return { x: [xMin, xMax] as [number, number], y: [yMin, yMax] as [number, number] };
      return prev;
    });
  }, []);

  // Callback for dragging the user offer point
  const handleUserOfferDrag = (update: { loanAmount: number; interestRate: number }) => {
    updateUserOffer({
      loanAmount: Math.max(0, update.loanAmount),
      interestRate: Math.max(0, update.interestRate),
    });
    expandDomainIfNeeded(update.loanAmount, update.interestRate);
  };

  // Reset domain if data changes significantly (optional, for robustness)
  React.useEffect(() => {
    setDomain(getInitialDomain(loanOffers, userOffer));
  }, [loanOffers, userOffer]);

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
                onUserOfferDrag={handleUserOfferDrag}
                domain={domain}
              />
            )}
          </Grid>
        </Grid>
      </Box>
    </Container>
  );
}

export default App; 