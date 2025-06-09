import React, { useState, useCallback, useEffect } from 'react';
import { Container, Grid, Box, CircularProgress } from '@mui/material';
import InputControls from './components/InputControls';
import ScatterPlot from './components/ScatterPlot';
import { useLoanOffers } from './hooks/useLoanOffers';
import { useUserOffer, UserOfferState } from './hooks/useUserOffer';
import { LoanOffer } from './types';
import { roundETH, roundPercentage } from './utils/formatting';

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
  const { userOffer, updateUserOffer, initializeWithMedianValues } = useUserOffer();

  const [domain, setDomain] = useState(() => getInitialDomain(loanOffers, userOffer));

  // Initialize user offer with median values when loan offers are loaded
  useEffect(() => {
    if (loanOffers.length > 0) {
      initializeWithMedianValues(loanOffers);
    }
  }, [loanOffers, initializeWithMedianValues]);

  // Add a constant for the expansion percentage
  const DOMAIN_EXPAND_PERCENT = 0.01; // 1%

  // Expand domain if user offer is in buffer zone or at edge
  const expandDomainIfNeeded = useCallback((loanAmount: number, interestRate: number, dragging = false, dragX?: number, dragY?: number, width?: number, height?: number) => {
    setDomain(prev => {
      let [xMin, xMax] = prev.x;
      let [yMin, yMax] = prev.y;
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      let changed = false;

      // During drag, expand more aggressively to prevent edge cases
      const expandPercent = dragging ? DOMAIN_EXPAND_PERCENT * 2 : DOMAIN_EXPAND_PERCENT;

      // Expand right
      if (dragging && width !== undefined && dragX !== undefined && dragX >= width * 0.95) {
        xMax += xRange * expandPercent;
        changed = true;
      } else if (loanAmount > xMax - xRange * 0.1) {
        xMax += xRange * expandPercent;
        changed = true;
      }
      // Expand left
      if (dragging && dragX !== undefined && width !== undefined && dragX <= width * 0.05) {
        xMin = Math.max(0, xMin - xRange * expandPercent);
        changed = true;
      } else if (loanAmount < xMin + xRange * 0.1) {
        xMin = Math.max(0, xMin - xRange * expandPercent);
        changed = true;
      }
      // Expand top
      if (dragging && height !== undefined && dragY !== undefined && dragY <= height * 0.05) {
        yMax += yRange * expandPercent;
        changed = true;
      } else if (interestRate > yMax - yRange * 0.1) {
        yMax += yRange * expandPercent;
        changed = true;
      }
      // Expand bottom
      if (dragging && height !== undefined && dragY !== undefined && dragY >= height * 0.95) {
        yMin = Math.max(0, yMin - yRange * expandPercent);
        changed = true;
      } else if (interestRate < yMin + yRange * 0.1) {
        yMin = Math.max(0, yMin - yRange * expandPercent);
        changed = true;
      }

      if (changed) {
        // Ensure we maintain a minimum range to prevent collapse
        const minXRange = xRange * 0.1;
        const minYRange = yRange * 0.1;
        if (xMax - xMin < minXRange) {
          const center = (xMax + xMin) / 2;
          xMin = center - minXRange / 2;
          xMax = center + minXRange / 2;
        }
        if (yMax - yMin < minYRange) {
          const center = (yMax + yMin) / 2;
          yMin = center - minYRange / 2;
          yMax = center + minYRange / 2;
        }
        return { x: [xMin, xMax] as [number, number], y: [yMin, yMax] as [number, number] };
      }
      return prev;
    });
  }, []);

  // Callback for dragging the user offer point
  const handleUserOfferDrag = (update: { loanAmount: number; interestRate: number, dragX?: number, dragY?: number, width?: number, height?: number, dragging?: boolean }) => {
    if (update.dragging && update.dragX !== undefined && update.dragY !== undefined && update.width !== undefined && update.height !== undefined) {
      // During drag: update user offer state with live, unrounded value for real-time feedback
      updateUserOffer({
        loanAmount: Math.max(0, update.loanAmount),
        interestRate: Math.max(0, update.interestRate),
      });
      expandDomainIfNeeded(update.loanAmount, update.interestRate, true, update.dragX, update.dragY, update.width, update.height);
    } else {
      // On drag end: round values before updating state
      updateUserOffer({
        loanAmount: roundETH(Math.max(0, update.loanAmount)),
        interestRate: roundPercentage(Math.max(0, update.interestRate)),
      });
      // Don't expand domain on drag end - let the ScatterPlot component handle it
    }
  };

  // Reset domain if data changes significantly (optional, for robustness)
  React.useEffect(() => {
    setDomain(getInitialDomain(loanOffers, userOffer));
  }, [loanOffers, userOffer]);

  // Filter offers by selected duration
  const filteredOffers = userOffer.duration
    ? loanOffers.filter(offer => offer.duration === userOffer.duration)
    : loanOffers;

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <InputControls
              collections={collections}
              onUserOfferChange={updateUserOffer}
              userOffer={userOffer}
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
                data={filteredOffers}
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