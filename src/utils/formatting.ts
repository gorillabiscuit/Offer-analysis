export const roundETH = (value: number): number => {
  return Math.round(value * 1000) / 1000;
};

export const roundPercentage = (value: number): number => {
  return Math.round(value * 100) / 100;
};

export const formatETH = (value: number): string => {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ETH`;
};

export const formatPercentage = (value: number): string => {
  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

export const formatDuration = (days: number): string => {
  if (days < 30) {
    return `${days} days`;
  }
  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  return remainingDays > 0 
    ? `${months} months, ${remainingDays} days`
    : `${months} months`;
}; 