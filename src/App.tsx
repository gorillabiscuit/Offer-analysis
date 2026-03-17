import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Box, CircularProgress, ThemeProvider } from '@mui/material';
import InputControls from './components/InputControls';
import ScatterPlot from './components/ScatterPlot';
import { useLoanOffers } from './hooks/useLoanOffers';
import { useUserOffer, UserOfferState } from './hooks/useUserOffer';
import { LoanOffer } from './types';
import { getMarketMedians, getMedianEthUsdcRate } from './utils/median';
import styles from './components/ChartLayout.module.css';
import { darkTheme, lightTheme } from './styles/theme';

type ThemeMode = 'system' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

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
const CHART_PADDING_RATIO = 0.15;

// === End Domain Expansion Tuning Parameters ===

// Move getInitialDomain outside the component to avoid dependency issues
// and keep baseline zoom stable while the user drags their own offer point.
function getInitialDomain(offers: LoanOffer[]) {
  // Only calculate domain if we have data
  if (offers.length === 0) {
    return {
      x: [0, 1] as [number, number],
      y: [0, 5] as [number, number]
    };
  }

  const allLoanAmounts = offers.map(o => o.loanAmount);
  const allInterestRates = offers.map(o => o.interestRate);
  
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

  // Convert desired visual padding to data-space padding.
  // If we want points inset by p on each side of the chart,
  // padding in data units must be: range * p / (1 - 2p).
  const toDataPadding = (range: number) => {
    const denominator = 1 - 2 * CHART_PADDING_RATIO;
    return denominator > 0 ? (range * CHART_PADDING_RATIO) / denominator : range;
  };
  const xPadding = toDataPadding(minLoanRange);
  const yPadding = toDataPadding(minRateRange);

  const domain = {
    x: [minLoan - xPadding, maxLoan + xPadding] as [number, number],
    y: [yMin - yPadding, yMax + yPadding] as [number, number],
  };
  
  return domain;
}

function domainsAreClose(
  a: { x: [number, number]; y: [number, number] },
  b: { x: [number, number]; y: [number, number] },
  epsilon = 1e-6
) {
  return (
    Math.abs(a.x[0] - b.x[0]) < epsilon &&
    Math.abs(a.x[1] - b.x[1]) < epsilon &&
    Math.abs(a.y[0] - b.y[0]) < epsilon &&
    Math.abs(a.y[1] - b.y[1]) < epsilon
  );
}

function getIqrBounds(values: number[]): { lower: number; upper: number } | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (p: number) => {
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  const q1 = quantile(0.25);
  const q3 = quantile(0.75);
  const iqr = q3 - q1;
  return {
    lower: q1 - 1.5 * iqr,
    upper: q3 + 1.5 * iqr,
  };
}

function parseThemeToken(rawValue: string | null | undefined): ResolvedTheme | null {
  if (!rawValue) return null;
  const value = rawValue.toLowerCase();
  if (value.includes('dark')) return 'dark';
  if (value.includes('light')) return 'light';
  return null;
}

function detectHostTheme(): ResolvedTheme | null {
  if (typeof document === 'undefined') return null;
  const targets = [document.documentElement, document.body].filter(
    (element): element is HTMLElement => Boolean(element)
  );
  for (const element of targets) {
    const attrTheme =
      parseThemeToken(element.getAttribute('data-theme')) ??
      parseThemeToken(element.getAttribute('data-color-mode')) ??
      parseThemeToken(element.getAttribute('color-scheme'));
    if (attrTheme) return attrTheme;

    for (const className of Array.from(element.classList)) {
      const classTheme = parseThemeToken(className);
      if (classTheme) return classTheme;
    }
  }
  return null;
}

