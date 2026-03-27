import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortState } from '@/components/data-grid/DataGrid';

function parseSortParam(raw: string | null): SortState | null {
  if (!raw) return null;
  const [column, dir] = raw.split(':');
  if (!column) return null;
  return { column, direction: dir === 'desc' ? 'desc' : 'asc' };
}

function encodeSortParam(sort: SortState): string {
  return `${sort.column}:${sort.direction}`;
}

const RESERVED_PARAMS = new Set(['sort', 'offset', 'limit']);

/**
 * Manages table state (sort, filters, offset pagination) via URL search params.
 * All state lives in the URL for bookmarkable/shareable views.
 */
export function useTableState(defaultLimit = 20) {
  const [searchParams, setSearchParams] = useSearchParams();

  const sort = useMemo(() => parseSortParam(searchParams.get('sort')), [searchParams]);
  const offset = Number(searchParams.get('offset') || '0');
  const limit = Number(searchParams.get('limit') || String(defaultLimit));

  // Derive filters: any param not in the reserved set
  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      if (!RESERVED_PARAMS.has(key) && value) {
        result[key] = value;
      }
    }
    return result;
  }, [searchParams]);

  const onSort = useCallback(
    (column: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const currentSort = parseSortParam(next.get('sort'));

          if (!currentSort || currentSort.column !== column) {
            next.set('sort', encodeSortParam({ column, direction: 'asc' }));
          } else if (currentSort.direction === 'asc') {
            next.set('sort', encodeSortParam({ column, direction: 'desc' }));
          } else {
            next.delete('sort');
          }
          next.delete('offset'); // reset pagination on sort change
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const onFilterChange = useCallback(
    (column: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) {
            next.set(column, value);
          } else {
            next.delete(column);
          }
          next.delete('offset'); // reset pagination on filter change
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const onPageChange = useCallback(
    (newOffset: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newOffset > 0) {
            next.set('offset', String(newOffset));
          } else {
            next.delete('offset');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Build query params object for API calls
  const queryParams = useMemo(() => {
    const params: Record<string, string | number | undefined> = {
      offset,
      limit,
    };
    if (sort) params.sort = encodeSortParam(sort);
    for (const [key, value] of Object.entries(filters)) {
      params[key] = value;
    }
    return params;
  }, [offset, limit, sort, filters]);

  return {
    sort,
    onSort,
    filters,
    onFilterChange,
    offset,
    limit,
    onPageChange,
    queryParams,
  };
}
