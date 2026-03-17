import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Box, Paper, Typography, Button, FormControlLabel, Switch } from '@mui/material';
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
  baselineDomain: { x: [number, number]; y: [number, number] };
  showContours?: boolean;
  onShowContoursChange?: (show: boolean) => void;
  showLoans?: boolean;
  showOffers?: boolean;
  onToggleLoans?: () => void;
  onToggleOffers?: () => void;
  onDomainChange?: (domain: { x: [number, number]; y: [number, number] }) => void;
  onResetZoom?: () => void;
  showResetZoom?: boolean;
  excludeOutliers?: boolean;
  onToggleExcludeOutliers?: () => void;
  isLightMode?: boolean;
  themeMode?: 'system' | 'light' | 'dark';
  onCycleThemeMode?: () => void;
}

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
const CHART_MARGIN = { top: 20, right: 20, bottom: 30, left: 60 };

function domainsAreClose(
  a: { x: [number, number]; y: [number, number] },
  b: { x: [number, number]; y: [number, number] },
  epsilon = 1e-6
) {
  return (
    Math.abs(a.x[0] - b.x[0]) < epsilon &&
    Math.abs(a.x[1] - b.x[1]) < epsilon &&
    Math.abs(a.y[0] - b.y[0]) < epsilon &&
    Math.abs(a.y[1] - b.y[1]) < epsilon
  );
}

function transformsAreClose(a: d3.ZoomTransform, b: d3.ZoomTransform, epsilon = 1e-6) {
  return (
    Math.abs(a.k - b.k) < epsilon &&
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon
  );
}

function getTransformForDomain(
  domain: { x: [number, number]; y: [number, number] },
  baseXScale: d3.ScaleLinear<number, number>,
  baseYScale: d3.ScaleLinear<number, number>,
  baseDomainX: [number, number]
) {
  const baseRange = baseDomainX[1] - baseDomainX[0];
  const domainRange = domain.x[1] - domain.x[0];
  if (!isFinite(domainRange) || domainRange === 0) {
    return d3.zoomIdentity;
  }

  const k = baseRange / domainRange;
  if (!isFinite(k) || k <= 0) {
    return d3.zoomIdentity;
  }

  const tx = -k * baseXScale(domain.x[0]);
  const ty = baseYScale.range()[0] - k * baseYScale(domain.y[0]);
  return d3.zoomIdentity.translate(tx, ty).scale(k);
}

