import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/static');
const GONDI_GRAPHQL_URL = 'https://api2.gondi.xyz/graphql?operation=ListActiveLoans';
const COLLECTIONS_URL = process.env.COLLECTIONS_URL ?? 'https://nft-collection-resolver.onrender.com/collections';
const NFTFI_MARKET_URL = process.env.NFTFI_MARKET_URL ?? '';
const NFTFI_HAR_PATH = process.env.NFTFI_HAR_PATH ?? '';
const NFTFI_SDK_API_KEY = process.env.VITE_NFTFI_SDK_API_KEY ?? process.env.NFTFI_SDK_API_KEY ?? '';
const NFTFI_ENABLE_SDK = process.env.NFTFI_ENABLE_SDK === 'true';
const NFTFI_SDK_ACCOUNT_ADDRESS =
  process.env.NFTFI_SDK_ACCOUNT_ADDRESS ?? '0x0000000000000000000000000000000000000000';
const NFTFI_SDK_CHAIN_ID = toFiniteNumber(process.env.NFTFI_SDK_CHAIN_ID ?? 1, 1);
const NFTFI_SDK_PAGE_LIMIT = toFiniteNumber(process.env.NFTFI_SDK_PAGE_LIMIT ?? 100, 100);
const NFTFI_SDK_START_PAGE = toFiniteNumber(process.env.NFTFI_SDK_START_PAGE ?? 1, 1);
const NFTFI_SDK_MAX_PAGES = toFiniteNumber(process.env.NFTFI_SDK_MAX_PAGES ?? 50, 50);
const NFTFI_SDK_LOANS_URL = process.env.NFTFI_SDK_LOANS_URL ?? '';
const NFTFI_PAGE_PARAM = process.env.NFTFI_PAGE_PARAM ?? 'page';
const NFTFI_LIMIT_PARAM = process.env.NFTFI_LIMIT_PARAM ?? 'limit';
const NFTFI_LIMIT = toFiniteNumber(process.env.NFTFI_LIMIT ?? 100, 100);
const NFTFI_START_PAGE = toFiniteNumber(process.env.NFTFI_START_PAGE ?? 1, 1);
const NFTFI_MAX_PAGES = toFiniteNumber(process.env.NFTFI_MAX_PAGES ?? 50, 50);
const NFTFI_LOANS_DUE_URL =
  process.env.NFTFI_LOANS_DUE_URL ?? 'https://sdk-api.nftfi.com/data/v0/pipes/loans_due_endpoint.json';
const NFTFI_LOANS_DUE_PAGE_SIZE = toFiniteNumber(process.env.NFTFI_LOANS_DUE_PAGE_SIZE ?? 250, 250);
const NFTFI_LOANS_DUE_MAX_PAGES = toFiniteNumber(process.env.NFTFI_LOANS_DUE_MAX_PAGES ?? 100, 100);
const COINGECKO_ETH_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

const LOAN_QUERY = `
query ListActiveLoans($first: Int = 200, $after: String) {
  listLoans(
    statuses: [LOAN_INITIATED]
    includeVaultsForCollections: INCLUDE
    orderByStatuses: false
    sortBy: [{field: EXPIRATION_DATE, order: ASC}]
    first: $first
    after: $after
  ) {
    totalCount
    pageInfo {
      endCursor
      hasNextPage
    }
    edges {
      node {
        id
        startTime
        duration
        principalAmount
        principalAddress
        blendedAprBps
        nft {
          collection {
            name
            contractData {
              contractAddress
            }
          }
        }
        sources {
          id
          lenderAddress
          aprBps
          principalAmount
          startTime
        }
      }
    }
  }
}
`;

