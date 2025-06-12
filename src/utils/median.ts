import * as d3 from 'd3';
import { LoanOffer } from '../types';

export function getMarketMedians(offers: LoanOffer[]) {
  const medianLoanAmount = d3.median(offers, o => o.loanAmount) || 0;
  const medianInterestRate = d3.median(offers, o => o.interestRate) || 0;
  return { medianLoanAmount, medianInterestRate };
}

// Utility to calculate the median ETH/USD rate from all WETH offers
export function getMedianEthUsdcRate(offers: LoanOffer[]): number | null {
  // Use all WETH offers with a valid fxRateToUSD
  const wethOffers = offers.filter(o => o.currencySymbol === 'WETH' && o.fxRateToUSD);
  console.log('[getMedianEthUsdcRate] Found WETH offers:', wethOffers.length);
  console.log('[getMedianEthUsdcRate] Sample WETH offer:', wethOffers[0]);

  const wethRates = wethOffers.map(o => {
    console.log(`[getMedianEthUsdcRate] fxRateToUSD for offer ${o.id}:`, o.fxRateToUSD);
    return o.fxRateToUSD!;
  });

  const medianEthUsd = d3.median(wethRates) || null;
  console.log('[getMedianEthUsdcRate] Calculated median rate:', medianEthUsd);
  if (!medianEthUsd) return null;
  // USDC/USD is assumed to be 1
  return medianEthUsd;
} 