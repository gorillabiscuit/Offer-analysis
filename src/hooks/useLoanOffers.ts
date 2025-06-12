import { useState, useEffect } from 'react';
import { LoanOffer, HeatmapCell } from '../types';
import * as d3 from 'd3';

const MARKET_OFFERS_TOKEN = 'p.eyJ1IjogImQzNzk4ZmNmLWIyYmUtNDk2MS04NzNiLWViYWJiM2ZhOGVmNyIsICJpZCI6ICJiYjQ2MGNjZC1jZWZkLTRmNmUtOTRhYS0zMDA1NDBjMTFmNTQiLCAiaG9zdCI6ICJ1c19lYXN0In0.0h_OPHPaO7PRIxbuwTHTI31ixLEssoEwWRhesdWbkBk';
const GONDI_OFFERS_TOKEN = 'p.eyJ1IjogImQzNzk4ZmNmLWIyYmUtNDk2MS04NzNiLWViYWJiM2ZhOGVmNyIsICJpZCI6ICJhMDg1MWQ4NC1iYmQ1LTQ3MDgtYjNkMS00Zjg5MTNlODIyZWUiLCAiaG9zdCI6ICJ1c19lYXN0In0.XOrSozxbRVrI1p2bgC9ZM8xyv_2D6MURCuZtzLhgBHY';
const COLLECTION_ADDRESS = '0xb7f7f6c52f2e2fdb1963eab30438024864c313f6';

export type Currency = 'WETH' | 'USDC';

// Helper to normalize a Gondi offer
function normalizeGondiOffer(offer: any): LoanOffer & { createdAt: string; timestamp: number } {
  const createdAt = offer.createddate;
  const timestamp = Date.parse(createdAt);
  if (isNaN(timestamp)) {
    console.warn('Gondi offer has unparseable createddate:', offer);
    throw new Error('Gondi offer missing or invalid createddate');
  }
  const decimals = offer.currency_decimals ?? (offer.currency_symbol === 'WETH' ? 18 : 6);
  const loanAmount = offer.principalamount / Math.pow(10, decimals);
  const fxRateToUSD = offer.fxRateToUSD ?? (offer.currency_symbol === 'USDC' ? 1 : 0);
  return {
    id: offer.id,
    loanAmount,
    interestRate: offer.aprbps / 100,
    duration: offer.duration / 86400,
    collection: offer.collectionname,
    lender: (offer.lenderaddress || '').toLowerCase(),
    currency: offer.currency_symbol,
    currencySymbol: offer.currency_symbol,
    fxRateToUSD,
    loanPrincipalUSD: offer.currency_symbol === 'WETH' ? loanAmount * fxRateToUSD : loanAmount,
    createdAt,
    timestamp,
  };
}

// Helper to normalize a Market offer
function normalizeMarketOffer(offer: any): LoanOffer & { createdAt: string; timestamp: number } {
  const createdAt = offer.offerDate;
  const timestamp = Date.parse(createdAt);
  if (isNaN(timestamp)) {
    console.warn('Market offer has unparseable offerDate:', offer);
    throw new Error('Market offer missing or invalid offerDate');
  }
  const fxRateToUSD = offer.fxRateToUSD ?? (offer.currencySymbol === 'USDC' ? 1 : 0);
  const loanAmount = offer.loanPrincipalCanonicalAmount;
  return {
    id: offer._id,
    loanAmount,
    interestRate: offer.eAPR ?? offer.apr,
    duration: offer.loanDuration / 86400,
    collection: offer.collectionName,
    lender: (offer.lender || '').toLowerCase(),
    currency: offer.currencySymbol,
    currencySymbol: offer.currencySymbol,
    fxRateToUSD,
    loanPrincipalUSD: offer.currencySymbol === 'WETH' ? loanAmount * fxRateToUSD : loanAmount,
    createdAt,
    timestamp,
  };
}

