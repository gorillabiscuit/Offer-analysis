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
  onUserOfferDrag?: (update: { loanAmount: number; interestRate: number }) => void;
  domain: { x: [number, number]; y: [number, number] };
}

const PADDING_PERCENTAGE = 0.1; // 10% padding
const TRANSITION_DURATION = 750; // Duration of transitions in milliseconds

const ScatterPlot: React.FC<ScatterPlotProps> = ({ 
  data = [], 
  userOffer,
  selectedCurrency,
  onCurrencyChange,
  onUserOfferDrag,
  domain
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const prevScalesRef = useRef<{ x: d3.ScaleLinear<number, number>; y: d3.ScaleLinear<number, number> } | null>(null);
  const isDraggingRef = useRef(false);

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

    // Use domain from props instead of calculating from data
    const [xMin, xMax] = domain.x;
    const [yMin, yMax] = domain.y;

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

    // Helper to conditionally transition or not
    function maybeTransition(selection: any) {
      return isDraggingRef.current ? selection : selection.transition().duration(TRANSITION_DURATION);
    }

    // Update axes with transitions or immediate
    if (xAxisGroup.empty()) {
      g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);
    } else {
      maybeTransition(xAxisGroup)
        .call(xAxis as any);
    }

    if (yAxisGroup.empty()) {
      g.append('g')
        .attr('class', 'y-axis')
        .call(yAxis);
    } else {
      maybeTransition(yAxisGroup)
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
      maybeTransition(xLabel)
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
    const sortedLoanAmounts = [...data.map(d => d.loanAmount)].sort((a, b) => a - b);
    const sortedInterestRates = [...data.map(d => d.interestRate)].sort((a, b) => a - b);
    
    const medianLoanAmount = d3.median(sortedLoanAmounts) || 0;
    const medianInterestRate = d3.median(sortedInterestRates) || 0;
    
    const q1LoanAmount = d3.quantile(sortedLoanAmounts, 0.25) || 0;
    const q3LoanAmount = d3.quantile(sortedLoanAmounts, 0.75) || 0;
    const q1InterestRate = d3.quantile(sortedInterestRates, 0.25) || 0;
    const q3InterestRate = d3.quantile(sortedInterestRates, 0.75) || 0;

    // Update reference lines with transitions or immediate
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
        maybeTransition(line)
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

    // Update annotations with transitions or immediate
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
        maybeTransition(annotation)
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

    // Log the keys for debugging
    const keys = data.map(d => d.id || `${d.collection}-${d.loanAmount}-${d.interestRate}-${d.duration}`);
    console.log('Loan keys:', keys);

    // Update dots with transitions
    const dots = g.selectAll<SVGCircleElement, LoanOffer>('.data-point')
      .data(data, (d: any) => d.id || `${d.collection}-${d.loanAmount}-${d.interestRate}-${d.duration}`);

    // Remove old dots
    dots.exit()
      .transition()
      .duration(TRANSITION_DURATION)
      .attr('r', 0)
      .remove();

    // Add new dots
    const dotsEnter = dots.enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('r', 5)
      .attr('fill', '#2196f3')
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        if (!tooltipRef.current) return;
        const tooltip = tooltipRef.current;
        tooltip.style.visibility = 'visible';
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
        tooltip.innerHTML = `
          <strong>Collection:</strong> ${d.collection}<br/>
          <strong>Loan Amount:</strong> ${d.loanAmount} ${selectedCurrency}<br/>
          <strong>Interest Rate:</strong> ${d.interestRate}%<br/>
          <strong>Duration:</strong> ${d.duration} days
        `;
      })
      .on('mousemove', function(event) {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.left = (event.pageX + 10) + 'px';
        tooltipRef.current.style.top = (event.pageY - 10) + 'px';
      })
      .on('mouseout', function() {
        if (!tooltipRef.current) return;
        tooltipRef.current.style.visibility = 'hidden';
      });

    // Update all dots (including new ones)
    dots.merge(dotsEnter)
      .transition()
      .duration(TRANSITION_DURATION)
      .attr('cx', d => xScale(d.loanAmount))
      .attr('cy', d => yScale(d.interestRate));

    // Update user offer point if it exists
    if (userOffer) {
      const userPoint = g.selectAll<SVGCircleElement, LoanOffer>('.user-point')
        .data([userOffer]);

      userPoint.exit().remove();

      const userPointEnter = userPoint.enter()
        .append('circle')
        .attr('class', 'user-point')
        .attr('r', 7)
        .attr('fill', '#f50057')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);

      // Add D3 drag behavior
      const drag = d3.drag<SVGCircleElement, LoanOffer>()
        .on('start', function (event, d) {
          event.sourceEvent.stopPropagation();
          isDraggingRef.current = true;
          d3.select(this).interrupt(); // Interrupt any ongoing transitions
          d3.select(this).raise().attr('stroke', '#000');
        })
        .on('drag', function (event, d) {
          const x = Math.max(0, Math.min(width, event.x));
          const y = Math.max(0, Math.min(height, event.y));
          d3.select(this)
            .attr('cx', x)
            .attr('cy', y);
          // Do NOT update React state here!
        })
        .on('end', function (event, d) {
          isDraggingRef.current = false;
          d3.select(this).attr('stroke', '#fff');
          const x = Math.max(0, Math.min(width, event.x));
          const y = Math.max(0, Math.min(height, event.y));
          const newLoanAmount = xScale.invert(x);
          const newInterestRate = yScale.invert(y);
          if (typeof onUserOfferDrag === 'function') {
            onUserOfferDrag({ loanAmount: newLoanAmount, interestRate: newInterestRate });
          }
        });

      // Update user offer point position
      const merged = userPoint.merge(userPointEnter);
      if (isDraggingRef.current) {
        merged
          .attr('cx', d => xScale(d.loanAmount))
          .attr('cy', d => yScale(d.interestRate))
          .call(drag);
      } else {
        merged
          .transition()
          .duration(TRANSITION_DURATION)
          .attr('cx', d => xScale(d.loanAmount))
          .attr('cy', d => yScale(d.interestRate))
          .selection()
          .call(drag);
      }

      // Add user offer label
      const userLabel = g.selectAll<SVGTextElement, LoanOffer>('.user-label')
        .data([userOffer]);

      userLabel.exit().remove();

      const userLabelEnter = userLabel.enter()
        .append('text')
        .attr('class', 'user-label')
        .attr('dy', -10)
        .style('font-size', '12px')
        .style('fill', '#f50057')
        .text('Your Offer');

      if (isDraggingRef.current) {
        userLabel.merge(userLabelEnter)
          .attr('x', d => xScale(d.loanAmount))
          .attr('y', d => yScale(d.interestRate));
      } else {
        userLabel.merge(userLabelEnter)
          .transition()
          .duration(TRANSITION_DURATION)
          .attr('x', d => xScale(d.loanAmount))
          .attr('y', d => yScale(d.interestRate));
      }
    } else {
      // Remove user point and label if no user offer
      g.selectAll('.user-point, .user-label').remove();
    }
  }, [data, userOffer, selectedCurrency, onUserOfferDrag, domain]);

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