import { useState, useCallback } from 'react';
import { LoanOffer } from '../types';

export interface UserOfferState {
  loanAmount: number;
  interestRate: number;
  duration?: number;
  collection?: string;
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

  const initializeWithMedianValues = useCallback((offers: LoanOffer[]) => {
    if (offers.length === 0) return;

    // Calculate median loan amount
    const sortedAmounts = [...offers.map(o => o.loanAmount)].sort((a, b) => a - b);
    const medianAmount = sortedAmounts[Math.floor(sortedAmounts.length / 2)];

    // Calculate median interest rate
    const sortedRates = [...offers.map(o => o.interestRate)].sort((a, b) => a - b);
    const medianRate = sortedRates[Math.floor(sortedRates.length / 2)];

    // Get most common duration if available
    const durations = offers.map(o => o.duration).filter((d): d is number => d !== undefined);
    const mostCommonDuration = durations.length > 0 
      ? durations.reduce((a, b, i, arr) => 
          arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
        )
      : undefined;

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