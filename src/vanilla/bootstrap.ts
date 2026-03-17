import * as d3 from 'd3';
import { LoanOffer } from '../types';
import { formatCurrency, formatPercentageAxis } from '../utils/formatting';
import { Currency, Collection, deriveChartData, loadCollections, loadLoanData } from './services/data';

type Domain = { x: [number, number]; y: [number, number] };

type VanillaState = {
  collections: Collection[];
  selectedCollectionAddress?: string;
  selectedCurrency: Currency;
  loading: boolean;
  error?: string;
  marketOffers: LoanOffer[];
  gondiOffersRaw: any[];
  chartOffers: LoanOffer[];
  domain: Domain;
  baselineDomain: Domain;
};

const CHART_PADDING_RATIO = 0.15;

function toDataPadding(range: number) {
  const denominator = 1 - 2 * CHART_PADDING_RATIO;
  return denominator > 0 ? (range * CHART_PADDING_RATIO) / denominator : range;
}

function getInitialDomain(offers: LoanOffer[]) {
  if (offers.length === 0) {
    return { x: [0, 1] as [number, number], y: [0, 5] as [number, number] };
  }

  const allLoanAmounts = offers.map((offer) => offer.loanAmount);
  const allInterestRates = offers.map((offer) => offer.interestRate);
  const minLoan = Math.min(...allLoanAmounts);
  const maxLoan = Math.max(...allLoanAmounts);
  const minRate = Math.min(...allInterestRates);
  const maxRate = Math.max(...allInterestRates);
  const loanRange = Math.max(maxLoan - minLoan, 0.1);
  const rateRange = Math.max(maxRate - minRate, 2);
  const xPadding = toDataPadding(loanRange);
  const yPadding = toDataPadding(rateRange);

  return {
    x: [minLoan - xPadding, maxLoan + xPadding] as [number, number],
    y: [Math.max(0, minRate - yPadding), maxRate + yPadding] as [number, number],
  };
}

