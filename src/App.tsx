import React, { useState, useCallback, useEffect, useRef } from 'react';
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
  const { loanOffers: currencyOffers, collections, loading, error, selectedCurrency, setSelectedCurrency, allLoanOffers, heatmap } = useLoanOffers();
  const { userOffer, updateUserOffer } = useUserOffer();
  const [domain, setDomain] = useState(() => getInitialDomain(currencyOffers, userOffer));
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showContours, setShowContours] = useState(true);

  // --- Continuous domain expansion state ---
  const dragActiveRef = useRef(false);
  const dragPosRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const expandIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Only initialize user offer once, after offers are loaded and stable
  const hasInitializedUserOffer = React.useRef(false);
  useEffect(() => {
    if (!hasInitializedUserOffer.current && !loading && currencyOffers.length > 0) {
      const { medianLoanAmount, medianInterestRate } = getMarketMedians(currencyOffers);
      updateUserOffer({ loanAmount: medianLoanAmount, interestRate: medianInterestRate });
      hasInitializedUserOffer.current = true;
    }
  }, [loading, currencyOffers, updateUserOffer]);

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
      // On drag end: round values before updating state
      updateUserOffer({
        loanAmount: roundETH(Math.max(0, update.loanAmount)),
        interestRate: roundPercentage(Math.max(0, update.interestRate)),
      });
      // Clear drag state and stop interval
      dragActiveRef.current = false;
      dragPosRef.current = null;
      stopExpandInterval();
    }
  };

  // Reset domain if data changes significantly (optional, for robustness)
  React.useEffect(() => {
    setDomain(getInitialDomain(currencyOffers, userOffer));
  }, [currencyOffers, userOffer]);

  // Filter offers by selected duration
  const filteredOffers =
    userOffer.duration === undefined
      ? currencyOffers
      : currencyOffers.filter(offer => Number(offer.duration) === Number(userOffer.duration));

  // Intercept currency change to convert user offer amount
  const handleCurrencyChange = useCallback((newCurrency: 'WETH' | 'USDC') => {
    if (selectedCurrency === newCurrency) return;
    // Use allLoanOffers (unfiltered) for conversion
    console.log('[CurrencyToggle] selectedCurrency:', selectedCurrency, 'newCurrency:', newCurrency);
    console.log('[CurrencyToggle] userOffer.loanAmount before:', userOffer.loanAmount);
    console.log('[CurrencyToggle] allLoanOffers.length:', allLoanOffers?.length);
    
    const rate = getMedianEthUsdcRate(allLoanOffers || []);
    console.log('[CurrencyToggle] Calculated median ETH/USD rate:', rate);
    
    let newAmount = userOffer.loanAmount;
    if (rate) {
      if (selectedCurrency === 'WETH' && newCurrency === 'USDC') {
        // ETH to USDC: multiply by rate (USD per ETH)
        newAmount = userOffer.loanAmount * rate;
        console.log('[CurrencyToggle] Converting WETH to USDC:', {
          originalAmount: userOffer.loanAmount,
          rate,
          newAmount
        });
      } else if (selectedCurrency === 'USDC' && newCurrency === 'WETH') {
        // USDC to ETH: divide by rate (USD per ETH)
        newAmount = userOffer.loanAmount / rate;
        console.log('[CurrencyToggle] Converting USDC to WETH:', {
          originalAmount: userOffer.loanAmount,
          rate,
          newAmount
        });
      }
    }
    console.log('[CurrencyToggle] Final converted amount:', newAmount);
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
              collections={collections}
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