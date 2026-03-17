# Offer Analysis

## Run the app

```bash
npm install
npm start
```

The app attempts live API fetches first. If they fail, it automatically falls back to static snapshot files in `public/static`.

## Static data pipeline

Generate static snapshots:

```bash
npm run data:snapshot
```

`data:snapshot` automatically loads environment variables from `.env`.

Validate snapshot schemas:

```bash
npm run data:validate
```

Current snapshot sources:

- `https://api2.gondi.xyz/graphql` (`ListActiveLoans`) for both `market_offers` and `gondi_offers`
- `https://sdk-api.nftfi.com/data/v0/pipes/loans_due_endpoint.json` for NFTfi/all-protocol loan rows mapped into `market_offers`
- `https://nft-collection-resolver.onrender.com/collections` for collections
- `https://api.coingecko.com/api/v3/simple/price` for ETH/USD normalization

Optional NFTfi ingestion:

- `NFTFI_LOANS_DUE_URL` (default: NFTfi loans-due endpoint)
- `NFTFI_LOANS_DUE_PAGE_SIZE` (default: `250`)
- `NFTFI_LOANS_DUE_MAX_PAGES` (default: `100`)
- `NFTFI_ENABLE_SDK` (default: `false`; set `true` to enable SDK-based `offers.get`)
- `VITE_NFTFI_SDK_API_KEY` (or `NFTFI_SDK_API_KEY`): NFTfi SDK/API key
- Optional SDK controls:
  - `NFTFI_SDK_ACCOUNT_ADDRESS` (default: `0x0000000000000000000000000000000000000000`)
  - `NFTFI_SDK_CHAIN_ID` (default: `1`)
  - `NFTFI_SDK_PAGE_LIMIT` (default: `100`)
  - `NFTFI_SDK_START_PAGE` (default: `1`)
  - `NFTFI_SDK_MAX_PAGES` (default: `50`)
- Optional direct-endpoint fallback:
  - `NFTFI_SDK_LOANS_URL`: NFTfi endpoint URL for loan/offer rows
  - pagination controls:
  - `NFTFI_PAGE_PARAM` (default: `page`)
  - `NFTFI_LIMIT_PARAM` (default: `limit`)
  - `NFTFI_LIMIT` (default: `100`)
  - `NFTFI_START_PAGE` (default: `1`)
  - `NFTFI_MAX_PAGES` (default: `50`)
- `NFTFI_MARKET_URL`: direct NFTfi JSON response URL with market offers
- `NFTFI_HAR_PATH`: path to a HAR file exported from browser devtools while loading NFTfi market/offers pages

Optional collections override:

```bash
COLLECTIONS_URL="https://example.com/collections.json" npm run data:snapshot
```

Example with HAR:

```bash
NFTFI_HAR_PATH="./tmp/nftfi-market.har" npm run data:snapshot
```

Example with SDK key (SDK path):

```bash
VITE_NFTFI_SDK_API_KEY="your_key" \
npm run data:snapshot
```

Snapshot output files:

- `public/static/market_offers.json`
- `public/static/gondi_offers.json`
- `public/static/collections.json`
- `public/static/metadata.json`
