import { useState, useCallback } from 'react';

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

  return {
    userOffer,
    updateUserOffer,
    resetUserOffer,
  };
}; 