export const useLoanOffers = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<'WETH' | 'USDC'>('WETH');
  const [allLoanOffers, setAllLoanOffers] = useState<LoanOffer[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [allMarketOffers, setAllMarketOffers] = useState<any[]>([]);
  const [allGondiOffers, setAllGondiOffers] = useState<any[]>([]);

  // Fetch both APIs once on mount
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [marketRes, gondiRes] = await Promise.all([
          fetch(`https://api.us-east.tinybird.co/v0/pipes/market_offers_pipe.json?token=${MARKET_OFFERS_TOKEN}&collection_address=${COLLECTION_ADDRESS}`),
          fetch(`https://api.us-east.tinybird.co/v0/pipes/gondi_offers_pipe.json?token=${GONDI_OFFERS_TOKEN}&limit=1000`)
        ]);
        if (!marketRes.ok || !gondiRes.ok) throw new Error('Failed to fetch offers');
        const [marketData, gondiData] = await Promise.all([marketRes.json(), gondiRes.json()]);

        // Prepare market offers for charting
        const marketOffers: any[] = (marketData.data || []);
        const marketOffersForChart = marketOffers.map(normalizeMarketOffer);
        setAllMarketOffers(marketOffersForChart);

        // Prepare Gondi offers for heatmap
        setAllGondiOffers(gondiData.data || []);

        // Derive collections from the data
        const uniqueCollections: string[] = Array.from(new Set(marketOffersForChart
          .map((offer: LoanOffer) => offer.collection)
          .filter((c: string | undefined): c is string => typeof c === 'string' && c.length > 0)));
        setCollections(uniqueCollections);
        setError(null);
      } catch (err) {
        console.error('Error fetching loan offers:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter and compute chart/heatmap data in-memory on currency toggle
  useEffect(() => {
    // Filter market offers for selected currency
    const filtered = allMarketOffers.filter((offer: LoanOffer & { currencySymbol?: string }) =>
      offer.currency === selectedCurrency || offer.currencySymbol === selectedCurrency
    );

    // Compute loan depth for each offer (plain JS)
    const depthMap: Record<string, number> = {};
    filtered.forEach(o => {
      const key = [o.loanAmount, o.interestRate, o.duration, o.currency].join('|');
      depthMap[key] = (depthMap[key] || 0) + 1;
    });
    const offersWithDepth = filtered.map(o => ({
      ...o,
      depth: depthMap[[o.loanAmount, o.interestRate, o.duration, o.currency].join('|')]
    }));
    setAllLoanOffers(offersWithDepth);

    // Normalize Gondi offers for the heatmap
    const gondiOffersNorm = allGondiOffers.map(normalizeGondiOffer);
    const offersForHeatmap = gondiOffersNorm.filter((o: LoanOffer) => o.currency === selectedCurrency);

    // Square grid: use same number of bins for x and y
    const numBins = 20;
    const xExtentRaw = d3.extent(offersForHeatmap, (o: LoanOffer) => o.loanAmount);
    const yExtentRaw = d3.extent(offersForHeatmap, (o: LoanOffer) => o.interestRate);
    const xExtent: [number, number] = [
      typeof xExtentRaw[0] === 'number' ? xExtentRaw[0] : 0,
      typeof xExtentRaw[1] === 'number' ? xExtentRaw[1] : 1
    ];
    const yExtent: [number, number] = [
      typeof yExtentRaw[0] === 'number' ? yExtentRaw[0] : 0,
      typeof yExtentRaw[1] === 'number' ? yExtentRaw[1] : 1
    ];
    const xScale = d3.scaleLinear().domain(xExtent).nice().range([0, numBins]);
    const yScale = d3.scaleLinear().domain(yExtent).nice().range([0, numBins]);

    // Bin offers
    const bins: HeatmapCell[][] = Array.from({ length: numBins }, () =>
      Array.from({ length: numBins }, () => ({ count: 0, xBin: 0, yBin: 0, x0: 0, x1: 0, y0: 0, y1: 0 }))
    );
    offersForHeatmap.forEach((o: LoanOffer) => {
      const xBin = Math.min(numBins - 1, Math.max(0, Math.floor(xScale(o.loanAmount))));
      const yBin = Math.min(numBins - 1, Math.max(0, Math.floor(yScale(o.interestRate))));
      bins[xBin][yBin].count += 1;
      bins[xBin][yBin].xBin = xBin;
      bins[xBin][yBin].yBin = yBin;
    });
    // Set bin bounds
    for (let i = 0; i < numBins; i++) {
      for (let j = 0; j < numBins; j++) {
        bins[i][j].x0 = xScale.invert(i);
        bins[i][j].x1 = xScale.invert(i + 1);
        bins[i][j].y0 = yScale.invert(j);
        bins[i][j].y1 = yScale.invert(j + 1);
      }
    }
    // Flatten and filter empty
    const flatHeatmap = bins.flat().filter((cell: HeatmapCell) => cell.count > 0);
    setHeatmap(flatHeatmap);
  }, [allMarketOffers, allGondiOffers, selectedCurrency]);

  console.log('Returning from useLoanOffers:', {
    loanOffers: allLoanOffers.length,
    allLoanOffers: allMarketOffers.length,
    collections: collections.length,
    loading,
    error,
    selectedCurrency,
    heatmap: heatmap.length
  });

  return {
    loanOffers: allLoanOffers,
    allLoanOffers: allMarketOffers,
    collections,
    loading,
    error,
    selectedCurrency,
    setSelectedCurrency,
    heatmap
  };
}; 