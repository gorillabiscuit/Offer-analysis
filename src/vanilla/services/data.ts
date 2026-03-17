import * as d3 from 'd3';
import { HeatmapCell, LoanOffer } from '../../types';

export type Currency = 'WETH' | 'USDC';

export interface Collection {
  name: string;
  slug: string;
  contract_address: string;
  aliases: string[];
  metadata?: Record<string, unknown>;
}

export interface LoanDataLoadResult {
  marketOffers: LoanOffer[];
  gondiOffersRaw: any[];
  usedStaticFallback: boolean;
}

const STATIC_MARKET_OFFERS_URL = '/static/market_offers.json';
const STATIC_GONDI_OFFERS_URL = '/static/gondi_offers.json';
const STATIC_COLLECTIONS_URL = '/static/collections.json';

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

function readRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function normalizeGondiOffer(offer: any): LoanOffer & { createdAt: string; timestamp: number } {
  const createdAt = offer.createddate;
  const timestamp = Date.parse(createdAt);
  if (isNaN(timestamp)) {
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

function normalizeMarketOffer(offer: any): LoanOffer & { createdAt: string; timestamp: number } {
  const createdAt = offer.offerDate;
  const timestamp = Date.parse(createdAt);
  if (isNaN(timestamp)) {
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
    collectionAddress: offer.collectionAddress ?? offer.collection_address ?? offer.nftAddress,
    lender: (offer.lender || '').toLowerCase(),
    currency: offer.currencySymbol,
    currencySymbol: offer.currencySymbol,
    fxRateToUSD,
    loanPrincipalUSD: offer.currencySymbol === 'WETH' ? loanAmount * fxRateToUSD : loanAmount,
    createdAt,
    timestamp,
  };
}

export async function loadCollections(): Promise<Collection[]> {
  // Demo mode: static-only collection source.
  return fetchJson(STATIC_COLLECTIONS_URL);
}

export async function loadLoanData(collectionAddress: string): Promise<LoanDataLoadResult> {
  // Demo mode: static-only loan sources.
  const [marketData, gondiData] = await Promise.all([
    fetchJson(STATIC_MARKET_OFFERS_URL),
    fetchJson(STATIC_GONDI_OFFERS_URL),
  ]);

  const marketOffersRaw = readRows(marketData);
  const gondiRows = readRows(gondiData);
  const gondiIds = new Set(
    gondiRows
      .map((row: any) => String(row.id ?? row._id ?? ''))
      .filter((id: string) => id.length > 0)
  );
  const normalizedMarketOffers = marketOffersRaw.map((row: any) => {
    const normalized = normalizeMarketOffer(row);
    const id = String(normalized.id ?? '');
    return {
      ...normalized,
      marketType: id && gondiIds.has(id) ? 'loan' as const : 'offer' as const,
    };
  });
  const normalizedCollectionAddress = collectionAddress.toLowerCase();

  const marketOffers = normalizedMarketOffers.filter((offer: LoanOffer) => {
    const offerAddress = offer.collectionAddress?.toLowerCase();
    return offerAddress === normalizedCollectionAddress;
  });

  return {
    marketOffers,
    gondiOffersRaw: gondiRows,
    usedStaticFallback: false,
  };
}

export function deriveChartData(
  allMarketOffers: LoanOffer[],
  allGondiOffersRaw: any[],
  selectedCurrency: Currency
): { loanOffers: LoanOffer[]; heatmap: HeatmapCell[] } {
  const filteredMarketOffers = allMarketOffers.filter(
    (offer: LoanOffer & { currencySymbol?: string }) =>
      offer.currency === selectedCurrency || offer.currencySymbol === selectedCurrency
  );

  const depthMap: Record<string, number> = {};
  filteredMarketOffers.forEach((offer) => {
    const key = [offer.loanAmount, offer.interestRate, offer.duration, offer.currency].join('|');
    depthMap[key] = (depthMap[key] || 0) + 1;
  });

  const loanOffers = filteredMarketOffers.map((offer) => ({
    ...offer,
    depth: depthMap[[offer.loanAmount, offer.interestRate, offer.duration, offer.currency].join('|')],
  }));

  const normalizedGondiOffers = allGondiOffersRaw.map(normalizeGondiOffer);
  const selectedCollections = new Set(
    allMarketOffers
      .map((offer: LoanOffer) => offer.collection)
      .filter((collection): collection is string => Boolean(collection))
  );

  const offersForHeatmap = normalizedGondiOffers.filter((offer: LoanOffer) => {
    const matchesCurrency = offer.currency === selectedCurrency;
    const matchesCollection =
      selectedCollections.size === 0 ||
      (offer.collection ? selectedCollections.has(offer.collection) : false);
    return matchesCurrency && matchesCollection;
  });

  const numBins = 20;
  const xExtentRaw = d3.extent(offersForHeatmap, (offer: LoanOffer) => offer.loanAmount);
  const yExtentRaw = d3.extent(offersForHeatmap, (offer: LoanOffer) => offer.interestRate);
  const xExtent: [number, number] = [
    typeof xExtentRaw[0] === 'number' ? xExtentRaw[0] : 0,
    typeof xExtentRaw[1] === 'number' ? xExtentRaw[1] : 1,
  ];
  const yExtent: [number, number] = [
    typeof yExtentRaw[0] === 'number' ? yExtentRaw[0] : 0,
    typeof yExtentRaw[1] === 'number' ? yExtentRaw[1] : 1,
  ];

  const xScale = d3.scaleLinear().domain(xExtent).nice().range([0, numBins]);
  const yScale = d3.scaleLinear().domain(yExtent).nice().range([0, numBins]);

  const bins: HeatmapCell[][] = Array.from({ length: numBins }, () =>
    Array.from({ length: numBins }, () => ({
      count: 0,
      xBin: 0,
      yBin: 0,
      x0: 0,
      x1: 0,
      y0: 0,
      y1: 0,
    }))
  );

  offersForHeatmap.forEach((offer: LoanOffer) => {
    const xBin = Math.min(numBins - 1, Math.max(0, Math.floor(xScale(offer.loanAmount))));
    const yBin = Math.min(numBins - 1, Math.max(0, Math.floor(yScale(offer.interestRate))));
    bins[xBin][yBin].count += 1;
    bins[xBin][yBin].xBin = xBin;
    bins[xBin][yBin].yBin = yBin;
  });

  for (let i = 0; i < numBins; i += 1) {
    for (let j = 0; j < numBins; j += 1) {
      bins[i][j].x0 = xScale.invert(i);
      bins[i][j].x1 = xScale.invert(i + 1);
      bins[i][j].y0 = yScale.invert(j);
      bins[i][j].y1 = yScale.invert(j + 1);
    }
  }

  const heatmap = bins.flat().filter((cell: HeatmapCell) => cell.count > 0);
  return { loanOffers, heatmap };
}
