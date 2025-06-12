import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import * as d3 from 'd3';
import { LoanOffer, HeatmapCell } from '../types';
import { Currency } from '../hooks/useLoanOffers';
import { getMarketMedians } from '../utils/median';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import styles from './ChartLayout.module.css';
import { formatCurrency, formatPercentageAxis } from '../utils/formatting';

interface ScatterPlotProps {
  data?: LoanOffer[];
  userOffer?: LoanOffer;
  selectedCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
  onUserOfferDrag?: (update: { loanAmount: number; interestRate: number; dragX?: number; dragY?: number; width?: number; height?: number; dragging?: boolean }) => void;
  domain: { x: [number, number]; y: [number, number] };
  showContours?: boolean;
}

const PADDING_PERCENTAGE = 0.1; // 10% padding
const TRANSITION_DURATION = 750; // Duration of transitions in milliseconds

// Add depth as an optional property for charting
interface LoanOfferWithDepth extends LoanOffer {
  depth?: number;
}

// === Contour Density Visualization Parameters ===
/**
 * Controls how "smooth" the contours are. Lower values create more focused, 
 * detailed contours, while higher values create smoother, more generalized contours.
 * Range: 5-30, where:
 * - 5: Very focused, shows small clusters
 * - 15: Balanced, shows medium-sized clusters
 * - 30: Very smooth, shows large trends
 */
const CONTOUR_BANDWIDTH = 30;

/**
 * Number of contour levels to generate. Higher values create more detailed
 * visualization with more color steps, while lower values create broader
 * categories of density.
 * Range: 10-50, where:
 * - 10: Broad categories, clear distinction between high/low density
 * - 30: Detailed visualization, smooth transitions
 * - 50: Very detailed, might be too granular
 */
const CONTOUR_THRESHOLDS = 10;

/**
 * Exponent for the power scale used in color mapping. Controls how the density
 * values are mapped to colors. Lower values emphasize differences in low-density
 * areas, while higher values emphasize differences in high-density areas.
 * Range: 0.1-2, where:
 * - 0.1: Very sensitive to small differences
 * - 0.5: Square root, balanced emphasis
 * - 2: Square, emphasizes high-density areas
 */
const CONTOUR_SCALE_EXPONENT = 1;

/**
 * Color and opacity range for the contours. First color is for low density,
 * second color is for high density. Opacity values control how visible the
 * contours are against the background.
 * Format: ['rgba(r,g,b,opacity)', 'rgba(r,g,b,opacity)']
 * - First opacity: 0.05-0.2 for subtle low-density areas
 * - Second opacity: 0.3-0.6 for visible high-density areas
 */
const CONTOUR_COLORS = [
  'rgba(77, 150, 255, 0.01)',  // Light blue, high opacity
  'rgba(255, 107, 107, 0.4)'   // Light red, high opacity
];

