import { useState, useEffect } from 'react';
import { LoanOffer } from '../types';

const TINYBIRD_TOKEN = 'p.eyJ1IjogImQzNzk4ZmNmLWIyYmUtNDk2MS04NzNiLWViYWJiM2ZhOGVmNyIsICJpZCI6ICJiYjQ2MGNjZC1jZWZkLTRmNmUtOTRhYS0zMDA1NDBjMTFmNTQiLCAiaG9zdCI6ICJ1c19lYXN0In0.0h_OPHPaO7PRIxbuwTHTI31ixLEssoEwWRhesdWbkBk';
const COLLECTION_ADDRESS = '0xb7f7f6c52f2e2fdb1963eab30438024864c313f6';

export type Currency = 'WETH' | 'USDC';

export const useLoanOffers = () => {
  const [loanOffers, setLoanOffers] = useState<LoanOffer[]>([]);
  const [filteredOffers, setFilteredOffers] = useState<LoanOffer[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>('WETH');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const url = `https://api.us-east.tinybird.co/v0/pipes/market_offers_pipe.json?token=${TINYBIRD_TOKEN}&collection_address=${COLLECTION_ADDRESS}`;
        const response = await fetch(url);
        console.log('API Response:', response);
        if (!response.ok) throw new Error('Failed to fetch loan offers');
        const data = await response.json();
        console.log('API Data:', data);
        
        // Transform the data to match our LoanOffer type
        const transformedOffers: LoanOffer[] = (data.data || []).map((offer: any) => ({
          id: offer._id,
          loanAmount: offer.loanPrincipalCanonicalAmount,
          interestRate: offer.eAPR || offer.apr, // Use effective APR if available
          duration: offer.loanDuration / (24 * 60 * 60), // Convert seconds to days
          collection: offer.collectionName,
          timestamp: new Date(offer.offerDate).getTime(),
          lender: offer.lender,
          createdAt: offer.offerDate,
          currency: offer.currencySymbol, // Add currency information
          maximumRepayment: offer.maximumRepaymentCanonicalAmount, // Add maximum repayment amount
          loanPrincipalUSD: offer.loanPrincipalUSD // Add USD value for conversion
        }));

        setLoanOffers(transformedOffers);
        // Derive collections from the data
        const uniqueCollections: string[] = Array.from(new Set(transformedOffers
          .map(offer => offer.collection)
          .filter((c): c is string => typeof c === 'string' && c.length > 0)));
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

  // Filter offers based on selected currency
  useEffect(() => {
    const filtered = loanOffers.filter(offer => offer.currency === selectedCurrency);
    setFilteredOffers(filtered);
  }, [loanOffers, selectedCurrency]);

  return {
    loanOffers: filteredOffers,
    allLoanOffers: loanOffers,
    collections,
    loading,
    error,
    selectedCurrency,
    setSelectedCurrency
  };
}; 