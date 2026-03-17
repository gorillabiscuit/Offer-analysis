import { useState, useEffect } from 'react';
import { Collection, loadCollections } from '../vanilla/services/data';

export type { Collection };

export function useCollections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const data = await loadCollections();
        // Keep only collections that have at least one WETH market loan row.
        let ethCollectionAddresses: Set<string> | null = null;
        try {
          const response = await fetch('/static/market_offers.json');
          if (response.ok) {
            const offers = await response.json();
            const rows = Array.isArray(offers) ? offers : [];
            ethCollectionAddresses = new Set(
              rows
                .filter((row: any) => String(row.currencySymbol || row.currency || '').toUpperCase() === 'WETH')
                .map((row: any) => String(
                  row.collectionAddress ||
                  row.collection_address ||
                  row.nftAddress ||
                  ''
                ).toLowerCase())
                .filter((address: string) => address.length > 0)
            );
          }
        } catch (_snapshotError) {
          // If snapshot lookup fails, keep original collection list.
        }

        const collectionsWithEthLoans = ethCollectionAddresses
          ? (data as Collection[]).filter((collection) =>
              ethCollectionAddresses!.has(String(collection.contract_address || '').toLowerCase())
            )
          : (data as Collection[]);

        // Guardrail: if ETH address filtering unexpectedly removes everything,
        // fall back to the full collection list instead of breaking the dropdown.
        setCollections(collectionsWithEthLoans.length > 0 ? collectionsWithEthLoans : (data as Collection[]));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCollections();
  }, []);

  return { collections, loading, error };
} 