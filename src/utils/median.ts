import * as d3 from 'd3';
import { LoanOffer } from '../types';

export function getMarketMedians(offers: LoanOffer[]) {
  const medianLoanAmount = d3.median(offers, o => o.loanAmount) || 0;
  const medianInterestRate = d3.median(offers, o => o.interestRate) || 0;
  return { medianLoanAmount, medianInterestRate };
}

// Utility to calculate the median ETH/USD rate from all WETH offers
export function getMedianEthUsdcRate(offers: LoanOffer[]): number | null {
  // Use all WETH offers with a USD value
  const wethOffers = offers.filter(o => o.currency === 'WETH' && o.loanPrincipalUSD && o.loanAmount);
  const wethRates = wethOffers.map(o => o.loanPrincipalUSD! / o.loanAmount);
  const medianEthUsd = d3.median(wethRates) || null;
  if (!medianEthUsd) return null;
  // USDC/USD is assumed to be 1
  return medianEthUsd;
} 