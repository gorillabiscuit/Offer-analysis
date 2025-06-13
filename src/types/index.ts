export interface LoanOffer {
  id?: string;
  loanAmount: number;
  interestRate: number;
  duration?: number;
  collection?: string;
  collectionAddress?: string;
  timestamp?: number;
  lender?: string;
  createdAt?: string;
  currency?: string;
  currencySymbol?: string;
  fxRateToUSD?: number;
  maximumRepayment?: number;
  loanPrincipalUSD?: number;
}

export interface Collection {
  id: string;
  name: string;
  symbol: string;
  floorPrice?: number;
}

export interface ScatterPlotData {
  x: number;
  y: number;
  size?: number;
  color?: string;
  label?: string;
}

export interface HeatmapCell {
  xBin: number;
  yBin: number;
  count: number;
  x0: number; // bin start (loanAmount)
  x1: number; // bin end
  y0: number; // bin start (interestRate)
  y1: number; // bin end
} 