const ScatterPlot: React.FC<ScatterPlotProps> = ({ 
  data = [], 
  userOffer,
  selectedCurrency,
  onCurrencyChange,
  onUserOfferDrag,
  domain,
  showContours = true
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const dragTooltipRef = useRef<HTMLDivElement | null>(null);
  const prevScalesRef = useRef<{ x: d3.ScaleLinear<number, number>; y: d3.ScaleLinear<number, number> } | null>(null);
  const isDraggingRef = useRef(false);
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingDragEndRef = useRef<{ x: number; y: number } | null>(null);
  const dragAnchorRef = useRef<{ svgX: number; svgY: number; dataX: number; dataY: number } | null>(null);
  const lastDataPosRef = useRef<{ dataX: number; dataY: number } | null>(null);
  const lastDomainRef = useRef(domain);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create tooltips once when component mounts
  useEffect(() => {
    let tooltip: HTMLDivElement | null = null;
    let dragTooltip: HTMLDivElement | null = null;

    // Create main tooltip div if it doesn't exist
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

    // Create drag tooltip div if it doesn't exist
    if (!dragTooltipRef.current) {
      dragTooltip = document.createElement('div');
      dragTooltip.style.position = 'absolute';
      dragTooltip.style.visibility = 'hidden';
      dragTooltip.style.backgroundColor = 'rgba(245, 0, 87, 0.95)';
      dragTooltip.style.color = 'white';
      dragTooltip.style.borderRadius = '4px';
      dragTooltip.style.padding = '8px 12px';
      dragTooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      dragTooltip.style.zIndex = '1000';
      dragTooltip.style.fontSize = '14px';
      dragTooltip.style.lineHeight = '1.4';
      dragTooltip.style.pointerEvents = 'none';
      dragTooltip.style.fontWeight = 'bold';
      document.body.appendChild(dragTooltip);
      dragTooltipRef.current = dragTooltip;
    }

    // Cleanup tooltips when component unmounts
    return () => {
      if (tooltipRef.current && document.body.contains(tooltipRef.current)) {
        document.body.removeChild(tooltipRef.current);
      }
      if (dragTooltipRef.current && document.body.contains(dragTooltipRef.current)) {
        document.body.removeChild(dragTooltipRef.current);
      }
      tooltipRef.current = null;
      dragTooltipRef.current = null;
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

  // Helper to format age as 'xx days ago', 'xx hours ago', or 'xx minutes ago'
  function formatAge(timestamp?: number): string {
    if (!timestamp) return 'N/A';
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays >= 1) {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    } else if (diffHours >= 1) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else {
      return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    }
  }

  // Helper to throttle domain expansion
  const throttledExpand = useCallback((fn: () => void) => {
    if (throttleTimeoutRef.current) return;
    throttleTimeoutRef.current = setTimeout(() => {
      fn();
      throttleTimeoutRef.current = null;
    }, 100); // 100ms throttle
  }, []);

  useEffect(() => {
    lastDomainRef.current = domain;
  }, [domain]);

  // ResizeObserver to track container size
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setChartSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    handleResize();
    const resizeObserver = new window.ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || data.length === 0 || !tooltipRef.current) return;
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = chartSize.width - margin.left - margin.right;
    const height = chartSize.height - margin.top - margin.bottom;
    if (width <= 0 || height <= 0) return;

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
    const xAxis = d3.axisBottom(xScale)
      .ticks(6)
      .tickFormat((domainValue: d3.NumberValue, _i: number) => {
        const d = typeof domainValue === 'number' ? domainValue : domainValue.valueOf();
        return `${formatCurrency(d, selectedCurrency)} ${selectedCurrency}`;
      });
    const yAxis = d3.axisLeft(yScale)
      .ticks(10)
      .tickFormat((domainValue: d3.NumberValue, _i: number) => {
        const d = typeof domainValue === 'number' ? domainValue : domainValue.valueOf();
        return formatPercentageAxis(d);
      });

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

    // === Axis styling for design ===
    // Axis lines: white at 30% opacity
    g.selectAll('.x-axis path, .x-axis line, .y-axis path, .y-axis line')
      .attr('stroke', 'rgba(255,255,255,0.3)');
    // Axis text: pure white
    g.selectAll('.x-axis text, .y-axis text')
      .attr('fill', '#FFF');
    // Remove axis labels (no .x-label or .y-label)

    // Calculate statistics
    const { medianLoanAmount, medianInterestRate } = getMarketMedians(data);
    
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
          .style('fill', 'rgba(255,255,255,0.8)')
          .text(text);
      } else {
        maybeTransition(annotation)
          .attr('x', x)
          .attr('y', y)
          .style('fill', 'rgba(255,255,255,0.8)')
          .text(text);
      }
    };

    // Update median annotations
    updateAnnotation('median-x-annotation', xScale(medianLoanAmount) + 20, 15, `Median: ${formatCurrency(medianLoanAmount, selectedCurrency)} ${selectedCurrency === 'WETH' ? 'wETH' : selectedCurrency}`);
    updateAnnotation('median-y-annotation', width - 5, yScale(medianInterestRate) - 20, `Median: ${formatPercentageAxis(medianInterestRate)}`, 'end');

    // Log the keys for debugging
    const keys = data.map(d => d.id || `${d.collection}-${d.loanAmount}-${d.interestRate}-${d.duration}`);
    console.log('Loan keys:', keys);

    // Color scale for offer age (newest: red, oldest: blue)
    const timestamps = data.map(d => d.timestamp ?? 0);
    const minTimestamp = d3.min(timestamps) ?? 0;
    const maxTimestamp = d3.max(timestamps) ?? 0;
    const timeScale = d3.scaleLinear<string>()
      .domain([minTimestamp, maxTimestamp])
      .range(["#4D96FF", "#FF6B6B"]); // Oldest: blue, Newest: red

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
      .attr('r', 10)
      // Color by age
      .attr('fill', d => timeScale(d.timestamp ?? 0))
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        if (!tooltipRef.current) return;
        const tooltip = tooltipRef.current;
        tooltip.style.visibility = 'visible';
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
        if (d) {
          const dd = d as LoanOfferWithDepth;
          tooltip.innerHTML = `
            <strong>Loan Amount:</strong> ${dd.loanAmount} ${selectedCurrency}<br/>
            <strong>Interest Rate:</strong> ${dd.interestRate}%<br/>
            <strong>Duration:</strong> ${dd.duration} days<br/>
            <strong>Loan created:</strong> ${formatAge(dd.timestamp)}<br/>
            <strong>Loans Available:</strong> ${dd.depth && dd.depth > 1 ? dd.depth : 1}
          `;
        } else {
          tooltip.innerHTML = '';
        }
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
      // Use maybeTransition to decide if we animate or not
      .call(sel => maybeTransition(sel)
        .attr('cx', (d: LoanOffer) => xScale(d.loanAmount))
        .attr('cy', (d: LoanOffer) => yScale(d.interestRate))
        .attr('fill', (d: LoanOffer) => timeScale(d.timestamp ?? 0))
      );

    // Update user offer point if it exists
    if (userOffer) {
      const userPoint = g.selectAll<SVGCircleElement, LoanOffer>('.user-point')
        .data([userOffer]);

      userPoint.exit().remove();

      const userPointEnter = userPoint.enter()
        .append('circle')
        .attr('class', 'user-point')
        .attr('r', 12)
        .attr('fill', '#f50057')
        .style('cursor', 'move');

      // --- Crosshairs ---
      g.selectAll('.user-crosshair-x, .user-crosshair-y, .user-crosshair-x-label, .user-crosshair-y-label').remove();
      // Remove previous crosshair label groups to prevent accumulation
      g.selectAll('.user-crosshair-x-label-group, .user-crosshair-y-label-group').remove();

      // Only show crosshairs and labels while dragging
      if (isDraggingRef.current && lastDataPosRef.current) {
        const [xMin, xMax] = lastDomainRef.current.x;
        const [yMin, yMax] = lastDomainRef.current.y;
        const width = svgRef.current!.clientWidth - margin.left - margin.right;
        const height = svgRef.current!.clientHeight - margin.top - margin.bottom;
        const xScaleCurrent = d3.scaleLinear().domain([xMin, xMax]).range([0, width]);
        const yScaleCurrent = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);
        const userLoan = lastDataPosRef.current.dataX;
        const userRate = lastDataPosRef.current.dataY;
        const userX = xScaleCurrent(userLoan);
        const userY = yScaleCurrent(userRate);

        // Draw vertical crosshair (loan amount)
        g.append('line')
          .attr('class', 'user-crosshair-x')
          .attr('x1', userX)
          .attr('x2', userX)
          .attr('y1', 0)
          .attr('y2', height)
          .attr('stroke', 'rgba(245,0,87,0.7)')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,2');
        // Draw horizontal crosshair (interest rate)
        g.append('line')
          .attr('class', 'user-crosshair-y')
          .attr('x1', 0)
          .attr('x2', width)
          .attr('y1', userY)
          .attr('y2', userY)
          .attr('stroke', 'rgba(245,0,87,0.7)')
          .attr('stroke-width', 1.5)
          .attr('stroke-dasharray', '4,2');

        // --- Crosshair Labels ---
        // Calculate differences from median
        const loanDiff = userLoan - medianLoanAmount;
        const rateDiff = userRate - medianInterestRate;
        const loanDiffAbs = Math.abs(loanDiff).toFixed(2);
        const rateDiffAbs = Math.abs(rateDiff).toFixed(2);
        const loanLabel = `${loanDiff >= 0 ? '+' : '-'}${loanDiffAbs} ${selectedCurrency} ${loanDiff >= 0 ? 'above' : 'below'} median`;
        const rateLabel = `${rateDiff >= 0 ? '+' : '-'}${rateDiffAbs}% ${rateDiff >= 0 ? 'above' : 'below'} median`;

        const LABEL_MARGIN = 20;
        // For vertical (loan) label: always at left or right edge
        const loanLabelY = userY;
        let loanLabelX = userX > width / 2 ? LABEL_MARGIN : width - LABEL_MARGIN;
        // For horizontal (APR) label: always at top or bottom edge
        const rateLabelX = userX;
        let rateLabelY = userY > height / 2 ? LABEL_MARGIN : height - LABEL_MARGIN;

        // Draw a group with a red rounded rect and white text for the loan label
        const loanLabelGroup = g.append('g').attr('class', 'user-crosshair-x-label-group');
        const loanFontSize = 13;
        const loanPaddingX = 9;
        const loanPaddingY = 6;
        const loanText = loanLabel;
        // Render text at (0,0) to measure
        const loanTextElem = loanLabelGroup.append('text')
          .attr('x', 0)
          .attr('y', 0)
          .attr('font-size', loanFontSize)
          .attr('font-family', 'Public Sans, sans-serif')
          .attr('font-weight', 500)
          .attr('fill', '#fff')
          .attr('text-anchor', 'start')
          .text(loanText);
        const loanTextNode = loanTextElem.node();
        let loanTextWidth = 0;
        let loanTextHeight = 0;
        if (loanTextNode) {
          const bbox = loanTextNode.getBBox();
          loanTextWidth = bbox.width;
          loanTextHeight = bbox.height;
        }
        // Now position text and rect at the edge, fully visible
        let finalLoanLabelY;
        if (userY < height / 2) {
          // Crosshair in top half: label below the line
          finalLoanLabelY = userY + LABEL_MARGIN;
          // Clamp so label doesn't go off bottom edge
          if (finalLoanLabelY + loanFontSize + 2 * loanPaddingY > height) {
            finalLoanLabelY = height - loanFontSize - 2 * loanPaddingY;
          }
        } else {
          // Crosshair in bottom half: label above the line
          finalLoanLabelY = userY - LABEL_MARGIN - loanFontSize - 2 * loanPaddingY;
          // Clamp so label doesn't go off top edge
          if (finalLoanLabelY < 0) {
            finalLoanLabelY = 0;
          }
        }

        // Horizontal position: left or right edge as before
        if (userX > width / 2) {
          // Left edge
          loanLabelX = LABEL_MARGIN;
        } else {
          // Right edge
          loanLabelX = width - LABEL_MARGIN - loanTextWidth - 2 * loanPaddingX;
        }

        // Position text inside the box (vertically centered)
        const loanBoxY = finalLoanLabelY;
        const loanBoxHeight = loanFontSize + 2 * loanPaddingY;
        loanTextElem
          .attr('x', loanLabelX + loanPaddingX)
          .attr('y', loanBoxY + loanBoxHeight / 2 + loanFontSize / 2.8);
        
        // Position the box itself
        loanLabelGroup.insert('rect', 'text')
          .attr('x', loanLabelX)
          .attr('y', loanBoxY)
          .attr('width', loanTextWidth + 2 * loanPaddingX)
          .attr('height', loanBoxHeight)
          .attr('rx', 8)
          .attr('fill', 'rgba(200,30,30,0.8)')
          .attr('filter', 'url(#crosshair-label-shadow)');

        // Place rate label at top or bottom edge
        const rateLabelGroup = g.append('g').attr('class', 'user-crosshair-y-label-group');
        const rateFontSize = 13;
        const ratePaddingX = 9;
        const ratePaddingY = 6;
        const rateText = rateLabel;
        // Render text at (0,0) to measure
        const rateTextElem = rateLabelGroup.append('text')
          .attr('x', 0)
          .attr('y', 0)
          .attr('font-size', rateFontSize)
          .attr('font-family', 'Public Sans, sans-serif')
          .attr('font-weight', 500)
          .attr('fill', '#fff')
          .attr('text-anchor', 'start')
          .text(rateText);
        const rateTextNode = rateTextElem.node();
        let rateTextWidth = 0;
        let rateTextHeight = 0;
        if (rateTextNode) {
          const bbox = rateTextNode.getBBox();
          rateTextWidth = bbox.width;
          rateTextHeight = bbox.height;
        }
        // --- NEW LOGIC: Offset label box to left or right of crosshair line ---
        let finalRateLabelX;
        if (rateLabelX < width / 2) {
          // Crosshair in left half: label to the right of the line
          finalRateLabelX = rateLabelX + LABEL_MARGIN;
          // Clamp so label doesn't go off right edge
          if (finalRateLabelX + rateTextWidth + 2 * ratePaddingX > width) {
            finalRateLabelX = width - rateTextWidth - 2 * ratePaddingX;
          }
        } else {
          // Crosshair in right half: label to the left of the line
          finalRateLabelX = rateLabelX - LABEL_MARGIN - rateTextWidth - 2 * ratePaddingX;
          // Clamp so label doesn't go off left edge
          if (finalRateLabelX < 0) {
            finalRateLabelX = 0;
          }
        }
        // Vertical position: top or bottom edge as before
        if (userY > height / 2) {
          // Top edge
          rateLabelY = LABEL_MARGIN + rateFontSize + 2 * ratePaddingY;
        } else {
          // Bottom edge
          rateLabelY = height - LABEL_MARGIN;
        }
        // Position text inside the box (vertically centered)
        const rateBoxY = rateLabelY - rateFontSize - 2 * ratePaddingY;
        const rateBoxHeight = rateFontSize + 2 * ratePaddingY;
        rateTextElem
          .attr('x', finalRateLabelX + ratePaddingX)
          .attr('y', rateBoxY + rateBoxHeight / 2 + rateFontSize / 2.8);
        // Position the box itself
        rateLabelGroup.insert('rect', 'text')
          .attr('x', finalRateLabelX)
          .attr('y', rateBoxY)
          .attr('width', rateTextWidth + 2 * ratePaddingX)
          .attr('height', rateBoxHeight)
          .attr('rx', 8)
          .attr('fill', 'rgba(200,30,30,0.8)')
          .attr('filter', 'url(#crosshair-label-shadow)');

        // Add drop shadow filter definition if not present
        if (svg.select('defs').empty()) {
          svg.append('defs');
        }
        if (svg.select('defs #crosshair-label-shadow').empty()) {
          svg.select('defs').append('filter')
            .attr('id', 'crosshair-label-shadow')
            .html(`
              <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.18"/>
            `);
        }
      }

      // Anchor-based drag logic
      const drag = d3.drag<SVGCircleElement, LoanOffer>()
        .on('start', function (event, d) {
          event.sourceEvent.stopPropagation();
          isDraggingRef.current = true;
          pendingDragEndRef.current = null;
          d3.select(this).interrupt();
          d3.select(this).raise();
          // Record anchor
          dragAnchorRef.current = {
            svgX: event.x,
            svgY: event.y,
            dataX: xScale.invert(event.x),
            dataY: yScale.invert(event.y)
          };
          lastDataPosRef.current = { dataX: xScale.invert(event.x), dataY: yScale.invert(event.y) };
          // Show drag tooltip
          if (dragTooltipRef.current) {
            dragTooltipRef.current.className = '';
            dragTooltipRef.current.style.visibility = 'visible';
          }
        })
        .on('drag', function (event, d) {
          // Calculate delta from anchor
          const anchor = dragAnchorRef.current;
          if (!anchor) return;
          // If domain changed, update anchor SVG position to keep bubble under cursor
          const [xMin, xMax] = lastDomainRef.current.x;
          const [yMin, yMax] = lastDomainRef.current.y;
          const width = svgRef.current!.clientWidth - margin.left - margin.right;
          const height = svgRef.current!.clientHeight - margin.top - margin.bottom;
          const xScaleCurrent = d3.scaleLinear().domain([xMin, xMax]).range([0, width]);
          const yScaleCurrent = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);

          // Calculate new data value using delta from anchor
          const dx = event.x - anchor.svgX;
          const dy = event.y - anchor.svgY;
          const newDataX = anchor.dataX + xScaleCurrent.invert(dx) - xScaleCurrent.invert(0);
          const newDataY = anchor.dataY + yScaleCurrent.invert(dy) - yScaleCurrent.invert(0);
          lastDataPosRef.current = { dataX: newDataX, dataY: newDataY };

          // Clamp to chart area
          const clampedX = Math.max(0, Math.min(width, xScaleCurrent(newDataX)));
          const clampedY = Math.max(0, Math.min(height, yScaleCurrent(newDataY)));

          d3.select(this)
            .attr('cx', clampedX)
            .attr('cy', clampedY);
          // Move label instantly as well
          g.selectAll('.user-label')
            .attr('x', clampedX)
            .attr('y', clampedY);
          // Update drag tooltip
          if (dragTooltipRef.current && svgRef.current) {
            // Convert SVG coordinates to page coordinates
            const svgRect = svgRef.current.getBoundingClientRect();
            // Offset tooltip to top-right of bubble, with extra padding
            const tooltipX = svgRect.left + margin.left + clampedX + 28; // 24px bubble + 4px gap
            const tooltipY = svgRect.top + margin.top + clampedY - 10;
            dragTooltipRef.current.style.left = tooltipX + 'px';
            dragTooltipRef.current.style.top = tooltipY + 'px';
            dragTooltipRef.current.style.background = 'rgba(200,30,30,0.8)';
            dragTooltipRef.current.style.borderRadius = '6px';
            dragTooltipRef.current.style.padding = '6px 9px';
            dragTooltipRef.current.style.color = '#fff';
            dragTooltipRef.current.style.fontSize = '13px';
            dragTooltipRef.current.style.fontFamily = 'Public Sans, sans-serif';
            dragTooltipRef.current.style.fontWeight = '500';
            dragTooltipRef.current.style.boxShadow = '0px 4px 16px rgba(0,0,0,0.24)';
            dragTooltipRef.current.innerHTML = `<div style='margin-bottom:4px;'>Your Offer</div><div>${formatCurrency(newDataX, selectedCurrency)} ${selectedCurrency}</div><div>${newDataY.toFixed(2)}% APR</div>`;
          }
          // Throttle domain expansion
          if (typeof onUserOfferDrag === 'function') {
            throttledExpand(() => {
              onUserOfferDrag({
                loanAmount: newDataX,
                interestRate: newDataY,
                dragX: clampedX,
                dragY: clampedY,
                width,
                height,
                dragging: true
              });
            });
          }
        })
        .on('end', function (event, d) {
          isDraggingRef.current = false;
          // Use last data position for final update
          const { dataX, dataY } = lastDataPosRef.current || { dataX: userOffer.loanAmount, dataY: userOffer.interestRate };
          if (typeof onUserOfferDrag === 'function') {
            onUserOfferDrag({ loanAmount: dataX, interestRate: dataY });
          }
          dragAnchorRef.current = null;
          lastDataPosRef.current = null;
          // Hide drag tooltip
          if (dragTooltipRef.current) {
            dragTooltipRef.current.className = '';
            dragTooltipRef.current.style.visibility = 'hidden';
          }
        });

      // Update user offer point position
      const merged = userPoint.merge(userPointEnter);
      // If dragging, use lastDataPosRef for position
      if (isDraggingRef.current && lastDataPosRef.current) {
        const [xMin, xMax] = lastDomainRef.current.x;
        const [yMin, yMax] = lastDomainRef.current.y;
        const width = svgRef.current!.clientWidth - margin.left - margin.right;
        const height = svgRef.current!.clientHeight - margin.top - margin.bottom;
        const xScaleCurrent = d3.scaleLinear().domain([xMin, xMax]).range([0, width]);
        const yScaleCurrent = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);
        const { dataX, dataY } = lastDataPosRef.current;
        merged
          .attr('cx', xScaleCurrent(dataX))
          .attr('cy', yScaleCurrent(dataY))
          .call(drag)
          .raise();
        g.selectAll('.user-label').remove(); // Hide label while dragging
      } else {
        // If not dragging, update position immediately (no transition)
        merged
          .attr('cx', d => xScale(d.loanAmount))
          .attr('cy', d => yScale(d.interestRate))
          .call(drag)
          .raise();
        // Update label instantly as well
        const userLabel = g.selectAll<SVGTextElement, LoanOffer>('.user-label')
          .data([userOffer]);

        userLabel.exit().remove();

        const userLabelEnter = userLabel.enter()
          .append('text')
          .attr('class', 'user-label')
          .attr('dy', -20)
          .style('font-size', '14px')
          .style('fill', '#f50057')
          .text('Your Offer');

        userLabel.merge(userLabelEnter)
          .attr('x', d => xScale(d.loanAmount))
          .attr('y', d => yScale(d.interestRate))
          .raise();
      }
    } else {
      // Remove user point and label if no user offer
      g.selectAll('.user-point, .user-label').remove();
    }

    // After removing old heatmap code, add contour density visualization
    // Remove any existing contours
    g.selectAll('.contour').remove();

    if (showContours) {
      // Create density estimator with parameters from constants
      const density = d3.contourDensity<LoanOffer>()
        .x(d => xScale(d.loanAmount))
        .y(d => yScale(d.interestRate))
        .size([width, height])
        .bandwidth(CONTOUR_BANDWIDTH)
        .thresholds(CONTOUR_THRESHOLDS);

      // Generate contours
      const contours = density(data);

      // Create non-linear color scale using constants
      const maxDensity = d3.max(contours, d => d.value) || 1;
      const contourColorScale = d3.scalePow<string>()
        .exponent(CONTOUR_SCALE_EXPONENT)
        .domain([0, maxDensity])
        .range(CONTOUR_COLORS);

      // Draw contours
      g.selectAll('.contour')
        .data(contours)
        .enter()
        .append('path')
        .attr('class', 'contour')
        .attr('d', d3.geoPath())
        .attr('fill', d => contourColorScale(d.value))
        .attr('stroke', 'none')
        .lower(); // Ensure contours are behind points
    }
  }, [data, userOffer, selectedCurrency, onUserOfferDrag, domain, throttledExpand, chartSize, showContours]);

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%', background: 'none', boxShadow: 'none' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Market Offers</Typography>
        <ToggleButtonGroup
          className={styles.toggleButtonGroup}
          value={selectedCurrency}
          exclusive
          onChange={(_, value) => {
            if (value) onCurrencyChange(value);
          }}
          size="small"
        >
          <ToggleButton
            className={styles.toggleButton}
            value="WETH"
          >
            WETH
          </ToggleButton>
          <ToggleButton
            className={styles.toggleButton}
            value="USDC"
          >
            USDC
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box ref={containerRef} sx={{ width: '100%', height: 'calc(100% - 48px)' }}>
        <svg ref={svgRef} width={chartSize.width} height={chartSize.height} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Paper>
  );
};

export default ScatterPlot; 