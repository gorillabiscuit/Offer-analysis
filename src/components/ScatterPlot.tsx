import React, { useEffect, useRef } from 'react';
import { Box, Paper, Typography, FormControlLabel, Switch } from '@mui/material';
import * as d3 from 'd3';
import { LoanOffer } from '../types';
import { Currency } from '../hooks/useLoanOffers';

interface ScatterPlotProps {
  data?: LoanOffer[];
  userOffer?: LoanOffer;
  selectedCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
}

const PADDING_PERCENTAGE = 0.1; // 10% padding
const TRANSITION_DURATION = 750; // Duration of transitions in milliseconds

const ScatterPlot: React.FC<ScatterPlotProps> = ({ 
  data = [], 
  userOffer,
  selectedCurrency,
  onCurrencyChange 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const prevScalesRef = useRef<{ x: d3.ScaleLinear<number, number>; y: d3.ScaleLinear<number, number> } | null>(null);

  // Create tooltip once when component mounts
  useEffect(() => {
    let tooltip: HTMLDivElement | null = null;

    // Create tooltip div if it doesn't exist
    if (!tooltipRef.current) {
      tooltip = document.createElement('div');
      tooltip.style.position = 'absolute';
      tooltip.style.visibility = 'hidden';
      tooltip.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
      tooltip.style.border = '1px solid #ddd';
      tooltip.style.borderRadius = '4px';
      tooltip.style.padding = '12px';
      tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      tooltip.style.zIndex = '1000';
      tooltip.style.fontSize = '14px';
      tooltip.style.lineHeight = '1.4';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.maxWidth = '300px';
      document.body.appendChild(tooltip);
      tooltipRef.current = tooltip;
    }

    // Cleanup tooltip when component unmounts
    return () => {
      if (tooltipRef.current && document.body.contains(tooltipRef.current)) {
        document.body.removeChild(tooltipRef.current);
      }
      tooltipRef.current = null;
    };
  }, []);

  // Function to calculate domain with padding
  const calculateDomainWithPadding = (values: number[]): [number, number] => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range * PADDING_PERCENTAGE;
    return [Math.max(0, min - padding), max + padding];
  };

  useEffect(() => {
    if (!svgRef.current || data.length === 0 || !tooltipRef.current) return;

    // Set up dimensions
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;

    // Create or get SVG
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('g').empty() 
      ? svg
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`)
      : svg.select<SVGGElement>('g');

    // Calculate domains with padding
    const loanAmounts = data.map(d => d.loanAmount);
    const interestRates = data.map(d => d.interestRate);
    
    // Add user offer to the data for domain calculation if it exists
    if (userOffer) {
      loanAmounts.push(userOffer.loanAmount);
      interestRates.push(userOffer.interestRate);
    }

    const [xMin, xMax] = calculateDomainWithPadding(loanAmounts);
    const [yMin, yMax] = calculateDomainWithPadding(interestRates);

    // Create scales with padding
    const xScale = d3.scaleLinear()
      .domain([xMin, xMax])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([yMin, yMax])
      .range([height, 0]);

    // Store current scales for next update
    prevScalesRef.current = { x: xScale, y: yScale };

    // Update axes with transitions
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    // Update or create axes
    const xAxisGroup = g.select<SVGGElement>('.x-axis');
    const yAxisGroup = g.select<SVGGElement>('.y-axis');

    if (xAxisGroup.empty()) {
      g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);
    } else {
      xAxisGroup.transition()
        .duration(TRANSITION_DURATION)
        .call(xAxis as any);
    }

    if (yAxisGroup.empty()) {
      g.append('g')
        .attr('class', 'y-axis')
        .call(yAxis);
    } else {
      yAxisGroup.transition()
        .duration(TRANSITION_DURATION)
        .call(yAxis as any);
    }

    // Update axis labels
    const xLabel = g.select<SVGTextElement>('.x-label');
    const yLabel = g.select<SVGTextElement>('.y-label');

    if (xLabel.empty()) {
      g.append('text')
        .attr('class', 'x-label')
        .attr('transform', `translate(${width / 2}, ${height + margin.bottom - 10})`)
        .style('text-anchor', 'middle')
        .text(`Loan Amount (${selectedCurrency})`);
    } else {
      xLabel.transition()
        .duration(TRANSITION_DURATION)
        .text(`Loan Amount (${selectedCurrency})`);
    }

    if (yLabel.empty()) {
      g.append('text')
        .attr('class', 'y-label')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 15)
        .attr('x', -(height / 2))
        .style('text-anchor', 'middle')
        .text('Interest Rate (%)');
    }

    // Calculate statistics
    const sortedLoanAmounts = [...loanAmounts].sort((a, b) => a - b);
    const sortedInterestRates = [...interestRates].sort((a, b) => a - b);
    
    const medianLoanAmount = d3.median(sortedLoanAmounts) || 0;
    const medianInterestRate = d3.median(sortedInterestRates) || 0;
    
    const q1LoanAmount = d3.quantile(sortedLoanAmounts, 0.25) || 0;
    const q3LoanAmount = d3.quantile(sortedLoanAmounts, 0.75) || 0;
    const q1InterestRate = d3.quantile(sortedInterestRates, 0.25) || 0;
    const q3InterestRate = d3.quantile(sortedInterestRates, 0.75) || 0;

    // Update reference lines with transitions
    const updateReferenceLine = (className: string, x1: number, x2: number, y1: number, y2: number, color: string, dashArray: string) => {
      const line = g.select<SVGLineElement>(`.${className}`);
      if (line.empty()) {
        g.append('line')
          .attr('class', className)
          .attr('x1', x1)
          .attr('x2', x2)
          .attr('y1', y1)
          .attr('y2', y2)
          .attr('stroke', color)
          .attr('stroke-width', 1)
          .attr('stroke-dasharray', dashArray);
      } else {
        line.transition()
          .duration(TRANSITION_DURATION)
          .attr('x1', x1)
          .attr('x2', x2)
          .attr('y1', y1)
          .attr('y2', y2);
      }
    };

    // Update median lines
    updateReferenceLine('median-x', xScale(medianLoanAmount), xScale(medianLoanAmount), 0, height, '#666', '5,5');
    updateReferenceLine('median-y', 0, width, yScale(medianInterestRate), yScale(medianInterestRate), '#666', '5,5');

    // Update quartile lines
    updateReferenceLine('q1-x', xScale(q1LoanAmount), xScale(q1LoanAmount), 0, height, '#999', '2,2');
    updateReferenceLine('q3-x', xScale(q3LoanAmount), xScale(q3LoanAmount), 0, height, '#999', '2,2');
    updateReferenceLine('q1-y', 0, width, yScale(q1InterestRate), yScale(q1InterestRate), '#999', '2,2');
    updateReferenceLine('q3-y', 0, width, yScale(q3InterestRate), yScale(q3InterestRate), '#999', '2,2');

    // Update annotations with transitions
    const updateAnnotation = (className: string, x: number, y: number, text: string, anchor: string = 'start') => {
      const annotation = g.select<SVGTextElement>(`.${className}`);
      if (annotation.empty()) {
        g.append('text')
          .attr('class', className)
          .attr('x', x)
          .attr('y', y)
          .attr('text-anchor', anchor)
          .style('font-size', '12px')
          .style('fill', '#666')
          .text(text);
      } else {
        annotation.transition()
          .duration(TRANSITION_DURATION)
          .attr('x', x)
          .attr('y', y)
          .text(text);
      }
    };

    // Update median annotations
    updateAnnotation('median-x-annotation', xScale(medianLoanAmount) + 5, 15, `Median: ${medianLoanAmount.toFixed(2)} ${selectedCurrency}`);
    updateAnnotation('median-y-annotation', width - 5, yScale(medianInterestRate) - 5, `Median: ${medianInterestRate.toFixed(2)}%`, 'end');

    // Update quartile annotations
    updateAnnotation('q1-x-annotation', xScale(q1LoanAmount) + 5, 30, `Q1: ${q1LoanAmount.toFixed(2)} ${selectedCurrency}`);
    updateAnnotation('q3-x-annotation', xScale(q3LoanAmount) + 5, 45, `Q3: ${q3LoanAmount.toFixed(2)} ${selectedCurrency}`);
    updateAnnotation('q1-y-annotation', width - 5, yScale(q1InterestRate) - 20, `Q1: ${q1InterestRate.toFixed(2)}%`, 'end');
    updateAnnotation('q3-y-annotation', width - 5, yScale(q3InterestRate) - 35, `Q3: ${q3InterestRate.toFixed(2)}%`, 'end');

    // Update dots with transitions
    const dots = g.selectAll<SVGCircleElement, LoanOffer>('.data-point')
      .data(data, (d: any) => d.loanAmount + '-' + d.interestRate);

    // Remove old dots
    dots.exit()
      .transition()
      .duration(TRANSITION_DURATION)
      .attr('r', 0)
      .remove();

    // Add new dots
    const newDots = dots.enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('r', 0)
      .style('fill', '#1976d2')
      .style('opacity', 0.7)
      .style('cursor', 'pointer');

    // Update all dots
    const allDots = dots.merge(newDots);
    allDots
      .transition()
      .duration(TRANSITION_DURATION)
      .attr('cx', (d: LoanOffer) => xScale(d.loanAmount))
      .attr('cy', (d: LoanOffer) => yScale(d.interestRate))
      .attr('r', 5)
      .style('opacity', 0.7);

    // Add event listeners to dots
    allDots
      .on('mouseover', function(event: MouseEvent, d: LoanOffer) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 8)
          .style('opacity', 1)
          .style('stroke', '#000')
          .style('stroke-width', 2);

        const tooltipContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="margin-bottom: 4px;"><strong>Loan Amount:</strong> ${d.loanAmount.toFixed(2)} ${d.currency || selectedCurrency}</div>
            <div style="margin-bottom: 4px;"><strong>Interest Rate:</strong> ${d.interestRate.toFixed(2)}%</div>
            <div style="margin-bottom: 4px;"><strong>Duration:</strong> ${d.duration} days</div>
            ${d.lender ? `<div style="margin-bottom: 4px;"><strong>Lender:</strong> ${d.lender}</div>` : ''}
            ${d.collection ? `<div style="margin-bottom: 4px;"><strong>Collection:</strong> ${d.collection}</div>` : ''}
            ${d.maximumRepayment ? `<div style="margin-bottom: 4px;"><strong>Max Repayment:</strong> ${d.maximumRepayment.toFixed(2)} ${d.currency || selectedCurrency}</div>` : ''}
            ${d.createdAt ? `<div><strong>Created:</strong> ${new Date(d.createdAt).toLocaleDateString()}</div>` : ''}
          </div>
        `;

        if (tooltipRef.current) {
          tooltipRef.current.innerHTML = tooltipContent;
          tooltipRef.current.style.visibility = 'visible';
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
        }
      })
      .on('mousemove', function(event: MouseEvent) {
        if (tooltipRef.current) {
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
        }
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 5)
          .style('opacity', 0.7)
          .style('stroke', 'none');

        if (tooltipRef.current) {
          tooltipRef.current.style.visibility = 'hidden';
        }
      });

    // Update user offer point with transitions
    if (userOffer) {
      const userPoint = g.select<SVGCircleElement>('.user-offer-point');
      if (userPoint.empty()) {
        g.append('circle')
          .attr('class', 'user-offer-point')
          .attr('cx', xScale(userOffer.loanAmount))
          .attr('cy', yScale(userOffer.interestRate))
          .attr('r', 8)
          .style('fill', '#ff4444')
          .style('stroke', '#000')
          .style('stroke-width', 2)
          .style('cursor', 'pointer');
      } else {
        userPoint.transition()
          .duration(TRANSITION_DURATION)
          .attr('cx', xScale(userOffer.loanAmount))
          .attr('cy', yScale(userOffer.interestRate));
      }

      // Update user offer label
      const userLabel = g.select<SVGTextElement>('.user-offer-label');
      if (userLabel.empty()) {
        g.append('text')
          .attr('class', 'user-offer-label')
          .attr('x', xScale(userOffer.loanAmount) + 10)
          .attr('y', yScale(userOffer.interestRate) - 10)
          .attr('text-anchor', 'start')
          .attr('font-size', '12px')
          .attr('font-weight', 'bold')
          .attr('fill', '#ff4444')
          .text('Your Offer');
      } else {
        userLabel.transition()
          .duration(TRANSITION_DURATION)
          .attr('x', xScale(userOffer.loanAmount) + 10)
          .attr('y', yScale(userOffer.interestRate) - 10);
      }

      // Add hover effect for user offer point
      userPoint
        .on('mouseover', function(event: MouseEvent) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 10)
            .style('stroke-width', 3);

          const tooltipContent = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
              <div style="margin-bottom: 4px;"><strong>Your Loan Amount:</strong> ${userOffer.loanAmount.toFixed(2)} ${selectedCurrency}</div>
              <div style="margin-bottom: 4px;"><strong>Your Interest Rate:</strong> ${userOffer.interestRate.toFixed(2)}%</div>
              <div style="margin-bottom: 4px;"><strong>Duration:</strong> ${userOffer.duration} days</div>
            </div>
          `;

          if (tooltipRef.current) {
            tooltipRef.current.innerHTML = tooltipContent;
            tooltipRef.current.style.visibility = 'visible';
            tooltipRef.current.style.top = `${event.pageY - 10}px`;
            tooltipRef.current.style.left = `${event.pageX + 10}px`;
          }
        })
        .on('mousemove', function(event: MouseEvent) {
          if (tooltipRef.current) {
            tooltipRef.current.style.top = `${event.pageY - 10}px`;
            tooltipRef.current.style.left = `${event.pageX + 10}px`;
          }
        })
        .on('mouseout', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 8)
            .style('stroke-width', 2);

          if (tooltipRef.current) {
            tooltipRef.current.style.visibility = 'hidden';
          }
        });
    } else {
      // Remove user offer point and label if no user offer
      g.select('.user-offer-point').remove();
      g.select('.user-offer-label').remove();
    }
  }, [data, userOffer, selectedCurrency]);

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Market Offers</Typography>
        <FormControlLabel
          control={
            <Switch
              checked={selectedCurrency === 'USDC'}
              onChange={(e) => onCurrencyChange(e.target.checked ? 'USDC' : 'WETH')}
            />
          }
          label={`Show ${selectedCurrency} offers`}
        />
      </Box>
      <Box sx={{ width: '100%', height: 'calc(100% - 48px)' }}>
        <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Paper>
  );
};

export default ScatterPlot; 