function domainsAreClose(a: Domain, b: Domain, epsilon = 1e-6) {
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
  domain: Domain,
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

function createShell(root: HTMLElement) {
  root.innerHTML = `
    <div style="padding: 16px; color: #fff; background: #17152e; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
      <div style="display: grid; grid-template-columns: 280px 1fr; gap: 16px; height: calc(100vh - 32px);">
        <div style="background: #201d3f; border: 1px solid #3a3a5f; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 12px;">
          <h2 style="margin: 0 0 6px 0; font-size: 22px;">Vanilla Controls</h2>
          <label style="font-size: 12px; opacity: 0.85;">Collection</label>
          <select id="vanilla-collection" style="padding: 8px 10px; border-radius: 8px; border: 1px solid #454570; background: #252046; color: #fff;"></select>
          <label style="font-size: 12px; opacity: 0.85;">Currency</label>
          <select id="vanilla-currency" style="padding: 8px 10px; border-radius: 8px; border: 1px solid #454570; background: #252046; color: #fff;">
            <option value="WETH">WETH</option>
            <option value="USDC">USDC</option>
          </select>
          <button id="vanilla-refresh" style="padding: 8px 10px; border-radius: 8px; border: 1px solid #4e4e7f; background: #2c2750; color: #fff; cursor: pointer;">
            Reload Collection Data
          </button>
          <pre id="vanilla-status" style="margin: 8px 0 0 0; padding: 10px; border-radius: 8px; border: 1px solid #383860; background: #14132a; overflow: auto; font-size: 12px; flex: 1;"></pre>
        </div>
        <div style="background: #201d3f; border: 1px solid #3a3a5f; border-radius: 14px; padding: 12px; display: flex; flex-direction: column; min-height: 0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h2 style="margin: 0; font-size: 22px;">Vanilla D3 Chart</h2>
            <button id="vanilla-reset-zoom" style="padding: 6px 10px; border-radius: 8px; border: 1px solid #4e4e7f; background: #2c2750; color: #fff; cursor: pointer; display: none;">
              Reset Zoom
            </button>
          </div>
          <div id="vanilla-chart-host" style="position: relative; flex: 1; min-height: 0;">
            <svg id="vanilla-chart" style="width: 100%; height: 100%;"></svg>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCollectionOptions(collectionSelect: HTMLSelectElement, collections: Collection[]) {
  collectionSelect.innerHTML = '';
  collections.forEach((collection) => {
    const option = document.createElement('option');
    option.value = collection.contract_address;
    option.textContent = collection.name;
    collectionSelect.appendChild(option);
  });
}

function updateStatus(state: VanillaState) {
  const status = document.getElementById('vanilla-status');
  if (!status) return;

  status.textContent = JSON.stringify(
    {
      loading: state.loading,
      selectedCollectionAddress: state.selectedCollectionAddress,
      selectedCurrency: state.selectedCurrency,
      marketOffers: state.marketOffers.length,
      chartOffers: state.chartOffers.length,
      error: state.error ?? null,
      domain: state.domain,
    },
    null,
    2
  );
}

function renderChart(state: VanillaState, onDomainChange: (domain: Domain) => void) {
  const svgNode = document.getElementById('vanilla-chart') as SVGSVGElement | null;
  const chartHost = document.getElementById('vanilla-chart-host') as HTMLDivElement | null;
  const resetZoomButton = document.getElementById('vanilla-reset-zoom') as HTMLButtonElement | null;
  if (!svgNode || !chartHost || !resetZoomButton) return;

  const width = chartHost.clientWidth || 800;
  const height = chartHost.clientHeight || 500;
  const margin = { top: 20, right: 20, bottom: 50, left: 65 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select(svgNode);
  svg.attr('width', width).attr('height', height);
  svg.selectAll('*').remove();
  const rootG = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  // Canonical d3.zoom setup:
  // - base scales use baseline domain
  // - zoom transform maps base scales to current viewport scales
  const baseXScale = d3.scaleLinear().domain(state.baselineDomain.x).range([0, innerWidth]);
  const baseYScale = d3.scaleLinear().domain(state.baselineDomain.y).range([innerHeight, 0]);
  const domainTransform = getTransformForDomain(
    state.domain,
    baseXScale,
    baseYScale,
    state.baselineDomain.x
  );
  const xScale = domainTransform.rescaleX(baseXScale);
  const yScale = domainTransform.rescaleY(baseYScale);

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(6)
    .tickFormat((value) => `${formatCurrency(Number(value), state.selectedCurrency)} ${state.selectedCurrency}`);
  const yAxis = d3
    .axisLeft(yScale)
    .ticks(8)
    .tickFormat((value) => formatPercentageAxis(Number(value)));

  rootG.append('g').attr('transform', `translate(0,${innerHeight})`).call(xAxis as any);
  rootG.append('g').call(yAxis as any);

  rootG
    .selectAll<SVGCircleElement, LoanOffer>('.data-point')
    .data(state.chartOffers, (offer: any) => offer.id || `${offer.loanAmount}-${offer.interestRate}`)
    .enter()
    .append('circle')
    .attr('class', 'data-point')
    .attr('cx', (offer) => xScale(offer.loanAmount))
    .attr('cy', (offer) => yScale(offer.interestRate))
    .attr('r', 8)
    .attr('fill', '#ff6b6b')
    .attr('fill-opacity', 0.4)
    .attr('stroke', '#ff8c8c')
    .attr('stroke-width', 1);

  const isZoomed = !domainsAreClose(state.domain, state.baselineDomain);
  resetZoomButton.style.display = isZoomed ? 'inline-block' : 'none';
  const svgElement = svg.node();
  if (!svgElement) return;

  const interactionState = (svgElement as any).__vanillaZoomState || {
    initialized: false,
    suppressZoomEvents: false,
    zoomBehavior: null as d3.ZoomBehavior<SVGSVGElement, unknown> | null,
    innerWidth: 0,
    innerHeight: 0,
    marginLeft: 0,
    marginTop: 0,
    baseXScale: null as d3.ScaleLinear<number, number> | null,
    baseYScale: null as d3.ScaleLinear<number, number> | null,
  };
  (svgElement as any).__vanillaZoomState = interactionState;

  interactionState.innerWidth = innerWidth;
  interactionState.innerHeight = innerHeight;
  interactionState.marginLeft = margin.left;
  interactionState.marginTop = margin.top;
  interactionState.baseXScale = baseXScale;
  interactionState.baseYScale = baseYScale;

  if (!interactionState.initialized) {
    interactionState.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 40])
      .filter((event: any) => {
        if (event.type === 'dblclick') return false;
        if (event.type === 'mousedown' && event.button !== 0) return false;
        return event.type === 'wheel' || event.type === 'mousedown' || event.type === 'touchstart';
      })
      .on('zoom', (event) => {
        if (interactionState.suppressZoomEvents) return;
        const bx = interactionState.baseXScale as d3.ScaleLinear<number, number>;
        const by = interactionState.baseYScale as d3.ScaleLinear<number, number>;
        if (!bx || !by) return;

        const transformedX = event.transform.rescaleX(bx);
        const transformedY = event.transform.rescaleY(by);
        onDomainChange({
          x: [transformedX.invert(0), transformedX.invert(interactionState.innerWidth)],
          y: [transformedY.invert(interactionState.innerHeight), transformedY.invert(0)],
        });
      });

    svg.call(interactionState.zoomBehavior as any);
    svg.on('dblclick.zoom', null);
    interactionState.initialized = true;
  }

  const currentTransform = d3.zoomTransform(svgElement);
  if (!transformsAreClose(currentTransform, domainTransform)) {
    interactionState.suppressZoomEvents = true;
    svg.call((interactionState.zoomBehavior as any).transform, domainTransform);
    interactionState.suppressZoomEvents = false;
  }
}

export function bootstrapVanillaApp() {
  const root = document.getElementById('root');
  if (!root) return;

  createShell(root);

  const collectionSelect = document.getElementById('vanilla-collection') as HTMLSelectElement | null;
  const currencySelect = document.getElementById('vanilla-currency') as HTMLSelectElement | null;
  const refreshButton = document.getElementById('vanilla-refresh') as HTMLButtonElement | null;
  const resetZoomButton = document.getElementById('vanilla-reset-zoom') as HTMLButtonElement | null;
  if (!collectionSelect || !currencySelect || !refreshButton || !resetZoomButton) return;

  const state: VanillaState = {
    collections: [],
    selectedCurrency: 'WETH',
    loading: false,
    marketOffers: [],
    gondiOffersRaw: [],
    chartOffers: [],
    domain: { x: [0, 1], y: [0, 5] },
    baselineDomain: { x: [0, 1], y: [0, 5] },
  };

  const render = () => {
    updateStatus(state);
    renderChart(state, (domain) => {
      state.domain = domain;
      render();
    });
  };

  const recomputeChartData = () => {
    const derivedData = deriveChartData(state.marketOffers, state.gondiOffersRaw, state.selectedCurrency);
    state.chartOffers = derivedData.loanOffers;
  };

  const loadSelectedCollection = async () => {
    if (!state.selectedCollectionAddress) return;

    state.loading = true;
    state.error = undefined;
    render();

    try {
      const loanData = await loadLoanData(state.selectedCollectionAddress);
      state.marketOffers = loanData.marketOffers;
      state.gondiOffersRaw = loanData.gondiOffersRaw;
      recomputeChartData();
      state.baselineDomain = getInitialDomain(state.chartOffers);
      state.domain = state.baselineDomain;
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unknown error';
    } finally {
      state.loading = false;
      render();
    }
  };

  const loadInitialCollections = async () => {
    state.loading = true;
    render();
    try {
      state.collections = await loadCollections();
      renderCollectionOptions(collectionSelect, state.collections);
      if (state.collections.length > 0) {
        state.selectedCollectionAddress = state.collections[0].contract_address;
        collectionSelect.value = state.selectedCollectionAddress;
        await loadSelectedCollection();
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Unknown error';
      state.loading = false;
      render();
    }
  };

  collectionSelect.addEventListener('change', async () => {
    state.selectedCollectionAddress = collectionSelect.value;
    await loadSelectedCollection();
  });

  currencySelect.addEventListener('change', () => {
    state.selectedCurrency = currencySelect.value as Currency;
    recomputeChartData();
    state.baselineDomain = getInitialDomain(state.chartOffers);
    state.domain = state.baselineDomain;
    render();
  });

  refreshButton.addEventListener('click', async () => {
    await loadSelectedCollection();
  });

  resetZoomButton.addEventListener('click', () => {
    state.domain = state.baselineDomain;
    render();
  });

  void loadInitialCollections();
}
