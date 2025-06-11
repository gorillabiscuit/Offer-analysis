import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Box, Paper, Typography, FormControlLabel, Switch } from '@mui/material';
import * as d3 from 'd3';
import { LoanOffer } from '../types';
import { Currency } from '../hooks/useLoanOffers';
import { getMarketMedians } from '../utils/median';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import styles from './ChartLayout.module.css';

interface ScatterPlotProps {
  data?: LoanOffer[];
  userOffer?: LoanOffer;
  selectedCurrency: Currency;
  onCurrencyChange: (currency: Currency) => void;
  onUserOfferDrag?: (update: { loanAmount: number; interestRate: number; dragX?: number; dragY?: number; width?: number; height?: number; dragging?: boolean }) => void;
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

    // === Axis styling for design ===
    // Axis lines: white at 30% opacity
    g.selectAll('.x-axis path, .x-axis line, .y-axis path, .y-axis line')
      .attr('stroke', 'rgba(255,255,255,0.3)');
    // Axis text: pure white
    g.selectAll('.x-axis text, .y-axis text')
      .attr('fill', '#FFF');
    // Axis labels: #fff at 50% opacity
    g.selectAll('.x-label, .y-label')
      .attr('fill', 'rgba(255,255,255,0.5)');

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
      .attr('r', 5)
      // Color by age
      .attr('fill', d => timeScale(d.timestamp ?? 0))
      .attr('opacity', 0.7)
      .on('mouseover', function(event, d) {
        if (!tooltipRef.current) return;
        const tooltip = tooltipRef.current;
        tooltip.style.visibility = 'visible';
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
        tooltip.innerHTML = `
          <strong>Loan Amount:</strong> ${d.loanAmount} ${selectedCurrency}<br/>
          <strong>Interest Rate:</strong> ${d.interestRate}%<br/>
          <strong>Duration:</strong> ${d.duration} days<br/>
          <strong>Loan created:</strong> ${formatAge(d.timestamp)}
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
        .attr('r', 7)
        .attr('fill', '#f50057')
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .style('cursor', 'move');

      // --- Crosshairs ---
      g.selectAll('.user-crosshair-x, .user-crosshair-y, .user-crosshair-x-label, .user-crosshair-y-label').remove();

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

        // For vertical (loan) label: if in right half, place at left; if in left half, place at right
        const loanLabelX = userX > width / 2 ? 20 : width - 20;
        const loanLabelY = userY;
        // For horizontal (APR) label: if in bottom half, place at top+20; if in top half, place at bottom-20
        // Also, move horizontally 20px away from the crosshair: right if left half, left if right half
        const rateLabelY = userY > height / 2 ? 40 : height - 40;
        const rateLabelX = userX < width / 2 ? userX + 20 : userX - 20;

        // Place loan label
        g.append('text')
          .attr('class', 'user-crosshair-x-label')
          .attr('x', loanLabelX)
          .attr('y', loanLabelY - 6)
          .attr('fill', 'rgba(245,0,87,0.7)')
          .attr('font-size', 12)
          .attr('font-weight', 'bold')
          .attr('text-anchor', loanLabelX < width / 2 ? 'start' : 'end')
          .text(loanLabel);
        // Place rate label
        g.append('text')
          .attr('class', 'user-crosshair-y-label')
          .attr('x', rateLabelX)
          .attr('y', rateLabelY)
          .attr('fill', 'rgba(245,0,87,0.7)')
          .attr('font-size', 12)
          .attr('font-weight', 'bold')
          .attr('text-anchor', rateLabelX < width / 2 ? 'start' : 'end')
          .text(rateLabel);
        // --- End Crosshairs ---
      }

      // Anchor-based drag logic
      const drag = d3.drag<SVGCircleElement, LoanOffer>()
        .on('start', function (event, d) {
          event.sourceEvent.stopPropagation();
          isDraggingRef.current = true;
          pendingDragEndRef.current = null;
          d3.select(this).interrupt();
          d3.select(this).raise().attr('stroke', '#000');
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
            dragTooltipRef.current.innerHTML = `<div style='margin-bottom:4px;'>Your Offer</div><div>${newDataX.toLocaleString(undefined, {maximumFractionDigits: 2})} ${selectedCurrency}</div><div>${newDataY.toFixed(2)}% APR</div>`;
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
          d3.select(this).attr('stroke', '#fff');
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
          .attr('dy', -10)
          .style('font-size', '12px')
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
  }, [data, userOffer, selectedCurrency, onUserOfferDrag, domain, throttledExpand, chartSize]);

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%', background: 'none', boxShadow: 'none' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ color: '#fff' }}>Market Offers</Typography>
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
            sx={{
              color: 'rgba(255,255,255,0.8)',
              background: 'transparent',
              px: '30px',
              '&.Mui-selected': {
                color: '#fff',
                background: '#221E37',
              },
              '&:hover': {
                background: 'rgba(34,30,55,0.7)',
              },
            }}
          >
            WETH
          </ToggleButton>
          <ToggleButton
            className={styles.toggleButton}
            value="USDC"
            sx={{
              color: 'rgba(255,255,255,0.8)',
              background: 'transparent',
              px: '30px',
              '&.Mui-selected': {
                color: '#fff',
                background: '#221E37',
              },
              '&:hover': {
                background: 'rgba(34,30,55,0.7)',
              },
            }}
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