import { readFile } from 'node:fs/promises';
import path from 'node:path';

const STATIC_DIR = path.resolve(process.cwd(), 'public/static');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(name) {
  const raw = await readFile(path.join(STATIC_DIR, name), 'utf8');
  return JSON.parse(raw);
}

function isIsoDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateMarket(rows) {
  assert(Array.isArray(rows), 'market_offers.json must be an array');
  rows.forEach((row, idx) => {
    assert(typeof row._id === 'string', `market[${idx}]._id must be string`);
    assert(isIsoDate(row.offerDate), `market[${idx}].offerDate must be ISO-like string`);
    assert(isFiniteNumber(row.loanPrincipalCanonicalAmount), `market[${idx}].loanPrincipalCanonicalAmount must be number`);
    assert(isFiniteNumber(row.loanDuration), `market[${idx}].loanDuration must be number`);
    assert(typeof row.collectionName === 'string', `market[${idx}].collectionName must be string`);
    assert(typeof row.lender === 'string', `market[${idx}].lender must be string`);
    assert(row.currencySymbol === 'WETH' || row.currencySymbol === 'USDC', `market[${idx}].currencySymbol invalid`);
    assert(isFiniteNumber(row.fxRateToUSD), `market[${idx}].fxRateToUSD must be number`);
  });
}

function validateGondi(rows) {
  assert(Array.isArray(rows), 'gondi_offers.json must be an array');
  rows.forEach((row, idx) => {
    assert(typeof row.id === 'string', `gondi[${idx}].id must be string`);
    assert(isIsoDate(row.createddate), `gondi[${idx}].createddate must be ISO-like string`);
    assert(isFiniteNumber(row.principalamount), `gondi[${idx}].principalamount must be number`);
    assert(isFiniteNumber(row.currency_decimals), `gondi[${idx}].currency_decimals must be number`);
    assert(row.currency_symbol === 'WETH' || row.currency_symbol === 'USDC', `gondi[${idx}].currency_symbol invalid`);
    assert(isFiniteNumber(row.aprbps), `gondi[${idx}].aprbps must be number`);
    assert(isFiniteNumber(row.duration), `gondi[${idx}].duration must be number`);
    assert(typeof row.collectionname === 'string', `gondi[${idx}].collectionname must be string`);
    assert(typeof row.lenderaddress === 'string', `gondi[${idx}].lenderaddress must be string`);
    assert(isFiniteNumber(row.fxRateToUSD), `gondi[${idx}].fxRateToUSD must be number`);
  });
}

function validateCollections(rows) {
  assert(Array.isArray(rows), 'collections.json must be an array');
  rows.forEach((row, idx) => {
    assert(typeof row.name === 'string', `collections[${idx}].name must be string`);
    assert(typeof row.slug === 'string', `collections[${idx}].slug must be string`);
    assert(typeof row.contract_address === 'string', `collections[${idx}].contract_address must be string`);
    assert(Array.isArray(row.aliases), `collections[${idx}].aliases must be array`);
  });
}

async function main() {
  const [market, gondi, collections, metadata] = await Promise.all([
    readJson('market_offers.json'),
    readJson('gondi_offers.json'),
    readJson('collections.json'),
    readJson('metadata.json'),
  ]);

  validateMarket(market);
  validateGondi(gondi);
  validateCollections(collections);

  assert(typeof metadata.generated_at === 'string', 'metadata.generated_at must be string');
  assert(typeof metadata.sources === 'object' && metadata.sources !== null, 'metadata.sources must be object');
  assert(typeof metadata.record_counts === 'object' && metadata.record_counts !== null, 'metadata.record_counts must be object');

  console.log('Static data validation passed.');
  console.log(`- market_offers: ${market.length}`);
  console.log(`- gondi_offers: ${gondi.length}`);
  console.log(`- collections: ${collections.length}`);
}

main().catch((error) => {
  console.error('Validation failed:', error.message);
  process.exitCode = 1;
});
