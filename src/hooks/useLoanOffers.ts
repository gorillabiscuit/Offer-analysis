import { useState, useEffect } from 'react';
import { LoanOffer, HeatmapCell } from '../types';
import { Currency, deriveChartData, loadLoanData } from '../vanilla/services/data';

export type { Currency };

export const useLoanOffers = (collectionAddress?: string) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<'WETH' | 'USDC'>('WETH');
  const [allLoanOffers, setAllLoanOffers] = useState<LoanOffer[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [allMarketOffers, setAllMarketOffers] = useState<any[]>([]);
  const [allGondiOffers, setAllGondiOffers] = useState<any[]>([]);

  // Fetch both APIs once on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!collectionAddress) {
        setAllMarketOffers([]);
        setAllGondiOffers([]);
        setAllLoanOffers([]);
        setHeatmap([]);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const loadedData = await loadLoanData(collectionAddress);
        setAllMarketOffers(loadedData.marketOffers);
        setAllGondiOffers(loadedData.gondiOffersRaw);

        setError(null);
        if (loadedData.usedStaticFallback) {
          console.info('Using static snapshot data from /public/static.');
        }
      } catch (err) {
        console.error('Error fetching loan offers:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [collectionAddress]);

  // Filter and compute chart/heatmap data in-memory on currency toggle
  useEffect(() => {
    const derivedData = deriveChartData(allMarketOffers, allGondiOffers, selectedCurrency);
    setAllLoanOffers(derivedData.loanOffers);
    setHeatmap(derivedData.heatmap as HeatmapCell[]);
  }, [allMarketOffers, allGondiOffers, selectedCurrency]);

  return {
    loanOffers: allLoanOffers,
    allLoanOffers: allMarketOffers,
    loading,
    error,
    selectedCurrency,
    setSelectedCurrency,
    heatmap
  };
}; 