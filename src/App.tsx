import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, CircularProgress, ThemeProvider } from '@mui/material';
import InputControls from './components/InputControls';
import ScatterPlot from './components/ScatterPlot';
import { useLoanOffers } from './hooks/useLoanOffers';
import { useUserOffer, UserOfferState } from './hooks/useUserOffer';
import { LoanOffer } from './types';
import { roundETH, roundPercentage } from './utils/formatting';
import { getMarketMedians, getMedianEthUsdcRate } from './utils/median';
import styles from './components/ChartLayout.module.css';
import darkTheme from './styles/theme';

// === Domain Expansion Tuning Parameters ===
/**
 * Number of pixels (in chart space) to expand the domain by per step.
 * Lower values = smoother, less aggressive expansion.
 * Typical range: 5-20.
 */
const PIXEL_INCREMENT = 1;

/**
 * Fraction of chart width/height from the edge at which expansion triggers.
 * Lower values = only expand when bubble is very close to the edge.
 * Example: 0.02 = 2% from the edge.
 */
const EDGE_THRESHOLD = 0.01;

/**
 * Minimum time (ms) between domain expansions while dragging at the edge.
 * Higher values = slower expansion, lower CPU usage.
 */
const EXPAND_THROTTLE_MS = 1;
// === End Domain Expansion Tuning Parameters ===

// Move getInitialDomain outside the component to avoid dependency issues
function getInitialDomain(offers: LoanOffer[], userOffer: UserOfferState) {
  // Only calculate domain if we have data
  if (offers.length === 0 && !userOffer) {
    return {
      x: [0, 1] as [number, number],
      y: [0, 5] as [number, number]
    };
  }

  const allLoanAmounts = [...offers.map(o => o.loanAmount), userOffer?.loanAmount ?? 0];
  const allInterestRates = [...offers.map(o => o.interestRate), userOffer?.interestRate ?? 0];
  
  const minLoan = Math.min(...allLoanAmounts);
  const maxLoan = Math.max(...allLoanAmounts);
  const minRate = Math.min(...allInterestRates);
  const maxRate = Math.max(...allInterestRates);
  
  const loanRange = maxLoan - minLoan;
  let rateRange = maxRate - minRate;

  // Add a small buffer if all APRs are identical
  let yMin = minRate;
  let yMax = maxRate;
  if (minRate === maxRate) {
    yMin = minRate - 1;
    yMax = maxRate + 1;
    rateRange = yMax - yMin;
  }

  // Add a minimum range to prevent too tight domains
  const minLoanRange = Math.max(loanRange, 0.1);
  const minRateRange = Math.max(rateRange, 2);

  const domain = {
    x: [Math.max(0, minLoan - minLoanRange * 0.1), maxLoan + minLoanRange * 0.1] as [number, number],
    y: [Math.max(0, yMin - minRateRange * 0.1), yMax + minRateRange * 0.1] as [number, number],
  };
  
  return domain;
}

