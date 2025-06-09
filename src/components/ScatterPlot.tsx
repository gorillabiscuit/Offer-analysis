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

const ScatterPlot: React.FC<ScatterPlotProps> = ({ 
  data = [], 
  userOffer,
  selectedCurrency,
  onCurrencyChange 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!svgRef.current || data.length === 0 || !tooltipRef.current) return;

    // Clear previous content
    d3.select(svgRef.current).selectAll('*').remove();

    // Set up dimensions
    const margin = { top: 20, right: 20, bottom: 60, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = svgRef.current.clientHeight - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleLinear()
      .domain([0, d3.max(data, (d: LoanOffer) => d.loanAmount) || 0])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, (d: LoanOffer) => d.interestRate) || 0])
      .range([height, 0]);

    // Calculate statistics
    const loanAmounts = data.map(d => d.loanAmount).sort((a, b) => a - b);
    const interestRates = data.map(d => d.interestRate).sort((a, b) => a - b);
    
    const medianLoanAmount = d3.median(loanAmounts) || 0;
    const medianInterestRate = d3.median(interestRates) || 0;
    
    const q1LoanAmount = d3.quantile(loanAmounts, 0.25) || 0;
    const q3LoanAmount = d3.quantile(loanAmounts, 0.75) || 0;
    const q1InterestRate = d3.quantile(interestRates, 0.25) || 0;
    const q3InterestRate = d3.quantile(interestRates, 0.75) || 0;

    // Add axes
    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3.axisLeft(yScale);

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis);

    svg.append('g')
      .call(yAxis);

    // Add axis labels
    svg.append('text')
      .attr('transform', `translate(${width / 2}, ${height + margin.bottom - 10})`)
      .style('text-anchor', 'middle')
      .text('Loan Amount (ETH/USDC)');

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -(height / 2))
      .style('text-anchor', 'middle')
      .text('Interest Rate (%)');

    // Add reference lines for quartiles
    const addReferenceLine = (x1: number, x2: number, y1: number, y2: number, color: string, dashArray: string) => {
      svg.append('line')
        .attr('x1', x1)
        .attr('x2', x2)
        .attr('y1', y1)
        .attr('y2', y2)
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', dashArray);
    };

    // Add median lines
    addReferenceLine(xScale(medianLoanAmount), xScale(medianLoanAmount), 0, height, '#666', '5,5');
    addReferenceLine(0, width, yScale(medianInterestRate), yScale(medianInterestRate), '#666', '5,5');

    // Add quartile lines
    addReferenceLine(xScale(q1LoanAmount), xScale(q1LoanAmount), 0, height, '#999', '2,2');
    addReferenceLine(xScale(q3LoanAmount), xScale(q3LoanAmount), 0, height, '#999', '2,2');
    addReferenceLine(0, width, yScale(q1InterestRate), yScale(q1InterestRate), '#999', '2,2');
    addReferenceLine(0, width, yScale(q3InterestRate), yScale(q3InterestRate), '#999', '2,2');

    // Add statistical annotations
    const addAnnotation = (x: number, y: number, text: string, anchor: string = 'start') => {
      svg.append('text')
        .attr('x', x)
        .attr('y', y)
        .attr('text-anchor', anchor)
        .style('font-size', '12px')
        .style('fill', '#666')
        .text(text);
    };

    // Add median annotations
    addAnnotation(xScale(medianLoanAmount) + 5, 15, `Median: ${medianLoanAmount.toFixed(2)} ETH`);
    addAnnotation(width - 5, yScale(medianInterestRate) - 5, `Median: ${medianInterestRate.toFixed(2)}%`, 'end');

    // Add quartile annotations
    addAnnotation(xScale(q1LoanAmount) + 5, 30, `Q1: ${q1LoanAmount.toFixed(2)} ETH`);
    addAnnotation(xScale(q3LoanAmount) + 5, 45, `Q3: ${q3LoanAmount.toFixed(2)} ETH`);
    addAnnotation(width - 5, yScale(q1InterestRate) - 20, `Q1: ${q1InterestRate.toFixed(2)}%`, 'end');
    addAnnotation(width - 5, yScale(q3InterestRate) - 35, `Q3: ${q3InterestRate.toFixed(2)}%`, 'end');

    // Add dots with enhanced hover effects and tooltips
    svg.selectAll('circle')
      .data(data)
      .enter()
      .append('circle')
      .attr('cx', (d: LoanOffer) => xScale(d.loanAmount))
      .attr('cy', (d: LoanOffer) => yScale(d.interestRate))
      .attr('r', 5)
      .style('fill', '#1976d2')
      .style('opacity', 0.7)
      .style('cursor', 'pointer')
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
            <div style="margin-bottom: 4px;"><strong>Loan Amount:</strong> ${d.loanAmount.toFixed(2)} ${d.currency || 'ETH'}</div>
            <div style="margin-bottom: 4px;"><strong>Interest Rate:</strong> ${d.interestRate.toFixed(2)}%</div>
            <div style="margin-bottom: 4px;"><strong>Duration:</strong> ${d.duration} days</div>
            ${d.lender ? `<div style="margin-bottom: 4px;"><strong>Lender:</strong> ${d.lender}</div>` : ''}
            ${d.collection ? `<div style="margin-bottom: 4px;"><strong>Collection:</strong> ${d.collection}</div>` : ''}
            ${d.maximumRepayment ? `<div style="margin-bottom: 4px;"><strong>Max Repayment:</strong> ${d.maximumRepayment.toFixed(2)} ${d.currency || 'ETH'}</div>` : ''}
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

    // Add user offer point with smooth transitions
    if (userOffer) {
      const userPoint = svg.append('circle')
        .attr('cx', xScale(userOffer.loanAmount))
        .attr('cy', yScale(userOffer.interestRate))
        .attr('r', 8)
        .style('fill', '#ff4444')
        .style('stroke', '#000')
        .style('stroke-width', 2)
        .style('cursor', 'pointer')
        .attr('class', 'user-offer-point');

      // Add label for user offer
      svg.append('text')
        .attr('x', xScale(userOffer.loanAmount) + 10)
        .attr('y', yScale(userOffer.interestRate) - 10)
        .attr('text-anchor', 'start')
        .attr('font-size', '12px')
        .attr('font-weight', 'bold')
        .attr('fill', '#ff4444')
        .text('Your Offer');

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
              <div style="margin-bottom: 4px;"><strong>Your Offer:</strong></div>
              <div style="margin-bottom: 4px;"><strong>Loan Amount:</strong> ${userOffer.loanAmount.toFixed(2)} ETH</div>
              <div style="margin-bottom: 4px;"><strong>Interest Rate:</strong> ${userOffer.interestRate.toFixed(2)}%</div>
              <div style="margin-bottom: 4px;"><strong>Duration:</strong> ${userOffer.duration} days</div>
              ${userOffer.collection ? `<div><strong>Collection:</strong> ${userOffer.collection}</div>` : ''}
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
    }

  }, [data, userOffer]);

  return (
    <Paper 
      elevation={3} 
      sx={{ 
        p: 3, 
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Market Offers
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={selectedCurrency === 'USDC'}
              onChange={(e) => onCurrencyChange(e.target.checked ? 'USDC' : 'WETH')}
              color="primary"
            />
          }
          label={`Show ${selectedCurrency} offers`}
        />
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
      </Box>
    </Paper>
  );
};

export default ScatterPlot; 