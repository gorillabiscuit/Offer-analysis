export const formatETH = (value: number): string => {
  return `${value.toFixed(2)} ETH`;
};

export const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`;
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