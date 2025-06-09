export interface LoanOffer {
  id?: string;
  loanAmount: number;
  interestRate: number;
  duration?: number;
  collection?: string;
  timestamp?: number;
  lender?: string;
  createdAt?: string;
  currency?: string;
  maximumRepayment?: number;
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