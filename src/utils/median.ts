import * as d3 from 'd3';
import { LoanOffer } from '../types';

export function getMarketMedians(offers: LoanOffer[]) {
  const medianLoanAmount = d3.median(offers, o => o.loanAmount) || 0;
  const medianInterestRate = d3.median(offers, o => o.interestRate) || 0;
  return { medianLoanAmount, medianInterestRate };
} 