const TOKEN_INFO = {
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': { symbol: 'WETH', decimals: 18 },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6 },
};

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toFiniteNumber(value, fallback = 0) {
  const num = typeof value === 'string' ? Number(value) : value;
  return isFiniteNumber(num) ? num : fallback;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function dedupe(rows, keyFn) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = keyFn(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeCollection(raw) {
  const name = String(raw.name ?? raw.collectionName ?? '');
  const slug = String(raw.slug ?? name.toLowerCase().replace(/\s+/g, '-'));
  const contractAddress = String(raw.contract_address ?? raw.collection_address ?? raw.address ?? '');
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.map((entry) => String(entry)) : [];
  return {
    name,
    slug,
    contract_address: contractAddress,
    aliases,
  };
}

function normalizeMarketOffer(raw, index) {
  const rawCurrency =
    raw.currencySymbol ??
    raw.currency_symbol ??
    raw?.terms?.loan?.currency?.symbol ??
    raw?.loan?.currency?.symbol ??
    'WETH';
  const currencySymbol = String(rawCurrency).toUpperCase() === 'USDC' ? 'USDC' : 'WETH';
  const apr = toFiniteNumber(
    raw.eAPR ??
      raw.apr ??
      raw.aprBps / 100 ??
      raw?.terms?.loan?.apr ??
      raw?.terms?.loan?.effectiveApr ??
      0,
    0
  );
  const principalRaw = toFiniteNumber(
    raw.loanPrincipalCanonicalAmount ??
      raw.loanPrincipalAmount ??
      raw.principal ??
      raw.loan_amount ??
      raw?.terms?.loan?.principal ??
      raw?.terms?.principal ??
      0,
    0
  );
  const looksLikeBaseUnits = principalRaw > 1000000000;
  const principalCanonical = looksLikeBaseUnits
    ? principalRaw / Math.pow(10, currencySymbol === 'USDC' ? 6 : 18)
    : principalRaw;

  return {
    _id: String(raw._id ?? raw.id ?? raw.offerId ?? `nftfi-${index}`),
    offerDate: String(raw.offerDate ?? raw.createdAt ?? raw.createddate ?? raw?.startDate ?? new Date(0).toISOString()),
    loanPrincipalCanonicalAmount: principalCanonical,
    eAPR: apr,
    loanDuration: toFiniteNumber(raw.loanDuration ?? raw.duration ?? raw.loan_duration ?? raw?.terms?.loan?.duration ?? 0, 0),
    collectionName: String(raw.collectionName ?? raw.collectionname ?? raw.collection ?? raw?.nft?.collection?.name ?? 'Unknown'),
    collectionAddress: String(
      raw.collectionAddress ??
        raw.collection_address ??
        raw?.nft?.collection?.contractData?.contractAddress ??
        raw?.nft?.address ??
        ''
    ),
    lender: String(raw.lender ?? raw.lenderaddress ?? raw.lenderAddress ?? raw?.lender?.address ?? ''),
    currencySymbol,
    fxRateToUSD:
      currencySymbol === 'USDC' ? 1 : toFiniteNumber(raw.fxRateToUSD ?? raw.fx_rate_to_usd ?? raw.ethUsd ?? 0, 0),
  };
}

async function fetchJsonWithRetry(name, url, warnings, retries = 2, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${name} request failed (${response.status}): ${body.slice(0, 200)}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  warnings.push(`${name}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
  return null;
}

async function fetchEthUsd(warnings) {
  const payload = await fetchJsonWithRetry('coingecko_eth_price', COINGECKO_ETH_PRICE_URL, warnings, 1, {
    headers: { accept: 'application/json', 'user-agent': 'offer-analysis-static-snapshot/1.0' },
  });
  const price = payload?.ethereum?.usd;
  return isFiniteNumber(price) ? price : 0;
}

function isOfferLike(item) {
  if (!item || typeof item !== 'object') return false;
  return [
    'offerDate',
    'loanPrincipalCanonicalAmount',
    'eAPR',
    'apr',
    'currencySymbol',
    'collectionName',
    'lender',
  ].some((key) => Object.prototype.hasOwnProperty.call(item, key));
}

function collectOfferArrays(payload, result = []) {
  if (Array.isArray(payload)) {
    if (payload.some(isOfferLike)) {
      result.push(payload);
      return result;
    }
    payload.forEach((entry) => collectOfferArrays(entry, result));
    return result;
  }
  if (payload && typeof payload === 'object') {
    Object.values(payload).forEach((value) => collectOfferArrays(value, result));
  }
  return result;
}

function parseJsonSafely(content) {
  if (typeof content !== 'string' || content.length === 0) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function normalizeCurrencySymbol(value) {
  const text = String(value ?? '').toUpperCase();
  if (text.includes('USDC')) return 'USDC';
  return 'WETH';
}

function toIsoStringMaybe(value) {
  const text = String(value ?? '').trim();
  if (!text) return new Date(0).toISOString();
  const candidate = text.includes('T') ? text : `${text.replace(' ', 'T')}Z`;
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? new Date(0).toISOString() : new Date(timestamp).toISOString();
}

function isLikelyNonNftfiKey(apiKey) {
  return typeof apiKey === 'string' && apiKey.startsWith('AIza');
}

async function fetchNftfiRowsFromUrl(warnings, ethUsdRate) {
  if (!NFTFI_MARKET_URL) return [];
  const payload = await fetchJsonWithRetry('nftfi_market_url', NFTFI_MARKET_URL, warnings, 2, {
    headers: { accept: 'application/json', 'user-agent': 'offer-analysis-static-snapshot/1.0' },
  });
  if (!payload) return [];
  const candidateArrays = collectOfferArrays(payload);
  const rows = candidateArrays.flat();
  if (rows.length === 0) {
    warnings.push('nftfi_market_url: no offer-like rows found in payload');
    return [];
  }
  return rows.map((row, index) => normalizeMarketOffer({ ...row, fxRateToUSD: row.fxRateToUSD ?? ethUsdRate }, index));
}

async function fetchNftfiRowsFromLoansDue(warnings, ethUsdRate) {
  const allRows = [];
  let page = 0;
  let pagesFetched = 0;
  let keepGoing = true;

  while (keepGoing && pagesFetched < NFTFI_LOANS_DUE_MAX_PAGES) {
    const pageUrl = new URL(NFTFI_LOANS_DUE_URL);
    pageUrl.searchParams.set('page', String(page));
    pageUrl.searchParams.set('page_size', String(NFTFI_LOANS_DUE_PAGE_SIZE));
    pageUrl.searchParams.set('sort_by', 'secondsUntilDue');
    pageUrl.searchParams.set('sort_order', 'ASC');

    const payload = await fetchJsonWithRetry(
      'nftfi_loans_due',
      pageUrl.toString(),
      warnings,
      2,
      { headers: { accept: 'application/json', 'user-agent': 'offer-analysis-static-snapshot/1.0' } }
    );

    if (!payload) break;
    const pageRows = asArray(payload?.data);
    if (pageRows.length === 0) break;

    allRows.push(...pageRows);
    pagesFetched += 1;
    page += 1;

    const expectedTotal = toFiniteNumber(payload?.rows_before_limit_at_least ?? 0, 0);
    if (expectedTotal > 0 && allRows.length >= expectedTotal) {
      keepGoing = false;
    } else if (pageRows.length < NFTFI_LOANS_DUE_PAGE_SIZE) {
      keepGoing = false;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  if (pagesFetched >= NFTFI_LOANS_DUE_MAX_PAGES) {
    warnings.push(`nftfi_loans_due: stopped after NFTFI_LOANS_DUE_MAX_PAGES=${NFTFI_LOANS_DUE_MAX_PAGES}`);
  }

  return allRows.map((row, index) => {
    const currencySymbol = normalizeCurrencySymbol(row.currencyName);
    const principal = toFiniteNumber(row.principalAmount, 0);
    const principalUsd = toFiniteNumber(row.principalAmountUSD, 0);
    const derivedFx = principal > 0 ? principalUsd / principal : 0;
    return normalizeMarketOffer(
      {
        _id: `${row.protocolName || 'Unknown'}-${row.loanContractAddress || 'no-contract'}-${row.loanId || index}`,
        offerDate: toIsoStringMaybe(row.startTime),
        loanPrincipalCanonicalAmount: principal,
        eAPR: toFiniteNumber(row.apr, 0),
        loanDuration: toFiniteNumber(row.durationDays, 0) * 86400,
        collectionName: row.nftProjectName ?? row.nftName ?? 'Unknown',
        collectionAddress: row.nftAddress ?? '',
        lender: row.lenderAddress ?? '',
        currencySymbol,
        fxRateToUSD: currencySymbol === 'USDC' ? 1 : (derivedFx || ethUsdRate),
      },
      index
    );
  });
}

function withQueryParam(url, key, value) {
  const parsed = new URL(url);
  parsed.searchParams.set(key, String(value));
  return parsed.toString();
}

async function fetchNftfiRowsFromApi(warnings, ethUsdRate) {
  if (!NFTFI_SDK_LOANS_URL || !NFTFI_SDK_API_KEY) return [];

  const allRows = [];
  let currentPage = NFTFI_START_PAGE;
  let pageCount = 0;
  let continuePaging = true;

  while (continuePaging && pageCount < NFTFI_MAX_PAGES) {
    const pageUrl = withQueryParam(
      withQueryParam(NFTFI_SDK_LOANS_URL, NFTFI_PAGE_PARAM, currentPage),
      NFTFI_LIMIT_PARAM,
      NFTFI_LIMIT
    );

    const payload = await fetchJsonWithRetry(
      'nftfi_sdk_api',
      pageUrl,
      warnings,
      2,
      {
        headers: {
          accept: 'application/json',
          'user-agent': 'offer-analysis-static-snapshot/1.0',
          authorization: `Bearer ${NFTFI_SDK_API_KEY}`,
          'x-api-key': NFTFI_SDK_API_KEY,
          apikey: NFTFI_SDK_API_KEY,
        },
      }
    );

    if (!payload) break;

    const candidateArrays = collectOfferArrays(payload);
    const pageRows = candidateArrays.flat();
    if (pageRows.length === 0) {
      if (pageCount === 0) {
        warnings.push('nftfi_sdk_api: request succeeded but no offer-like rows were found');
      }
      break;
    }

    allRows.push(...pageRows);

    const hasNextByMeta =
      payload?.pagination?.hasNextPage === true ||
      payload?.pageInfo?.hasNextPage === true ||
      payload?.hasMore === true;
    const nextPage =
      payload?.pagination?.nextPage ??
      payload?.pageInfo?.nextPage ??
      payload?.nextPage;

    if (typeof nextPage === 'number') {
      currentPage = nextPage;
      continuePaging = true;
    } else if (hasNextByMeta) {
      currentPage += 1;
      continuePaging = true;
    } else {
      continuePaging = pageRows.length >= NFTFI_LIMIT;
      currentPage += 1;
    }

    pageCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  if (pageCount >= NFTFI_MAX_PAGES) {
    warnings.push(`nftfi_sdk_api: stopped after NFTFI_MAX_PAGES=${NFTFI_MAX_PAGES}`);
  }

  return allRows.map((row, index) =>
    normalizeMarketOffer({ ...row, fxRateToUSD: row.fxRateToUSD ?? ethUsdRate }, index)
  );
}

async function fetchNftfiRowsFromSdk(warnings, ethUsdRate) {
  if (!NFTFI_ENABLE_SDK) return [];
  if (!NFTFI_SDK_API_KEY) return [];
  if (isLikelyNonNftfiKey(NFTFI_SDK_API_KEY)) {
    warnings.push('nftfi_sdk: provided key format looks like a Google API key, not an NFTfi SDK key');
  }

  let NFTfi;
  try {
    ({ default: NFTfi } = await import('@nftfi/js'));
  } catch (error) {
    warnings.push(
      `nftfi_sdk: failed to load @nftfi/js (${error instanceof Error ? error.message : String(error)})`
    );
    return [];
  }

  try {
    const nftfi = await NFTfi.init({
      config: {
        api: {
          key: NFTFI_SDK_API_KEY,
        },
      },
      ethereum: {
        account: {
          address: NFTFI_SDK_ACCOUNT_ADDRESS,
        },
        chain: {
          id: NFTFI_SDK_CHAIN_ID,
        },
      },
    });

    const rows = [];
    let page = NFTFI_SDK_START_PAGE;
    let pageCount = 0;

    while (pageCount < NFTFI_SDK_MAX_PAGES) {
      let response;
      try {
        response = await nftfi.offers.get({
          filters: {
            type: { in: ['v3.asset', 'v3.collection'] },
          },
          pagination: {
            page,
            limit: NFTFI_SDK_PAGE_LIMIT,
          },
          validation: {
            check: false,
          },
          auth: {
            token: 'optional',
          },
        });
      } catch (offerError) {
        warnings.push(
          `nftfi_sdk: offers.get failed on page ${page} (${offerError instanceof Error ? offerError.message : String(offerError)})`
        );
        break;
      }

      const pageRows = asArray(response?.data?.results ?? response?.results ?? response);
      if (pageRows.length === 0) break;

      rows.push(...pageRows);
      pageCount += 1;
      if (pageRows.length < NFTFI_SDK_PAGE_LIMIT) break;
      page += 1;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (rows.length === 0) {
      warnings.push('nftfi_sdk: no rows returned by offers.get; verify key scope and SDK account/chain');
    }

    if (pageCount >= NFTFI_SDK_MAX_PAGES) {
      warnings.push(`nftfi_sdk: stopped after NFTFI_SDK_MAX_PAGES=${NFTFI_SDK_MAX_PAGES}`);
    }

    return rows.map((row, index) =>
      normalizeMarketOffer({ ...row, fxRateToUSD: row.fxRateToUSD ?? ethUsdRate }, index)
    );
  } catch (error) {
    warnings.push(`nftfi_sdk: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function fetchNftfiRowsFromHar(warnings, ethUsdRate) {
  if (!NFTFI_HAR_PATH) return [];
  const absolutePath = path.isAbsolute(NFTFI_HAR_PATH)
    ? NFTFI_HAR_PATH
    : path.resolve(process.cwd(), NFTFI_HAR_PATH);
  try {
    const raw = await readFile(absolutePath, 'utf8');
    if (raw.trim().length === 0) {
      warnings.push(`nftfi_har: file is empty (${absolutePath})`);
      return [];
    }
    const har = JSON.parse(raw);
    const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
    const offerRows = [];

    entries.forEach((entry) => {
      const url = String(entry?.request?.url ?? '');
      if (!url.includes('nftfi')) return;
      const text = entry?.response?.content?.text;
      const payload = parseJsonSafely(text);
      if (!payload) return;
      const arrays = collectOfferArrays(payload);
      arrays.forEach((arr) => {
        arr.forEach((item) => offerRows.push(item));
      });
    });

    if (offerRows.length === 0) {
      warnings.push(`nftfi_har: no offer-like rows found in ${absolutePath}`);
      return [];
    }

    return offerRows.map((row, index) =>
      normalizeMarketOffer({ ...row, fxRateToUSD: row.fxRateToUSD ?? ethUsdRate }, index)
    );
  } catch (error) {
    warnings.push(`nftfi_har: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function fetchGondiLoans(warnings) {
  const edges = [];
  let after = null;
  let hasNextPage = true;
  let safetyCounter = 0;

  while (hasNextPage && safetyCounter < 30) {
    const payload = await fetchJsonWithRetry(
      'gondi_graphql',
      GONDI_GRAPHQL_URL,
      warnings,
      2,
      {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          origin: 'https://www.gondi.xyz',
          referer: 'https://www.gondi.xyz/lending-market',
          'user-agent': 'offer-analysis-static-snapshot/1.0',
        },
        body: JSON.stringify({
          operationName: 'ListActiveLoans',
          query: LOAN_QUERY,
          variables: {
            first: 200,
            after,
          },
        }),
      }
    );

    if (!payload || payload.errors) {
      if (payload?.errors) {
        warnings.push(`gondi_graphql: ${payload.errors.map((error) => error.message).join('; ')}`);
      }
      break;
    }

    const connection = payload?.data?.listLoans;
    const pageEdges = Array.isArray(connection?.edges) ? connection.edges : [];
    edges.push(...pageEdges);
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    after = connection?.pageInfo?.endCursor ?? null;
    safetyCounter += 1;
    if (!after) break;
  }

  return edges.map((edge) => edge?.node).filter(Boolean);
}

function currencyDetails(principalAddress, ethUsdRate) {
  const normalizedAddress = String(principalAddress ?? '').toLowerCase();
  const token = TOKEN_INFO[normalizedAddress];
  if (!token) return null;
  return {
    symbol: token.symbol,
    decimals: token.decimals,
    fxRateToUSD: token.symbol === 'USDC' ? 1 : ethUsdRate,
  };
}

function normalizeRowsFromGondiLoans(loans, ethUsdRate) {
  const marketRows = [];
  const gondiRows = [];

  loans.forEach((loan) => {
    const details = currencyDetails(loan.principalAddress, ethUsdRate);
    if (!details) return;

    const sources = Array.isArray(loan.sources) ? loan.sources : [];
    const collectionName = String(loan?.nft?.collection?.name ?? 'Unknown');
    const collectionAddress = String(loan?.nft?.collection?.contractData?.contractAddress ?? '');
    const duration = toFiniteNumber(loan.duration, 0);

    sources.forEach((source, sourceIndex) => {
      const id = String(source?.id ?? `${loan.id}-${sourceIndex}`);
      const principalRaw = toFiniteNumber(source?.principalAmount ?? loan.principalAmount, 0);
      const createdAt = source?.startTime ?? loan.startTime ?? new Date(0).toISOString();
      const aprBps = toFiniteNumber(source?.aprBps ?? loan.blendedAprBps, 0);
      const canonicalAmount = principalRaw / Math.pow(10, details.decimals);

      marketRows.push({
        _id: id,
        offerDate: createdAt,
        loanPrincipalCanonicalAmount: canonicalAmount,
        eAPR: aprBps / 100,
        loanDuration: duration,
        collectionName,
        collectionAddress,
        lender: String(source?.lenderAddress ?? ''),
        currencySymbol: details.symbol,
        fxRateToUSD: details.fxRateToUSD,
      });

      gondiRows.push({
        id,
        createddate: createdAt,
        principalamount: principalRaw,
        currency_decimals: details.decimals,
        currency_symbol: details.symbol,
        aprbps: aprBps,
        duration,
        collectionname: collectionName,
        lenderaddress: String(source?.lenderAddress ?? ''),
        fxRateToUSD: details.fxRateToUSD,
      });
    });
  });

  return {
    marketRows: dedupe(marketRows, (row) => `${row._id}:${row.offerDate}`),
    gondiRows: dedupe(gondiRows, (row) => `${row.id}:${row.createddate}`),
  };
}

async function writeJson(fileName, payload) {
  await writeFile(path.join(OUTPUT_DIR, fileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const warnings = [];

  const [ethUsdRate, loans, collectionsPayload] = await Promise.all([
    fetchEthUsd(warnings),
    fetchGondiLoans(warnings),
    fetchJsonWithRetry('collections', COLLECTIONS_URL, warnings, 2, {
      headers: { accept: 'application/json', 'user-agent': 'offer-analysis-static-snapshot/1.0' },
    }),
  ]);

  const { marketRows: gondiDerivedMarketRows, gondiRows } = normalizeRowsFromGondiLoans(loans, ethUsdRate);
  const [nftfiFromLoansDueRows, nftfiFromSdkRows, nftfiFromApiRows, nftfiFromUrlRows, nftfiFromHarRows] = await Promise.all([
    fetchNftfiRowsFromLoansDue(warnings, ethUsdRate),
    fetchNftfiRowsFromSdk(warnings, ethUsdRate),
    fetchNftfiRowsFromApi(warnings, ethUsdRate),
    fetchNftfiRowsFromUrl(warnings, ethUsdRate),
    fetchNftfiRowsFromHar(warnings, ethUsdRate),
  ]);
  const nftfiRows = dedupe(
    [...nftfiFromLoansDueRows, ...nftfiFromSdkRows, ...nftfiFromApiRows, ...nftfiFromUrlRows, ...nftfiFromHarRows],
    (row) => `${row._id}:${row.offerDate}:${row.currencySymbol}`
  );
  const marketRows = dedupe(
    [...gondiDerivedMarketRows, ...nftfiRows],
    (row) => `${row._id}:${row.offerDate}:${row.currencySymbol}`
  );
  const collectionRows = dedupe(
    asArray(collectionsPayload).map(normalizeCollection).filter((row) => row.contract_address.length > 0),
    (row) => row.contract_address.toLowerCase()
  );

  await Promise.all([
    writeJson('market_offers.json', marketRows),
    writeJson('gondi_offers.json', gondiRows),
    writeJson('collections.json', collectionRows),
  ]);

  const metadata = {
    generated_at: new Date().toISOString(),
    sources: {
      market_offers: [
        'Derived from GONDI GraphQL ListActiveLoans',
        `NFTFI_LOANS_DUE_URL=${NFTFI_LOANS_DUE_URL}`,
        NFTFI_ENABLE_SDK && NFTFI_SDK_API_KEY ? '@nftfi/js offers.get via SDK key' : null,
        NFTFI_SDK_LOANS_URL ? `NFTFI_SDK_LOANS_URL=${NFTFI_SDK_LOANS_URL}` : null,
        NFTFI_MARKET_URL ? `NFTFI_MARKET_URL=${NFTFI_MARKET_URL}` : null,
        NFTFI_HAR_PATH ? `NFTFI_HAR_PATH=${NFTFI_HAR_PATH}` : null,
      ].filter(Boolean),
      gondi_offers: 'Derived from GONDI GraphQL ListActiveLoans',
      collections: COLLECTIONS_URL,
      eth_usd: COINGECKO_ETH_PRICE_URL,
    },
    record_counts: {
      market_offers: marketRows.length,
      market_offers_gondi_derived: gondiDerivedMarketRows.length,
      market_offers_nftfi_derived: nftfiRows.length,
      gondi_offers: gondiRows.length,
      collections: collectionRows.length,
    },
    warnings,
  };

  await writeJson('metadata.json', metadata);

  console.log('Snapshot complete.');
  console.log(`- market_offers: ${marketRows.length}`);
  console.log(`  - from_gondi: ${gondiDerivedMarketRows.length}`);
  console.log(`  - from_nftfi: ${nftfiRows.length}`);
  console.log(`- gondi_offers: ${gondiRows.length}`);
  console.log(`- collections: ${collectionRows.length}`);
  console.log(`- ETH/USD used: ${ethUsdRate || '0 (fallback)'}`);
  if (warnings.length > 0) {
    console.log('- warnings:');
    warnings.forEach((warning) => console.log(`  - ${warning}`));
  }
}

main().catch((error) => {
  console.error('Snapshot failed:', error);
  process.exitCode = 1;
});