function App() {
  const { userOffer, updateUserOffer } = useUserOffer();
  const { loanOffers: currencyOffers, loading, error, selectedCurrency, setSelectedCurrency, allLoanOffers } = useLoanOffers(userOffer.collectionAddress);

  useEffect(() => {
    if (selectedCurrency !== 'WETH') {
      setSelectedCurrency('WETH');
    }
  }, [selectedCurrency, setSelectedCurrency]);
  
  // Use exactly the same offer subset for plotting and domain calculations.
  const [excludeOutliers, setExcludeOutliers] = useState(false);
  const [showLoans, setShowLoans] = useState(true);
  const [showOffers, setShowOffers] = useState(true);

  const filteredOffers = useMemo(() => {
    const durationFiltered = (userOffer.duration === undefined
      ? currencyOffers
      : currencyOffers.filter((offer) => {
          if (offer.duration === undefined || offer.duration === null) return false;
          return Number(offer.duration) <= Number(userOffer.duration);
        })
    ).filter(offer => offer.id);

    if (!excludeOutliers || durationFiltered.length < 4) {
      return durationFiltered;
    }

    const amountBounds = getIqrBounds(durationFiltered.map((offer) => offer.loanAmount));
    const rateBounds = getIqrBounds(durationFiltered.map((offer) => offer.interestRate));
    if (!amountBounds || !rateBounds) {
      return durationFiltered;
    }

    return durationFiltered.filter((offer) => {
      const amountInRange =
        offer.loanAmount >= amountBounds.lower && offer.loanAmount <= amountBounds.upper;
      const rateInRange =
        offer.interestRate >= rateBounds.lower && offer.interestRate <= rateBounds.upper;
      return amountInRange && rateInRange;
    });
  }, [currencyOffers, userOffer.duration, userOffer.collectionAddress, excludeOutliers]);

  const displayedOffers = useMemo(
    () =>
      filteredOffers.filter((offer) => {
        const isLoan = offer.marketType === 'loan';
        return isLoan ? showLoans : showOffers;
      }),
    [filteredOffers, showLoans, showOffers]
  );

  // Baseline domain for reset zoom.
  const initialDomain = useMemo(() => 
    getInitialDomain(displayedOffers),
    [displayedOffers]
  );
  
  const [domain, setDomain] = useState(initialDomain);

  // Keep domain aligned with the active dataset baseline.
  useEffect(() => {
    setDomain(initialDomain);
  }, [initialDomain]);

  const showResetZoom = useMemo(
    () => !domainsAreClose(domain, initialDomain),
    [domain, initialDomain]
  );

  const [showContours, setShowContours] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [hostTheme, setHostTheme] = useState<ResolvedTheme | null>(() => detectHostTheme());
  const resolvedTheme = useMemo<ResolvedTheme>(() => {
    if (themeMode === 'system') {
      return hostTheme ?? systemTheme;
    }
    return themeMode;
  }, [themeMode, hostTheme, systemTheme]);
  const isLightMode = resolvedTheme === 'light';
  const appTheme = useMemo(() => (isLightMode ? lightTheme : darkTheme), [isLightMode]);

  const handleToggleLoans = useCallback(() => {
    setShowLoans((current) => {
      const next = !current;
      if (!next && !showOffers) {
        setShowOffers(true);
      }
      return next;
    });
  }, [showOffers]);

  const handleToggleOffers = useCallback(() => {
    setShowOffers((current) => {
      const next = !current;
      if (!next && !showLoans) {
        setShowLoans(true);
      }
      return next;
    });
  }, [showLoans]);

  const handleCycleThemeMode = useCallback(() => {
    setThemeMode((current) => (current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    const handleThemeMutation = () => setHostTheme(detectHostTheme());
    const observer = new MutationObserver(handleThemeMutation);
    const targets = [document.documentElement, document.body].filter(
      (element): element is HTMLElement => Boolean(element)
    );
    targets.forEach((target) =>
      observer.observe(target, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'data-color-mode', 'color-scheme'],
      })
    );
    handleThemeMutation();
    return () => observer.disconnect();
  }, []);

  const handleDomainChange = useCallback((nextDomain: { x: [number, number]; y: [number, number] }) => {
    setDomain(prev => (domainsAreClose(prev, nextDomain) ? prev : nextDomain));
  }, []);

  const handleResetZoom = useCallback(() => {
    setDomain(initialDomain);
  }, [initialDomain]);

  // --- Continuous domain expansion state ---
  const dragActiveRef = useRef(false);
  const dragPosRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const expandIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const initializedCollectionRef = useRef<string | null>(null);

  // Recenter "Your Offer" on collection switch using market medians
  // while preserving user-selected duration.
  useEffect(() => {
    const currentCollectionAddress = userOffer.collectionAddress ?? null;
    if (!currentCollectionAddress) {
      initializedCollectionRef.current = null;
      return;
    }

    if (
      !loading &&
      displayedOffers.length > 0 &&
      initializedCollectionRef.current !== currentCollectionAddress
    ) {
      const validOffers = displayedOffers.filter((offer) => offer.id);
      if (validOffers.length > 0) {
        const { medianLoanAmount, medianInterestRate } = getMarketMedians(validOffers);
        updateUserOffer({
          collectionAddress: currentCollectionAddress,
          loanAmount: medianLoanAmount,
          interestRate: medianInterestRate,
        });
      }
      initializedCollectionRef.current = currentCollectionAddress;
    }
  }, [loading, displayedOffers, userOffer.collectionAddress, updateUserOffer]);

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
      // During drag, avoid React state updates to keep interaction smooth.
      // The SVG bubble position is updated directly in D3 and we only commit
      // values to React state on drag end.
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
    <ThemeProvider theme={appTheme}>
      <div className={`${styles.mainContainer} ${isLightMode ? styles.mainContainerLight : ''}`}>
        <div className={styles.menuDesktop}>
          <div className={styles.leftPanel}>
            <InputControls
              onUserOfferChange={updateUserOffer}
              userOffer={userOffer}
              selectedCurrency={selectedCurrency}
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
                data={displayedOffers}
                userOffer={userOffer}
                selectedCurrency={selectedCurrency}
                onCurrencyChange={handleCurrencyChange}
                onUserOfferDrag={handleUserOfferDrag}
                domain={domain}
                baselineDomain={initialDomain}
                showContours={showContours}
                onShowContoursChange={setShowContours}
                showLoans={showLoans}
                showOffers={showOffers}
                onToggleLoans={handleToggleLoans}
                onToggleOffers={handleToggleOffers}
                onDomainChange={handleDomainChange}
                onResetZoom={handleResetZoom}
                showResetZoom={showResetZoom}
                excludeOutliers={excludeOutliers}
                onToggleExcludeOutliers={() => setExcludeOutliers((current) => !current)}
                isLightMode={isLightMode}
                themeMode={themeMode}
                onCycleThemeMode={handleCycleThemeMode}
              />
            )}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App; 