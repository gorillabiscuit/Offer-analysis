import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import * as d3 from 'd3';
import { LoanOffer } from '../types';
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
  const lastDataPosRef = useRef<{ dataX: number; dataY: number } | null>(null);
  const lastDomainRef = useRef(domain);
  const throttleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasAnimatedContours = useRef(false);

  // Create tooltips once when component mounts
  useEffect(() => {
    let tooltip: HTMLDivElement | null = null;
    let dragTooltip: HTMLDivElement | null = null;

    // Create main tooltip div if it doesn't exist
    if (!tooltipRef.current) {
      tooltip = document.createElement('div');
      tooltip.style.position = 'absolute';
      tooltip.style.visibility = 'hidden';
      tooltip.style.backgroundColor = '#302B4D';
      tooltip.style.borderRadius = '4px';
      tooltip.style.padding = '12px';
      tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      tooltip.style.zIndex = '1000';
      tooltip.style.fontSize = '14px';
      tooltip.style.lineHeight = '1.4';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.maxWidth = '300px';
      tooltip.style.color = '#fff';
      document.body.appendChild(tooltip);
      tooltipRef.current = tooltip;
    }

    // Create drag tooltip div if it doesn't exist
    if (!dragTooltipRef.current) {
      dragTooltip = document.createElement('div');
      dragTooltip.style.position = 'absolute';
      dragTooltip.style.visibility = 'hidden';
      dragTooltip.style.backgroundColor = '#302B4D';
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

  // Optimize drag handler
  const handleDrag = useCallback((event: any, d: LoanOffer) => {
    if (!svgRef.current) return;
    
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;
    
    const [xMin, xMax] = lastDomainRef.current.x;
    const [yMin, yMax] = lastDomainRef.current.y;
    const xScaleCurrent = d3.scaleLinear().domain([xMin, xMax]).range([0, width]);
    const yScaleCurrent = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);
    
    const newDataX = xScaleCurrent.invert(event.x);
    const newDataY = yScaleCurrent.invert(event.y);
    
    // Clamp values to domain
    const clampedX = Math.max(xMin, Math.min(xMax, newDataX));
    const clampedY = Math.max(yMin, Math.min(yMax, newDataY));
    
    // Update last data position
    lastDataPosRef.current = { dataX: clampedX, dataY: clampedY };
    
    // Update drag tooltip
    if (dragTooltipRef.current) {
      const svgRect = svgRef.current.getBoundingClientRect();
      const tooltipX = svgRect.left + margin.left + event.x + 28;
      const tooltipY = svgRect.top + margin.top + event.y - 10;
      
      dragTooltipRef.current.style.left = tooltipX + 'px';
      dragTooltipRef.current.style.top = tooltipY + 'px';
      dragTooltipRef.current.innerHTML = `
        <div style='margin-bottom:4px;'>Your Offer</div>
        <div>${formatCurrency(clampedX, selectedCurrency)} ${selectedCurrency}</div>
        <div>${clampedY.toFixed(2)}% APR</div>
      `;
    }
    
    // Throttle domain expansion
    if (typeof onUserOfferDrag === 'function') {
      throttledExpand(() => {
        onUserOfferDrag({
          loanAmount: clampedX,
          interestRate: clampedY,
          dragX: event.x,
          dragY: event.y,
          width,
          height,
          dragging: true
        });
      });
    }
  }, [selectedCurrency, onUserOfferDrag, throttledExpand]);

  // Update drag handler
  useEffect(() => {
    if (!svgRef.current || !userOffer) return;
    
    const drag = d3.drag<SVGCircleElement, LoanOffer>()
      .on('start', function(event) {
        event.sourceEvent.stopPropagation();
        isDraggingRef.current = true;
        d3.select(this).interrupt();
        d3.select(this).raise();
        
        if (dragTooltipRef.current) {
          dragTooltipRef.current.style.visibility = 'visible';
        }
      })
      .on('drag', handleDrag)
      .on('end', function() {
        isDraggingRef.current = false;
        const { dataX, dataY } = lastDataPosRef.current || { dataX: userOffer.loanAmount, dataY: userOffer.interestRate };
        
        if (typeof onUserOfferDrag === 'function') {
          onUserOfferDrag({ loanAmount: dataX, interestRate: dataY });
        }
        
        lastDataPosRef.current = null;
        
        if (dragTooltipRef.current) {
          dragTooltipRef.current.style.visibility = 'hidden';
        }
      });
    
    const selection = d3.select(svgRef.current).selectAll<SVGCircleElement, LoanOffer>('.user-point');
    selection.call(drag as any);
      
  }, [userOffer, handleDrag, onUserOfferDrag]);

  // Reset contour animation state on data/collection/domain change
  useEffect(() => {
    hasAnimatedContours.current = false;
  }, [data, domain, selectedCurrency]);

  // Reset contour animation state when toggling contours on
  useEffect(() => {
    if (showContours) {
      hasAnimatedContours.current = false;
    }
  }, [showContours]);

  // Utility to get chart geometry and scales
  function getChartGeometry(
    chartSize: { width: number; height: number },
    domain: { x: [number, number]; y: [number, number] }
  ) {
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = chartSize.width - margin.left - margin.right;
    const height = chartSize.height - margin.top - margin.bottom;
    const [xMin, xMax] = domain.x;
    const [yMin, yMax] = domain.y;
    const xScale = d3.scaleLinear().domain([xMin, xMax]).range([0, width]);
    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);
    return { margin, width, height, xScale, yScale };
  }

  // Contour drawing and animation effect
  useEffect(() => {
    if (!svgRef.current) return;
    const { margin, width, height, xScale, yScale } = getChartGeometry(chartSize, domain);
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('g').empty() 
      ? svg
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`)
      : svg.select<SVGGElement>('g');

    // Always remove old contours first
    g.selectAll('.contour').remove();

    // Remove and return if any of these are true
    if (!showContours || data.length === 0 || width <= 0 || height <= 0) {
      return;
    }

    // Create density estimator
    const density = d3.contourDensity<LoanOffer>()
      .x(d => xScale(d.loanAmount))
      .y(d => yScale(d.interestRate))
      .size([width, height])
      .bandwidth(CONTOUR_BANDWIDTH)
      .thresholds(CONTOUR_THRESHOLDS);
    const contours = density(data);
    const maxDensity = d3.max(contours, d => d.value) || 1;
    const contourColorScale = d3.scalePow<string>()
      .exponent(CONTOUR_SCALE_EXPONENT)
      .domain([0, maxDensity])
      .range(CONTOUR_COLORS);

    // Draw contours
    const contourPaths = g.selectAll('.contour')
      .data(contours)
      .enter()
      .append('path')
      .attr('class', 'contour')
      .attr('d', d3.geoPath())
      .attr('fill', d => contourColorScale(d.value))
      .attr('stroke', 'none')
      .attr('opacity', hasAnimatedContours.current ? 1 : 0)
      .lower();

    if (!hasAnimatedContours.current) {
      contourPaths.transition()
        .delay(TRANSITION_DURATION * 0.7)
        .duration(TRANSITION_DURATION)
        .attr('opacity', 1)
        .on('end', () => {
          hasAnimatedContours.current = true;
        });
    }
  }, [data, domain, chartSize, showContours, selectedCurrency]);

  // Main chart update effect (axes, points, user bubble, labels)
  useEffect(() => {
    if (!svgRef.current || !tooltipRef.current) return;
    const { margin, width, height, xScale, yScale } = getChartGeometry(chartSize, domain);
    if (width <= 0 || height <= 0) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('g').empty() 
      ? svg
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`)
      : svg.select<SVGGElement>('g');

    // If no data, clear all points and contours and return
    if (data.length === 0) {
      g.selectAll('.data-point').remove();
      g.selectAll('.contour').remove();
      return;
    }

    // Store current scales for next update
    prevScalesRef.current = { x: xScale, y: yScale };

    // Update axes with transitions
    const xAxis = d3.axisBottom(xScale)
      .ticks(6)
      .tickFormat((domainValue: d3.NumberValue, _i: number) => {
        const d = typeof domainValue === 'number' ? domainValue : domainValue.valueOf();
        const formatted = `${formatCurrency(d, selectedCurrency)} ${selectedCurrency}`;
        console.log('[ScatterPlot] X-axis tick:', { raw: d, formatted });
        return formatted;
      });

    const yAxis = d3.axisLeft(yScale)
      .ticks(10)
      .tickFormat((domainValue: d3.NumberValue, _i: number) => {
        const d = typeof domainValue === 'number' ? domainValue : domainValue.valueOf();
        const formatted = formatPercentageAxis(d);
        console.log('[ScatterPlot] Y-axis tick:', { raw: d, formatted });
        return formatted;
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
      .attr('opacity', 0)
      .remove();

    // Add new dots
    const dotsEnter = dots.enter()
      .append('circle')
      .attr('class', 'data-point')
      .attr('r', 0) // Start with radius 0 for animation
      .attr('cx', (d: LoanOffer) => xScale(d.loanAmount))
      .attr('cy', (d: LoanOffer) => yScale(d.interestRate))
      .attr('fill', d => timeScale(d.timestamp ?? 0))
      .attr('fill-opacity', 0.55)
      .attr('stroke', d => timeScale(d.timestamp ?? 0))
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', 3)
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

    // Animate new dots to their full size
    dotsEnter.transition()
      .duration(TRANSITION_DURATION)
      .attr('r', 10);

    // Update all dots (including new ones)
    dots.merge(dotsEnter)
      .call(sel => maybeTransition(sel)
        .attr('cx', (d: LoanOffer) => xScale(d.loanAmount))
        .attr('cy', (d: LoanOffer) => yScale(d.interestRate))
        .attr('fill', (d: LoanOffer) => timeScale(d.timestamp ?? 0))
        .attr('fill-opacity', 0.35)
        .attr('r', 10)
        .attr('stroke', (d: LoanOffer) => timeScale(d.timestamp ?? 0))
        .attr('stroke-opacity', 0.8)
        .attr('stroke-width', 1)
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
        .attr('fill-opacity', 0.45)
        .attr('stroke', '#f50057')
        .attr('stroke-opacity', 0.95)
        .attr('stroke-width', 1)
        .style('cursor', 'move');

      // Update user offer point position
      const merged = userPoint.merge(userPointEnter);
      if (isDraggingRef.current && lastDataPosRef.current) {
        const { dataX, dataY } = lastDataPosRef.current;
        merged
          .attr('cx', xScale(dataX))
          .attr('cy', yScale(dataY))
          .raise();
        g.selectAll('.user-label').remove(); // Hide label while dragging
      } else {
        merged
          .attr('cx', d => xScale(d.loanAmount))
          .attr('cy', d => yScale(d.interestRate))
          .attr('fill', '#f50057')
          .attr('fill-opacity', 0.45)
          .attr('stroke', '#f50057')
          .attr('stroke-opacity', 0.95)
          .attr('stroke-width', 1)
          .raise();
        
        // Update label
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
  }, [data, userOffer, selectedCurrency, domain, chartSize]);

  // Dedicated effect for crosshairs and median labels during drag
  useEffect(() => {
    if (!svgRef.current) return;
    const { margin, width, height, xScale, yScale } = getChartGeometry(chartSize, domain);
    if (width <= 0 || height <= 0) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select<SVGGElement>('g').empty() 
      ? svg
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`)
      : svg.select<SVGGElement>('g');

    // Remove all crosshair/label elements by default
    g.selectAll('.user-crosshair-x, .user-crosshair-y, .user-crosshair-x-label, .user-crosshair-y-label').remove();
    g.selectAll('.user-crosshair-x-label-group, .user-crosshair-y-label-group').remove();

    // Only draw crosshairs/labels during drag
    if (!isDraggingRef.current || !lastDataPosRef.current) return;

    // Scales
    const { dataX: userLoan, dataY: userRate } = lastDataPosRef.current;
    const userX = xScale(userLoan);
    const userY = yScale(userRate);

    // Medians
    const { medianLoanAmount, medianInterestRate } = getMarketMedians(data);

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
    let loanLabelX = userX > width / 2 ? LABEL_MARGIN : width - LABEL_MARGIN;
    // For horizontal (APR) label: always at top or bottom edge
    let rateLabelX = userX;
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
    if (loanTextNode) {
      const bbox = loanTextNode.getBBox();
      loanTextWidth = bbox.width;
    }
    // Now position text and rect at the edge, fully visible
    let finalLoanLabelY;
    if (userY < height / 2) {
      // Crosshair in top half: label below the line
      finalLoanLabelY = userY + LABEL_MARGIN;
      if (finalLoanLabelY + loanFontSize + 2 * loanPaddingY > height) {
        finalLoanLabelY = height - loanFontSize - 2 * loanPaddingY;
      }
    } else {
      // Crosshair in bottom half: label above the line
      finalLoanLabelY = userY - LABEL_MARGIN - loanFontSize - 2 * loanPaddingY;
      if (finalLoanLabelY < 0) {
        finalLoanLabelY = 0;
      }
    }
    // Horizontal position: left or right edge as before
    if (userX > width / 2) {
      loanLabelX = LABEL_MARGIN;
    } else {
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
      .attr('fill', '#302B4D')
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
    if (rateTextNode) {
      const bbox = rateTextNode.getBBox();
      rateTextWidth = bbox.width;
    }
    // Offset label box to left or right of crosshair line
    let finalRateLabelX;
    if (rateLabelX < width / 2) {
      finalRateLabelX = rateLabelX + LABEL_MARGIN;
      if (finalRateLabelX + rateTextWidth + 2 * ratePaddingX > width) {
        finalRateLabelX = width - rateTextWidth - 2 * ratePaddingX;
      }
    } else {
      finalRateLabelX = rateLabelX - LABEL_MARGIN - rateTextWidth - 2 * ratePaddingX;
      if (finalRateLabelX < 0) {
        finalRateLabelX = 0;
      }
    }
    if (userY > height / 2) {
      rateLabelY = LABEL_MARGIN + rateFontSize + 2 * ratePaddingY;
    } else {
      rateLabelY = height - LABEL_MARGIN;
    }
    const rateBoxY = rateLabelY - rateFontSize - 2 * ratePaddingY;
    const rateBoxHeight = rateFontSize + 2 * ratePaddingY;
    rateTextElem
      .attr('x', finalRateLabelX + ratePaddingX)
      .attr('y', rateBoxY + rateBoxHeight / 2 + rateFontSize / 2.8);
    rateLabelGroup.insert('rect', 'text')
      .attr('x', finalRateLabelX)
      .attr('y', rateBoxY)
      .attr('width', rateTextWidth + 2 * ratePaddingX)
      .attr('height', rateBoxHeight)
      .attr('rx', 8)
      .attr('fill', '#302B4D')
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
  }, [chartSize, domain, selectedCurrency, data, isDraggingRef.current, lastDataPosRef.current]);

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%', background: 'none', boxShadow: 'none', position: 'relative' }}>
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
      <Box ref={containerRef} sx={{ width: '100%', height: 'calc(100% - 48px)', position: 'relative' }}>
        {data.length > 0 && (
          <svg ref={svgRef} width={chartSize.width} height={chartSize.height} style={{ width: '100%', height: '100%' }} />
        )}
        {data.length === 0 && (
          <Box sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 2,
            background: 'none',
          }}>
            <Typography variant="h6" color="text.secondary" align="center">
              {selectedCurrency === 'WETH'
                ? 'There are presently no ETH loan offers for this collection'
                : 'There are presently no USDC loan offers for this collection'}
            </Typography>
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default ScatterPlot; 