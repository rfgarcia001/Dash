import { useCallback, useState } from 'react';

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export function useSortState(initial: SortState): [SortState, (column: string) => void] {
  const [sort, setSort] = useState<SortState>(initial);

  const toggle = useCallback((column: string) => {
    setSort((prev) => prev.column === column
      ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { column, direction: 'desc' });
  }, []);

  return [sort, toggle];
}