const ScatterPlot: React.FC<ScatterPlotProps> = ({ 
  data = [], 
  userOffer,
  selectedCurrency,
  onCurrencyChange,
  onUserOfferDrag,
  domain,
  baselineDomain,
  showContours = true,
  onShowContoursChange,
  showLoans = true,
  showOffers = true,
  onToggleLoans,
  onToggleOffers,
  onDomainChange,
  onResetZoom,
  showResetZoom = false,
  excludeOutliers = false,
  onToggleExcludeOutliers,
  isLightMode = false,
  themeMode = 'system',
  onCycleThemeMode,
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
  const suppressZoomRef = useRef(false);
  const isViewportInteractingRef = useRef(false);
  const lastZoomEmittedDomainRef = useRef<{ x: [number, number]; y: [number, number] } | null>(null);
  const clipPathIdRef = useRef(`scatter-plot-clip-${Math.random().toString(36).slice(2, 10)}`);
  const goodZonePatternIdRef = useRef(`good-zone-pattern-${Math.random().toString(36).slice(2, 10)}`);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGRectElement, unknown> | null>(null);
  const zoomContextRef = useRef<{
    width: number;
    height: number;
    baseXScale: d3.ScaleLinear<number, number> | null;
    baseYScale: d3.ScaleLinear<number, number> | null;
  }>({
    width: 0,
    height: 0,
    baseXScale: null,
    baseYScale: null,
  });
  const suppressZoomCallbackRef = useRef(false);
  const chartColors = useMemo(
    () => ({
      paperBg: isLightMode ? '#f7f7fc' : 'none',
      title: isLightMode ? '#1f2330' : '#ffffff',
      axisStroke: isLightMode ? 'rgba(31,35,48,0.3)' : 'rgba(255,255,255,0.3)',
      axisText: isLightMode ? '#1f2330' : '#FFF',
      annotation: isLightMode ? 'rgba(31,35,48,0.75)' : 'rgba(255,255,255,0.8)',
      goodZoneStroke: isLightMode ? 'rgba(31,35,48,0.25)' : 'rgba(255,255,255,0.25)',
      goodZonePattern: isLightMode ? 'rgba(31,35,48,0.18)' : 'rgba(255,255,255,0.2)',
      goodZoneLabel: isLightMode ? 'rgba(31,35,48,0.5)' : 'rgba(255,255,255,0.5)',
      tooltipBg: isLightMode ? '#ffffff' : '#302B4D',
      tooltipText: isLightMode ? '#1f2330' : '#ffffff',
      userOfferLabelBg: isLightMode ? 'rgba(255,255,255,0.9)' : 'rgba(48, 43, 77, 0.55)',
      legendBorder: isLightMode ? 'rgba(31,35,48,0.16)' : 'rgba(255,255,255,0.16)',
      legendText: isLightMode ? '#1f2330' : '#ffffff',
      offerAccent: '#FF6B6B',
      loanAccent: isLightMode ? '#3E7B68' : '#6FAF97',
      toggleOff: isLightMode ? '#8D96A8' : '#5B6278',
    }),
    [isLightMode]
  );

  // Memoize medians and color scale
  const medians = useMemo(() => getMarketMedians(data), [data]);
  const timeScale = useMemo(() => {
    const timestamps = data.map(d => d.timestamp ?? 0);
    const minTimestamp = d3.min(timestamps) ?? 0;
    const maxTimestamp = d3.max(timestamps) ?? 0;
    return d3.scaleLinear<string>()
      .domain([minTimestamp, maxTimestamp])
      .range(["#4D96FF", "#FF6B6B"]);
  }, [data]);

  // Create tooltips once when component mounts
  useEffect(() => {
    let tooltip: HTMLDivElement | null = null;
    let dragTooltip: HTMLDivElement | null = null;

    // Create main tooltip div if it doesn't exist
    if (!tooltipRef.current) {
      tooltip = document.createElement('div');
      tooltip.style.position = 'absolute';
      tooltip.style.visibility = 'hidden';
      tooltip.style.backgroundColor = chartColors.tooltipBg;
      tooltip.style.borderRadius = '4px';
      tooltip.style.padding = '12px';
      tooltip.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      tooltip.style.zIndex = '1000';
      tooltip.style.fontSize = '14px';
      tooltip.style.lineHeight = '1.4';
      tooltip.style.pointerEvents = 'none';
      tooltip.style.maxWidth = '300px';
      tooltip.style.color = chartColors.tooltipText;
      document.body.appendChild(tooltip);
      tooltipRef.current = tooltip;
    }

    // Create drag tooltip div if it doesn't exist
    if (!dragTooltipRef.current) {
      dragTooltip = document.createElement('div');
      dragTooltip.style.position = 'absolute';
      dragTooltip.style.visibility = 'hidden';
      dragTooltip.style.backgroundColor = chartColors.tooltipBg;
      dragTooltip.style.color = chartColors.tooltipText;
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
  }, [chartColors.tooltipBg, chartColors.tooltipText]);

  useEffect(() => {
    if (tooltipRef.current) {
      tooltipRef.current.style.backgroundColor = chartColors.tooltipBg;
      tooltipRef.current.style.color = chartColors.tooltipText;
    }
    if (dragTooltipRef.current) {
      dragTooltipRef.current.style.backgroundColor = chartColors.tooltipBg;
      dragTooltipRef.current.style.color = chartColors.tooltipText;
    }
  }, [chartColors.tooltipBg, chartColors.tooltipText]);

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

  const drawDragCrosshairs = useCallback((
    g: d3.Selection<SVGGElement, unknown, null, undefined>,
    width: number,
    height: number,
    xScale: d3.ScaleLinear<number, number>,
    yScale: d3.ScaleLinear<number, number>
  ) => {
    g.selectAll('.user-crosshair-x, .user-crosshair-y, .user-crosshair-x-label, .user-crosshair-y-label').remove();
    g.selectAll('.user-crosshair-x-label-group, .user-crosshair-y-label-group').remove();
    if (!lastDataPosRef.current) return;

    const { dataX: userLoan, dataY: userRate } = lastDataPosRef.current;
    const userX = xScale(userLoan);
    const userY = yScale(userRate);
    const { medianLoanAmount, medianInterestRate } = medians;
    const loanDiff = userLoan - medianLoanAmount;
    const rateDiff = userRate - medianInterestRate;
    const loanLabel = `${loanDiff >= 0 ? '+' : '-'}${Math.abs(loanDiff).toFixed(2)} ${selectedCurrency} ${loanDiff >= 0 ? 'above' : 'below'} median`;
    const rateLabel = `${rateDiff >= 0 ? '+' : '-'}${Math.abs(rateDiff).toFixed(2)}% ${rateDiff >= 0 ? 'above' : 'below'} median`;

    g.append('line')
      .attr('class', 'user-crosshair-x')
      .attr('x1', userX)
      .attr('x2', userX)
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', 'rgba(245,0,87,0.7)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2');

    g.append('line')
      .attr('class', 'user-crosshair-y')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', userY)
      .attr('y2', userY)
      .attr('stroke', 'rgba(245,0,87,0.7)')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2');

    g.append('text')
      .attr('class', 'user-crosshair-x-label')
      .attr('x', Math.min(width - 8, userX + 8))
      .attr('y', 14)
      .attr('fill', '#fff')
      .attr('font-size', 12)
      .text(loanLabel);

    g.append('text')
      .attr('class', 'user-crosshair-y-label')
      .attr('x', width - 8)
      .attr('y', Math.max(14, userY - 8))
      .attr('fill', '#fff')
      .attr('font-size', 12)
      .attr('text-anchor', 'end')
      .text(rateLabel);
  }, [medians, selectedCurrency]);

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

  // Canonical d3.zoom integration using a dedicated background capture layer.
  useEffect(() => {
    if (!svgRef.current || !onDomainChange) return;
    const { margin, width, height } = getChartGeometry(chartSize, baselineDomain);
    if (width <= 0 || height <= 0) return;

    const svgSelection = d3.select(svgRef.current);
    const g = svgSelection.select<SVGGElement>('g').empty()
      ? svgSelection
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
          .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`)
      : svgSelection.select<SVGGElement>('g');

    const zoomCapture = g.selectAll<SVGRectElement, null>('.zoom-capture')
      .data([null])
      .join('rect')
      .attr('class', 'zoom-capture')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'transparent')
      .style('pointer-events', 'all')
      .style('cursor', 'grab')
      .lower();

    const baseXScale = d3.scaleLinear().domain(baselineDomain.x).range([0, width]);
    const baseYScale = d3.scaleLinear().domain(baselineDomain.y).range([height, 0]);
    zoomContextRef.current = { width, height, baseXScale, baseYScale };

    if (!zoomBehaviorRef.current) {
      zoomBehaviorRef.current = d3
        .zoom<SVGRectElement, unknown>()
        .scaleExtent([0.5, 40])
        .filter((event: any) => {
          if (suppressZoomRef.current) return false;
          if (event.type === 'dblclick') return false;
          if (event.type === 'mousedown' && event.button !== 0) return false;
          return event.type === 'wheel' || event.type === 'mousedown' || event.type === 'touchstart';
        })
        .on('start', () => {
          isViewportInteractingRef.current = true;
          zoomCapture.style('cursor', 'grabbing');
        })
        .on('zoom', (event) => {
          if (suppressZoomCallbackRef.current) return;
          const zoomContext = zoomContextRef.current;
          if (!zoomContext.baseXScale || !zoomContext.baseYScale) return;

          const transformedX = event.transform.rescaleX(zoomContext.baseXScale);
          const transformedY = event.transform.rescaleY(zoomContext.baseYScale);
          const nextDomain = {
            x: [transformedX.invert(0), transformedX.invert(zoomContext.width)] as [number, number],
            y: [transformedY.invert(zoomContext.height), transformedY.invert(0)] as [number, number],
          };

          if (lastZoomEmittedDomainRef.current && domainsAreClose(lastZoomEmittedDomainRef.current, nextDomain)) {
            return;
          }

          lastZoomEmittedDomainRef.current = nextDomain;
          onDomainChange(nextDomain);
        })
        .on('end', () => {
          isViewportInteractingRef.current = false;
          zoomCapture.style('cursor', 'grab');
        });
    }
    zoomCapture.call(zoomBehaviorRef.current as any);
    zoomCapture.on('dblclick.zoom', null);

    const desiredTransform = getTransformForDomain(domain, baseXScale, baseYScale, baselineDomain.x);
    const zoomCaptureNode = zoomCapture.node();
    if (!zoomCaptureNode) return;
    const currentTransform = d3.zoomTransform(zoomCaptureNode);
    if (!transformsAreClose(currentTransform, desiredTransform)) {
      suppressZoomCallbackRef.current = true;
      zoomCapture.call((zoomBehaviorRef.current as any).transform, desiredTransform);
      suppressZoomCallbackRef.current = false;
    }

    return () => {
      // Keep zoom behavior bound; we only clear on unmount.
    };
  }, [chartSize, domain, baselineDomain, onDomainChange]);

  useEffect(() => {
    return () => {
      if (svgRef.current) {
        d3.select(svgRef.current).selectAll<SVGRectElement, unknown>('.zoom-capture').on('.zoom', null);
      }
    };
  }, []);

  // Optimize drag handler
  const handleDrag = useCallback((event: any, _d: LoanOffer, dragElement?: SVGCircleElement) => {
    if (!svgRef.current) return;
    
    const margin = CHART_MARGIN;
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

    // Update bubble position directly during drag to avoid React re-render pressure.
    if (dragElement) {
      d3.select(dragElement)
        .attr('cx', xScaleCurrent(clampedX))
        .attr('cy', yScaleCurrent(clampedY))
        .raise();
    }

    const g = d3.select(svgRef.current).select<SVGGElement>('g');
    if (!g.empty()) {
      drawDragCrosshairs(g, width, height, xScaleCurrent, yScaleCurrent);
    }
    
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
  }, [selectedCurrency, onUserOfferDrag, throttledExpand, drawDragCrosshairs]);

  // Update drag handler
  useEffect(() => {
    if (!svgRef.current || !userOffer) return;
    
    const drag = d3.drag<SVGCircleElement, LoanOffer>()
      .filter((event: any) => event.button === 0)
      .on('start', function(event) {
        event.sourceEvent.stopPropagation();
        isDraggingRef.current = true;
        suppressZoomRef.current = true;
        d3.select(this).interrupt();
        d3.select(this).raise();
        d3.select(svgRef.current).selectAll('.user-label, .user-label-group').remove();
        
        if (dragTooltipRef.current) {
          dragTooltipRef.current.style.visibility = 'visible';
        }
      })
      .on('drag', function(event, d) {
        handleDrag(event, d, this);
      })
      .on('end', function() {
        isDraggingRef.current = false;
        suppressZoomRef.current = false;
        const { dataX, dataY } = lastDataPosRef.current || { dataX: userOffer.loanAmount, dataY: userOffer.interestRate };
        
        if (typeof onUserOfferDrag === 'function') {
          onUserOfferDrag({ loanAmount: dataX, interestRate: dataY });
        }
        
        const g = d3.select(svgRef.current).select<SVGGElement>('g');
        if (!g.empty()) {
          g.selectAll('.user-crosshair-x, .user-crosshair-y, .user-crosshair-x-label, .user-crosshair-y-label').remove();
          g.selectAll('.user-crosshair-x-label-group, .user-crosshair-y-label-group').remove();
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
    const margin = CHART_MARGIN;
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
    const defs = svg.select<SVGDefsElement>('defs').empty()
      ? svg.append('defs')
      : svg.select<SVGDefsElement>('defs');
    const goodZonePattern = defs
      .selectAll<SVGPatternElement, null>(`#${goodZonePatternIdRef.current}`)
      .data([null])
      .join('pattern')
      .attr('id', goodZonePatternIdRef.current)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 8)
      .attr('height', 8)
      .attr('patternTransform', 'rotate(45)');
    goodZonePattern
      .selectAll<SVGLineElement, null>('line')
      .data([null])
      .join('line')
      .attr('x1', 0)
      .attr('y1', 0)
      .attr('x2', 0)
      .attr('y2', 8)
      .attr('stroke', chartColors.goodZonePattern)
      .attr('stroke-width', 2);
    const clipPathUrl = `url(#${clipPathIdRef.current})`;

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
      .attr('clip-path', clipPathUrl)
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
  }, [data, domain, chartSize, showContours, selectedCurrency, chartColors.goodZonePattern]);

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
    const clipPathId = clipPathIdRef.current;
    const clipPathUrl = `url(#${clipPathId})`;
    const defs = svg.select<SVGDefsElement>('defs').empty()
      ? svg.append('defs')
      : svg.select<SVGDefsElement>('defs');
    const clipPath = defs.selectAll<SVGClipPathElement, null>(`#${clipPathId}`)
      .data([null])
      .join('clipPath')
      .attr('id', clipPathId);
    clipPath
      .selectAll<SVGRectElement, null>('rect')
      .data([null])
      .join('rect')
      .attr('x', 0)
      .attr('y', 0)
      .attr('width', width)
      .attr('height', height);

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
      return (isDraggingRef.current || isViewportInteractingRef.current)
        ? selection
        : selection.transition().duration(TRANSITION_DURATION);
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
      .attr('stroke', chartColors.axisStroke);
    // Axis text: pure white
    g.selectAll('.x-axis text, .y-axis text')
      .attr('fill', chartColors.axisText);
    // Remove axis labels (no .x-label or .y-label)

    // Calculate statistics
    const { medianLoanAmount, medianInterestRate } = medians;
    
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

    // Highlight "good offer" guidance zone:
    // right of median loan amount AND below median interest rate.
    const goodZoneX = xScale(medianLoanAmount);
    const goodZoneY = yScale(medianInterestRate);
    const goodZoneWidth = Math.max(0, width - goodZoneX);
    const goodZoneHeight = Math.max(0, height - goodZoneY);

    const goodZone = g.select<SVGRectElement>('.good-offer-zone');
    if (goodZone.empty()) {
      g.append('rect')
        .attr('class', 'good-offer-zone')
        .attr('x', goodZoneX)
        .attr('y', goodZoneY)
        .attr('width', goodZoneWidth)
        .attr('height', goodZoneHeight)
        .attr('fill', `url(#${goodZonePatternIdRef.current})`)
        .attr('stroke', chartColors.goodZoneStroke)
        .attr('stroke-dasharray', '3,3')
        .attr('pointer-events', 'none')
        .lower();
    } else {
      maybeTransition(goodZone)
        .attr('x', goodZoneX)
        .attr('y', goodZoneY)
        .attr('width', goodZoneWidth)
        .attr('height', goodZoneHeight)
        .attr('fill', `url(#${goodZonePatternIdRef.current})`)
        .attr('stroke', chartColors.goodZoneStroke);
      goodZone.lower();
    }

    const goodZoneLabel = g.select<SVGTextElement>('.good-offer-zone-label');
    const labelX = Math.max(8, Math.min(width - 8, goodZoneX + goodZoneWidth - 8));
    const labelY = Math.max(14, Math.min(height - 8, goodZoneY + goodZoneHeight - 8));
    if (goodZoneLabel.empty()) {
      g.append('text')
        .attr('class', 'good-offer-zone-label')
        .attr('x', labelX)
        .attr('y', labelY)
        .style('font-size', '12px')
        .style('fill', chartColors.goodZoneLabel)
        .style('font-weight', '600')
        .attr('text-anchor', 'end')
        .attr('pointer-events', 'none')
        .text('more likely to be accepted');
    } else {
      maybeTransition(goodZoneLabel)
        .attr('x', labelX)
        .attr('y', labelY)
        .attr('text-anchor', 'end')
        .style('fill', chartColors.goodZoneLabel)
        .text('more likely to be accepted');
    }

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
          .style('fill', chartColors.annotation)
          .text(text);
      } else {
        maybeTransition(annotation)
          .attr('x', x)
          .attr('y', y)
          .style('fill', chartColors.annotation)
          .text(text);
      }
    };

    // Update median annotations
    updateAnnotation('median-x-annotation', xScale(medianLoanAmount) + 20, 15, `Median: ${formatCurrency(medianLoanAmount, selectedCurrency)} ${selectedCurrency === 'WETH' ? 'wETH' : selectedCurrency}`);
    updateAnnotation('median-y-annotation', width - 5, yScale(medianInterestRate) - 20, `Median: ${formatPercentageAxis(medianInterestRate)}`, 'end');

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
      .attr('clip-path', clipPathUrl)
      .attr('r', 0) // Start with radius 0 for animation
      .attr('cx', (d: LoanOffer) => xScale(d.loanAmount))
      .attr('cy', (d: LoanOffer) => yScale(d.interestRate))
      .attr('fill', (d: LoanOffer) => (d.marketType === 'loan' ? chartColors.loanAccent : timeScale(d.timestamp ?? 0)))
      .attr('fill-opacity', (d: LoanOffer) => (d.marketType === 'loan' ? 0.2 : 0.55))
      .attr('stroke', (d: LoanOffer) => (d.marketType === 'loan' ? chartColors.loanAccent : timeScale(d.timestamp ?? 0)))
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', (d: LoanOffer) => (d.marketType === 'loan' ? 1.4 : 3))
      .attr('stroke-dasharray', (d: LoanOffer) => (d.marketType === 'loan' ? '3,2' : null))
      .on('mouseover', function(event, d) {
        if (!tooltipRef.current) return;
        const tooltip = tooltipRef.current;
        tooltip.style.visibility = 'visible';
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
        if (d) {
          const dd = d as LoanOfferWithDepth;
          tooltip.innerHTML = `
            <div style="display:grid; grid-template-columns:max-content auto; column-gap:10px; row-gap:4px; align-items:center;">
              <strong style="text-align:right;">Loan Amount:</strong>
              <span style="text-align:left;">${formatCurrency(dd.loanAmount, selectedCurrency)} ${selectedCurrency}</span>
              <strong style="text-align:right;">Interest Rate:</strong>
              <span style="text-align:left;">${dd.interestRate.toFixed(2)}%</span>
              <strong style="text-align:right;">Duration:</strong>
              <span style="text-align:left;">${Math.round(dd.duration ?? 0)} days</span>
              <strong style="text-align:right;">Loan created:</strong>
              <span style="text-align:left;">${formatAge(dd.timestamp)}</span>
              <strong style="text-align:right;">Loans Available:</strong>
              <span style="text-align:left;">${dd.depth && dd.depth > 1 ? dd.depth : 1}</span>
            </div>
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
        .attr('clip-path', clipPathUrl)
        .attr('cx', (d: LoanOffer) => xScale(d.loanAmount))
        .attr('cy', (d: LoanOffer) => yScale(d.interestRate))
        .attr('fill', (d: LoanOffer) => (d.marketType === 'loan' ? chartColors.loanAccent : timeScale(d.timestamp ?? 0)))
        .attr('fill-opacity', (d: LoanOffer) => (d.marketType === 'loan' ? 0.18 : 0.35))
        .attr('r', 10)
        .attr('stroke', (d: LoanOffer) => (d.marketType === 'loan' ? chartColors.loanAccent : timeScale(d.timestamp ?? 0)))
        .attr('stroke-opacity', 0.8)
        .attr('stroke-width', (d: LoanOffer) => (d.marketType === 'loan' ? 1.2 : 1))
        .attr('stroke-dasharray', (d: LoanOffer) => (d.marketType === 'loan' ? '3,2' : null))
      );

    // Update user offer point if it exists
    if (userOffer) {
      const userPoint = g.selectAll<SVGCircleElement, LoanOffer>('.user-point')
        .data([userOffer]);

      userPoint.exit().remove();

      const userPointEnter = userPoint.enter()
        .append('circle')
        .attr('class', 'user-point');
      applyUserOfferBubbleAttrs(userPointEnter);
      userPointEnter.attr('clip-path', clipPathUrl);

      // Update user offer point position
      const merged = userPoint.merge(userPointEnter);
      applyUserOfferBubbleAttrs(merged);
      merged.attr('clip-path', clipPathUrl);
      if (isDraggingRef.current && lastDataPosRef.current) {
        const { dataX, dataY } = lastDataPosRef.current;
        merged
          .attr('cx', xScale(dataX))
          .attr('cy', yScale(dataY))
          .raise();
        g.selectAll('.user-label, .user-label-group').remove(); // Hide label while dragging
      } else {
        merged
          .attr('cx', d => xScale(d.loanAmount))
          .attr('cy', d => yScale(d.interestRate))
          .raise();
        
        // Update label group (background + text)
        const userLabelGroup = g.selectAll<SVGGElement, LoanOffer>('.user-label-group')
          .data([userOffer]);

        userLabelGroup.exit().remove();

        const userLabelGroupEnter = userLabelGroup.enter()
          .append('g')
          .attr('class', 'user-label-group');

        userLabelGroupEnter
          .append('rect')
          .attr('class', 'user-label-background')
          .attr('fill', chartColors.userOfferLabelBg)
          .attr('rx', 3)
          .attr('ry', 3);

        userLabelGroupEnter
          .append('text')
          .attr('class', 'user-label')
          .style('font-size', '14px')
          .style('fill', '#f50057')
          .style('font-weight', '600')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'middle')
          .text('Your Offer');

        const mergedLabelGroup = userLabelGroup.merge(userLabelGroupEnter)
          .attr('transform', d => `translate(${xScale(d.loanAmount)},${yScale(d.interestRate) - 20})`)
          .raise();

        mergedLabelGroup.each(function () {
          const group = d3.select(this);
          const text = group.select<SVGTextElement>('text.user-label');
          const rect = group.select<SVGRectElement>('rect.user-label-background');
          const textNode = text.node();
          if (!textNode) return;

          const bbox = textNode.getBBox();
          const paddingX = 8;
          const paddingY = 4;

          rect
            .attr('fill', chartColors.userOfferLabelBg)
            .attr('x', bbox.x - paddingX)
            .attr('y', bbox.y - paddingY)
            .attr('width', bbox.width + paddingX * 2)
            .attr('height', bbox.height + paddingY * 2);
        });
      }
    } else {
      // Remove user point and label if no user offer
      g.selectAll('.user-point, .user-label, .user-label-group').remove();
    }
  }, [data, userOffer, selectedCurrency, domain, chartSize, medians, timeScale, chartColors.axisStroke, chartColors.axisText, chartColors.goodZoneStroke, chartColors.goodZoneLabel, chartColors.annotation, chartColors.userOfferLabelBg]);

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
    const { medianLoanAmount, medianInterestRate } = medians;

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
      .attr('fill', chartColors.tooltipBg)
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
  }, [chartSize, domain, selectedCurrency, data, userOffer, medians, chartColors.tooltipBg]);

  // DRY: Function to apply all attributes for the user offer bubble
  function applyUserOfferBubbleAttrs(sel: d3.Selection<SVGCircleElement, LoanOffer, any, any>) {
    sel
      .attr('r', 12)
      .attr('fill', '#f50057')
      .attr('fill-opacity', 0.45)
      .attr('stroke', '#f50057')
      .attr('stroke-opacity', 0.95)
      .attr('stroke-width', 1)
      .style('cursor', 'move');
  }

  return (
    <Paper elevation={3} sx={{ p: 2, height: '100%', background: chartColors.paperBg, boxShadow: 'none', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ color: chartColors.title }}>Market Offers</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant={themeMode === 'system' ? 'outlined' : 'contained'}
            onClick={onCycleThemeMode}
            sx={{
              minWidth: 'auto',
              ...(isLightMode
                ? {
                    backgroundColor: '#1f2330',
                    color: '#ffffff',
                    '&:hover': { backgroundColor: '#11131b' },
                  }
                : themeMode !== 'system'
                  ? {
                      backgroundColor: '#ffffff',
                      color: '#1f2330',
                      '&:hover': { backgroundColor: '#eceff7' },
                    }
                  : {}),
            }}
          >
            {themeMode === 'system'
              ? 'Theme: System'
              : themeMode === 'light'
                ? 'Theme: Light'
                : 'Theme: Dark'}
          </Button>
          <Button
            size="small"
            variant={excludeOutliers ? 'contained' : 'outlined'}
            onClick={onToggleExcludeOutliers}
            sx={{
              minWidth: 'auto',
              ...(isLightMode
                ? excludeOutliers
                  ? {
                      backgroundColor: '#1f2330',
                      color: '#ffffff',
                      '&:hover': { backgroundColor: '#11131b' },
                    }
                  : {
                      color: '#1f2330',
                      borderColor: 'rgba(31,35,48,0.35)',
                      '&:hover': {
                        borderColor: '#1f2330',
                        backgroundColor: 'rgba(31,35,48,0.06)',
                      },
                    }
                : {}),
            }}
          >
            Exclude Outliers
          </Button>
          {showResetZoom && (
            <Button
              size="small"
              variant="outlined"
              onClick={onResetZoom}
              sx={{
                minWidth: 'auto',
                ...(isLightMode
                  ? {
                      color: '#1f2330',
                      borderColor: 'rgba(31,35,48,0.35)',
                      '&:hover': {
                        borderColor: '#1f2330',
                        backgroundColor: 'rgba(31,35,48,0.06)',
                      },
                    }
                  : {}),
              }}
            >
              Reset Zoom
            </Button>
          )}
          <Box sx={{ display: 'none' }}>
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
        </Box>
      </Box>
      <Box ref={containerRef} sx={{ width: '100%', flex: 1, minHeight: 0, position: 'relative' }}>
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
      <Box
        sx={{
          mt: 1,
          pt: 1,
          borderTop: `1px solid ${chartColors.legendBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={showOffers}
                onChange={() => onToggleOffers?.()}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: chartColors.offerAccent,
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: chartColors.offerAccent,
                    opacity: 1,
                  },
                  '& .MuiSwitch-track': {
                    backgroundColor: chartColors.toggleOff,
                    opacity: 1,
                  },
                }}
              />
            }
            label="Offers"
            sx={{
              m: 0,
              '& .MuiFormControlLabel-label': {
                color: showOffers ? chartColors.offerAccent : chartColors.toggleOff,
                fontWeight: 600,
                fontSize: '0.9rem',
              },
            }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={showLoans}
                onChange={() => onToggleLoans?.()}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: chartColors.loanAccent,
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: chartColors.loanAccent,
                    opacity: 1,
                  },
                  '& .MuiSwitch-track': {
                    backgroundColor: chartColors.toggleOff,
                    opacity: 1,
                  },
                }}
              />
            }
            label="Loans"
            sx={{
              m: 0,
              '& .MuiFormControlLabel-label': {
                color: showLoans ? chartColors.loanAccent : chartColors.toggleOff,
                fontWeight: 600,
                fontSize: '0.9rem',
              },
            }}
          />
        </Box>
        {onShowContoursChange && (
          <FormControlLabel
            control={
              <Switch
                checked={showContours}
                onChange={(event) => onShowContoursChange(event.target.checked)}
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': {
                    color: '#FFFFFF',
                  },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                    backgroundColor: '#FFFFFF',
                    opacity: 1,
                  },
                  '& .MuiSwitch-track': {
                    backgroundColor: chartColors.toggleOff,
                    opacity: 1,
                  },
                }}
              />
            }
            label="Show Loan Depth"
            sx={{
              m: 0,
              '& .MuiFormControlLabel-label': {
                color: showContours ? '#FFFFFF' : chartColors.toggleOff,
                fontWeight: 600,
                fontSize: '0.9rem',
              },
            }}
          />
        )}
      </Box>
    </Paper>
  );
};

export default ScatterPlot; 