function App() {
  const { userOffer, updateUserOffer, initializeWithMedianValues } = useUserOffer();
  const { loanOffers: currencyOffers, loading, error, selectedCurrency, setSelectedCurrency, allLoanOffers } = useLoanOffers(userOffer.collectionAddress);
  
  // Memoize the initial domain calculation
  const initialDomain = useMemo(() => 
    getInitialDomain(currencyOffers, userOffer),
    [currencyOffers, userOffer]
  );
  
  const [domain, setDomain] = useState(initialDomain);
  
  // Update domain only when data changes significantly
  useEffect(() => {
    const newDomain = getInitialDomain(currencyOffers, userOffer);
    // Only update if the change is significant
    const isSignificantChange = 
      Math.abs(newDomain.x[0] - domain.x[0]) > domain.x[1] * 0.1 ||
      Math.abs(newDomain.x[1] - domain.x[1]) > domain.x[1] * 0.1 ||
      Math.abs(newDomain.y[0] - domain.y[0]) > domain.y[1] * 0.1 ||
      Math.abs(newDomain.y[1] - domain.y[1]) > domain.y[1] * 0.1;
    
    if (isSignificantChange) {
      setDomain(newDomain);
    }
  }, [currencyOffers, userOffer]);

  const [showContours, setShowContours] = useState(true);

  // Memoize filteredOffers to prevent runaway renders
  const filteredOffers = useMemo(() => {
    const filtered = (userOffer.duration === undefined
      ? currencyOffers
      : currencyOffers.filter(offer => Number(offer.duration) === Number(userOffer.duration))
    ).filter(offer => offer.id);
    
    console.log('[filteredOffers] Collection:', userOffer.collectionAddress);
    console.log('[filteredOffers] Number of offers:', filtered.length);
    console.log('[filteredOffers] Sample offer:', filtered[0]);
    
    return filtered;
  }, [currencyOffers, userOffer.duration, userOffer.collectionAddress]);

  // Debug: Log filtered offers
  useEffect(() => {
    if (filteredOffers.length > 0) {
      const amounts = filteredOffers.map(o => o.loanAmount);
      const rates = filteredOffers.map(o => o.interestRate);
      console.log('[App] Filtered offers for chart:', {
        count: filteredOffers.length,
        amounts,
        rates,
        collection: userOffer.collectionAddress
      });
    }
  }, [filteredOffers, userOffer.collectionAddress]);

  // --- Centralized filtering logic ---
  // 1. Filter by duration (if set)
  // 2. Filter out offers without IDs
  const filteredOffersForChart = (userOffer.duration === undefined
    ? currencyOffers
    : currencyOffers.filter(offer => Number(offer.duration) === Number(userOffer.duration))
  ).filter(offer => offer.id);

  // --- Continuous domain expansion state ---
  const dragActiveRef = useRef(false);
  const dragPosRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const expandIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize user offer with median values when collection changes or when offers are first loaded
  useEffect(() => {
    if (!loading && filteredOffers.length > 0) {
      // Preserve the current collection address when initializing with median values
      const currentCollectionAddress = userOffer.collectionAddress;
      initializeWithMedianValues(filteredOffers);
      if (currentCollectionAddress) {
        updateUserOffer({ collectionAddress: currentCollectionAddress });
      }
    }
  }, [loading, filteredOffers, initializeWithMedianValues, userOffer.collectionAddress, updateUserOffer]);

  // Add a constant for the expansion percentage
  const DOMAIN_EXPAND_PERCENT = 0.01; // 1%

  // --- Helper: Edge detection and expansion ---
  const checkAndExpandDomain = useCallback(() => {
    if (!dragActiveRef.current || !dragPosRef.current) return;
    const { x, y, width, height } = dragPosRef.current;
    setDomain(prev => {
      let [xMin, xMax] = prev.x;
      let [yMin, yMax] = prev.y;
      const xRange = xMax - xMin;
      const yRange = yMax - yMin;
      let changed = false;
      // Calculate data increment for x and y axes
      const xDataPerPixel = xRange / (width || 1);
      const yDataPerPixel = yRange / (height || 1);
      const xIncrement = xDataPerPixel * PIXEL_INCREMENT;
      const yIncrement = yDataPerPixel * PIXEL_INCREMENT;
      // Expand right
      if (x >= width * (1 - EDGE_THRESHOLD)) {
        xMax += xIncrement;
        changed = true;
      }
      // Expand left
      if (x <= width * EDGE_THRESHOLD) {
        xMin = Math.max(0, xMin - xIncrement);
        changed = true;
      }
      // Expand top
      if (y <= height * EDGE_THRESHOLD) {
        yMax += yIncrement;
        changed = true;
      }
      // Expand bottom
      if (y >= height * (1 - EDGE_THRESHOLD)) {
        yMin = Math.max(0, yMin - yIncrement);
        changed = true;
      }
      if (changed) {
        // Maintain minimum range
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

  // --- Start/stop interval for continuous expansion ---
  const startExpandInterval = useCallback(() => {
    if (expandIntervalRef.current) return;
    expandIntervalRef.current = setInterval(checkAndExpandDomain, 60); // 60ms interval
  }, [checkAndExpandDomain]);

  const stopExpandInterval = useCallback(() => {
    if (expandIntervalRef.current) {
      clearInterval(expandIntervalRef.current);
      expandIntervalRef.current = null;
    }
  }, []);

  // --- Modified drag handler ---
  const handleUserOfferDrag = (update: { loanAmount: number; interestRate: number, dragX?: number, dragY?: number, width?: number, height?: number, dragging?: boolean }) => {
    if (update.dragging && update.dragX !== undefined && update.dragY !== undefined && update.width !== undefined && update.height !== undefined) {
      // During drag: update user offer state with live, unrounded value for real-time feedback
      updateUserOffer({
        loanAmount: Math.max(0, update.loanAmount),
        interestRate: Math.max(0, update.interestRate),
      });
      // Store drag state for interval
      dragActiveRef.current = true;
      dragPosRef.current = { x: update.dragX, y: update.dragY, width: update.width, height: update.height };
      startExpandInterval();
    } else {
      // On drag end: store full-precision values (do not round)
      updateUserOffer({
        loanAmount: Math.max(0, update.loanAmount),
        interestRate: Math.max(0, update.interestRate),
      });
      // Clear drag state and stop interval
      dragActiveRef.current = false;
      dragPosRef.current = null;
      stopExpandInterval();
    }
  };

  // Intercept currency change to convert user offer amount
  const handleCurrencyChange = useCallback((newCurrency: 'WETH' | 'USDC') => {
    if (selectedCurrency === newCurrency) return;
    // Use allLoanOffers (unfiltered) for conversion
    
    const rate = getMedianEthUsdcRate(allLoanOffers || []);
    
    let newAmount = userOffer.loanAmount;
    if (rate) {
      if (selectedCurrency === 'WETH' && newCurrency === 'USDC') {
        // ETH to USDC: multiply by rate (USD per ETH)
        newAmount = userOffer.loanAmount * rate;
      
      } else if (selectedCurrency === 'USDC' && newCurrency === 'WETH') {
        // USDC to ETH: divide by rate (USD per ETH)
        newAmount = userOffer.loanAmount / rate;

      }
    }
    updateUserOffer({ loanAmount: newAmount });
    setSelectedCurrency(newCurrency);
  }, [selectedCurrency, allLoanOffers, userOffer.loanAmount, setSelectedCurrency, updateUserOffer]);

  // --- Cleanup interval on unmount ---
  useEffect(() => {
    return () => {
      stopExpandInterval();
    };
  }, [stopExpandInterval]);

  return (
    <ThemeProvider theme={darkTheme}>
      <div className={styles.mainContainer}>
        <div className={styles.menuDesktop}>
          <div className={styles.leftPanel}>
            <InputControls
              onUserOfferChange={updateUserOffer}
              userOffer={userOffer}
              selectedCurrency={selectedCurrency}
              showContours={showContours}
              onShowContoursChange={setShowContours}
            />
          </div>
          <div className={styles.chartArea}>
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
                onCurrencyChange={handleCurrencyChange}
                onUserOfferDrag={handleUserOfferDrag}
                domain={domain}
                showContours={showContours}
              />
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App; 