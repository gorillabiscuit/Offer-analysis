import { useMemo } from 'react';
import { LoanOffer, ScatterPlotData } from '../types';

export const useScatterPlotData = (offers: LoanOffer[]): ScatterPlotData[] => {
  return useMemo(() => {
    return offers.map(offer => ({
      x: offer.loanAmount,
      y: offer.interestRate,
      size: offer.duration ? offer.duration / 30 : 1, // Normalize duration to a reasonable size, default to 1
      label: `${offer.loanAmount} ETH, ${offer.interestRate}%`
    }));
  }, [offers]);
}; 