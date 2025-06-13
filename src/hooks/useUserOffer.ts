import { useState, useCallback } from 'react';
import { LoanOffer } from '../types';
import * as d3 from 'd3';

export interface UserOfferState {
  loanAmount: number;
  interestRate: number;
  duration?: number;
  collection?: string;
  collectionAddress?: string;
}

export const useUserOffer = () => {
  const [userOffer, setUserOffer] = useState<UserOfferState>({
    loanAmount: 1.0,
    interestRate: 5.0,
    duration: undefined,
  });

  const updateUserOffer = useCallback((updates: Partial<UserOfferState>) => {
    setUserOffer(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const resetUserOffer = useCallback(() => {
    setUserOffer({
      loanAmount: 1.0,
      interestRate: 5.0,
      duration: undefined,
    });
  }, []);

  const initializeWithMedianValues = useCallback((marketOffers: LoanOffer[]) => {
    if (marketOffers.length === 0) return;

    // Filter out any offers that might be the user's offer (those without an id)
    const validMarketOffers = marketOffers.filter(offer => offer.id);
    if (validMarketOffers.length === 0) return;

    // Use d3.median for both medians
    const medianAmount = d3.median(validMarketOffers, o => o.loanAmount) || 0;
    const medianRate = d3.median(validMarketOffers, o => o.interestRate) || 0;

    // Get most common duration from market offers only
    const durations = validMarketOffers
      .map(o => o.duration)
      .filter((d): d is number => d !== undefined);
    const mostCommonDuration = durations.length > 0 
      ? durations.reduce((a, b, i, arr) => 
          arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
        )
      : undefined;

    // Debug logs
    console.log('--- Median Calculation Debug (D3) ---');
    console.log('Loan Amounts:', validMarketOffers.map(o => o.loanAmount));
    console.log('Median Loan Amount (d3):', medianAmount);
    console.log('Interest Rates:', validMarketOffers.map(o => o.interestRate));
    console.log('Median Interest Rate (d3):', medianRate);
    console.log('Durations:', durations);
    console.log('Most Common Duration:', mostCommonDuration);
    console.log('User Offer Set To:', {
      loanAmount: medianAmount,
      interestRate: medianRate,
      duration: mostCommonDuration,
    });
    console.log('-------------------------------');

    setUserOffer({
      loanAmount: medianAmount,
      interestRate: medianRate,
      duration: mostCommonDuration,
    });
  }, []);

  return {
    userOffer,
    updateUserOffer,
    resetUserOffer,
    initializeWithMedianValues,
  };
}; 