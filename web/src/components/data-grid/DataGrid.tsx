import {
  type ColumnDef,
  type ColumnResizeMode,
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
  useReactTable,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  LayoutGrid,
  List,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ── Types ──────────────────────────────────────────────────────────────────

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}

export interface OffsetPagination {
  total: number;
  limit: number;
  offset: number;
}

export interface BulkAction {
  label: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary';
  action: (selectedIds: string[]) => Promise<void>;
}

export interface RowActionItem<T> {
  label: string | ((row: T) => string);
  onClick: (row: T) => void;
  className?: string;
  separator?: boolean;
}

export interface RowActionsConfig<T> {
  routePrefix?: string;
  onDelete?: (id: string | number) => void;
  deleteLabel?: string;
  extraItems?: RowActionItem<T>[];
}

interface DataGridProps<T extends { id: string | number }> {
  title?: string;
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** Offset-based pagination */
  pagination?: OffsetPagination;
  onPageChange?: (offset: number) => void;
  isLoading?: boolean;
  /** Row selection + bulk action buttons */
  bulkActions?: BulkAction[];
  /** Per-row action dropdown (View, Edit, Delete, extras) */
  rowActions?: RowActionsConfig<T>;
  /** Renders above the table on the right */
  headerActions?: ReactNode;
  /** Renders above the table on the left (e.g. filter buttons) */
  toolbarLeft?: ReactNode;
  /** Called when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Sort state */
  sort?: SortState | null;
  onSort?: (column: string) => void;
  sortableColumns?: string[];
  /** Inline column filtering */
  filters?: Record<string, string>;
  onFilterChange?: (column: string, value: string) => void;
  filterableColumns?: string[];
  /** Column resizing */
  enableResizing?: boolean;
  /** Message when no data */
  emptyMessage?: string;
  /** When provided, enables grid/table view toggle. Renders each item as a tile in grid mode. */
  tileRenderer?: (item: T) => ReactNode;
  /** Current view mode — controlled externally (e.g. via URL param) */
  viewMode?: 'table' | 'grid';
  /** Called when the view mode toggle is clicked */
  onViewModeChange?: (mode: 'table' | 'grid') => void;
}

// ── Sticky cell styles ─────────────────────────────────────────────────────

const stickyLeft = 'sticky left-0 z-20 !p-0 !bg-transparent';
const stickyRight = 'sticky right-0 z-20 !p-0 !bg-transparent';
const stickyTop = 'sticky top-0 z-10 bg-background';
const stickyTopLeft = 'sticky left-0 z-30 !p-0 !bg-transparent';
const stickyTopRight = 'sticky right-0 top-0 z-30 !p-0 !bg-transparent';

const pinnedOuter = 'flex h-full w-full items-center';
const pinnedOuterLeft = `${pinnedOuter} justify-start`;
const pinnedOuterRight = `${pinnedOuter} justify-end`;
const pinnedBtn =
  'flex items-center bg-background group-hover:bg-muted/50 group-data-[state=selected]:bg-muted transition-colors px-2 py-2';
const pinnedBtnHeader = 'flex items-center bg-background px-2 py-2';

// ── Sub-components ─────────────────────────────────────────────────────────

function SortIcon({ column, sort }: { column: string; sort?: SortState | null }) {
  if (sort?.column === column) {
    return sort.direction === 'asc' ? (
      <ArrowUp className="ml-1 inline size-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline size-3.5" />
    );
  }
  return <ArrowUpDown className="ml-1 inline size-3.5 opacity-40" />;
}

function FilterInput({
  column,
  value,
  onChange,
  onClose,
}: {
  column: string;
  value: string;
  onChange: (column: string, value: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onChange(column, val), 300);
    },
    [column, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onChange(column, '');
        onClose();
      }
    },
    [column, onChange, onClose],
  );

  return (
    <div className="flex w-full items-center gap-1">
      <Input
        ref={ref}
        defaultValue={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className="h-6 w-0 flex-1 text-xs"
        placeholder="Filter..."
      />
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => {
          onChange(column, '');
          onClose();
        }}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function ActionsCell<T extends { id: string | number }>({
  row,
  config,
}: {
  row: T;
  config: RowActionsConfig<T>;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">Actions</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {config.routePrefix && (
          <DropdownMenuItem onClick={() => navigate(`${config.routePrefix}/${row.id}`)}>
            View
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() => {
            navigator.clipboard.writeText(String(row.id));
          }}
        >
          Copy ID
        </DropdownMenuItem>
        {config.extraItems?.map((item) => {
          const label = typeof item.label === 'function' ? item.label(row) : item.label;
          return (
            <span key={label}>
              {item.separator && <DropdownMenuSeparator />}
              <DropdownMenuItem className={item.className} onClick={() => item.onClick(row)}>
                {label}
              </DropdownMenuItem>
            </span>
          );
        })}
        {config.onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => config.onDelete!(row.id)}>
              {config.deleteLabel ?? 'Delete'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── DataGrid ───────────────────────────────────────────────────────────────

export function DataGrid<T extends { id: string | number }>({
  title,
  columns,
  data,
  pagination,
  onPageChange,
  isLoading,
  bulkActions,
  rowActions,
  headerActions,
  toolbarLeft,
  onRowClick,
  sort,
  onSort,
  sortableColumns,
  filters,
  onFilterChange,
  filterableColumns,
  enableResizing,
  emptyMessage = 'No results.',
  tileRenderer,
  viewMode = 'table',
  onViewModeChange,
}: DataGridProps<T>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [filteringColumn, setFilteringColumn] = useState<string | null>(null);

  const hasSelect = !!bulkActions;
  const hasActions = !!rowActions;
  const sortableSet = new Set(sortableColumns ?? []);
  const filterableSet = new Set(filterableColumns ?? []);

  // Build full column list: [select?] + user columns + [actions?]
  const allColumns: ColumnDef<T, unknown>[] = [
    ...(hasSelect
      ? [
          {
            id: 'select',
            header: ({ table }: { table: ReturnType<typeof useReactTable<T>> }) => (
              <div className={pinnedOuterLeft}>
                <div className={pinnedBtnHeader}>
                  <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                    aria-label="Select all"
                  />
                </div>
              </div>
            ),
            cell: ({
              row,
            }: {
              row: ReturnType<typeof useReactTable<T>>['getRowModel'] extends () => {
                rows: Array<infer R>;
              }
                ? R
                : never;
            }) => (
              <div className={pinnedOuterLeft} onClick={(e) => e.stopPropagation()}>
                <div className={pinnedBtn}>
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
                    aria-label="Select row"
                  />
                </div>
              </div>
            ),
            size: 48,
            enableResizing: false,
          } satisfies ColumnDef<T, unknown>,
        ]
      : []),
    ...columns,
    ...(hasActions
      ? [
          {
            id: 'actions',
            size: 48,
            enableResizing: false,
            header: () => (
              <div className={pinnedOuterRight}>
                <div className={pinnedBtnHeader} />
              </div>
            ),
            cell: ({ row }) => (
              <div className={pinnedOuterRight} onClick={(e) => e.stopPropagation()}>
                <div className={pinnedBtn}>
                  <ActionsCell row={row.original} config={rowActions} />
                </div>
              </div>
            ),
          } satisfies ColumnDef<T, unknown>,
        ]
      : []),
  ];

  const columnResizeMode: ColumnResizeMode = 'onChange';

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
    ...(enableResizing && {
      columnResizeMode,
      enableColumnResizing: true,
      defaultColumn: { minSize: 100 },
    }),
  });

  const selectedIds = Object.keys(rowSelection);
  const hasSelection = selectedIds.length > 0;
  const lastIdx = allColumns.length - 1;

  const currentPage = pagination ? Math.floor(pagination.offset / pagination.limit) + 1 : 1;

  function cellClassName(idx: number, isHeader: boolean) {
    if (hasSelect && idx === 0) return isHeader ? stickyTopLeft : stickyLeft;
    if (hasActions && idx === lastIdx) return isHeader ? stickyTopRight : stickyRight;
    if (isHeader) return stickyTop;
    return '';
  }

  function renderHeader(
    header: ReturnType<typeof table.getHeaderGroups>[0]['headers'][0],
    _idx: number,
  ) {
    if (header.isPlaceholder) return null;

    const colKey = header.column.id;
    const isSortable = sortableSet.has(colKey) && !!onSort;
    const isFilterable = filterableSet.has(colKey) && !!onFilterChange;
    const isFiltering = filteringColumn === colKey;

    if (isFiltering && onFilterChange) {
      return (
        <FilterInput
          column={colKey}
          value={filters?.[colKey] ?? ''}
          onChange={onFilterChange}
          onClose={() => setFilteringColumn(null)}
        />
      );
    }

    const handleSort = isSortable ? () => onSort(colKey) : undefined;

    return (
      <div
        className={`flex w-full items-center justify-between gap-1${isSortable ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
        role={isSortable ? 'button' : undefined}
        tabIndex={isSortable ? 0 : undefined}
        onClick={handleSort}
        onKeyDown={
          isSortable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSort(colKey);
                }
              }
            : undefined
        }
      >
        <span className="truncate">
          {flexRender(header.column.columnDef.header, header.getContext())}
        </span>
        {(isSortable || isFilterable) && (
          <span className="flex shrink-0 items-center gap-0.5">
            {isSortable && <SortIcon column={colKey} sort={sort} />}
            {isFilterable && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setFilteringColumn(colKey);
                }}
              >
                <Filter className={`size-3 ${filters?.[colKey] ? 'text-primary' : ''}`} />
              </button>
            )}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Title bar / bulk action bar */}
      {(title || (hasSelection && bulkActions) || tileRenderer) && (
        <div className="flex h-14 shrink-0 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            {title && <h2 className="font-bold text-2xl">{title}</h2>}
            {tileRenderer && onViewModeChange && (
              <div className="flex items-center rounded-md border">
                <button
                  type="button"
                  className={`flex items-center justify-center rounded-l-md px-2 py-1.5 transition-colors ${viewMode === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => onViewModeChange('table')}
                >
                  <List className="size-4" />
                </button>
                <button
                  type="button"
                  className={`flex items-center justify-center rounded-r-md border-l px-2 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => onViewModeChange('grid')}
                >
                  <LayoutGrid className="size-4" />
                </button>
              </div>
            )}
          </div>
          {hasSelection && bulkActions && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">{selectedIds.length} selected</span>
              {bulkActions.map((action) => (
                <Button
                  key={action.label}
                  size="sm"
                  variant={action.variant ?? 'outline'}
                  onClick={async () => {
                    await action.action(selectedIds);
                    setRowSelection({});
                  }}
                  disabled={isLoading}
                >
                  {action.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
                Clear
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      {(toolbarLeft || headerActions) && (
        <div className="flex h-14 shrink-0 items-center justify-between px-6">
          <div className="flex items-center gap-2">{toolbarLeft}</div>
          <div className="flex items-center gap-2">{headerActions}</div>
        </div>
      )}

      {/* Content: Grid or Table */}
      {viewMode === 'grid' && tileRenderer ? (
        <div className="min-h-0 flex-1 overflow-auto px-6">
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={`skel-tile-${String(i)}`}
                  className="h-40 animate-pulse rounded-lg border bg-muted"
                />
              ))}
            </div>
          ) : data.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.map((item) => (
                <div
                  key={String(item.id)}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                  className={onRowClick ? 'cursor-pointer' : ''}
                >
                  {tileRenderer(item)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-muted-foreground">{emptyMessage}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto px-6">
          <div className="h-full overflow-auto rounded-md border">
            <Table
              style={
                enableResizing
                  ? {
                      width: Math.max(table.getCenterTotalSize(), 0),
                      minWidth: '100%',
                      tableLayout: 'fixed',
                    }
                  : undefined
              }
            >
              <TableHeader className="sticky top-0 z-40 bg-background">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header, idx) => (
                      <TableHead
                        key={header.id}
                        className={`${cellClassName(idx, true)} relative`}
                        style={{
                          width: header.getSize(),
                          ...(hasSelect && idx === 0
                            ? { position: 'sticky', left: 0, zIndex: 50 }
                            : {}),
                        }}
                      >
                        {renderHeader(header, idx)}
                        {enableResizing && header.column.getCanResize() && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            className={`absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none ${
                              header.column.getIsResizing() ? 'bg-primary' : 'hover:bg-border'
                            }`}
                          />
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skel-${String(i)}`}>
                      {allColumns.map((_, j) => (
                        <TableCell
                          key={`skel-${String(i)}-${String(j)}`}
                          className={cellClassName(j, false)}
                        >
                          <div className="h-4 w-full animate-pulse rounded bg-muted" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : table.getRowModel().rows.length > 0 ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={`group hover:bg-muted/50 ${onRowClick ? 'cursor-pointer' : ''}`}
                      data-state={row.getIsSelected() && 'selected'}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    >
                      {row.getVisibleCells().map((cell, idx) => (
                        <TableCell
                          key={cell.id}
                          className={`${cellClassName(idx, false)}${cell.column.getCanResize() ? 'overflow-hidden truncate' : ''}`}
                          style={enableResizing ? { width: cell.column.getSize() } : undefined}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={allColumns.length}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {pagination && (
        <div className="flex shrink-0 items-center justify-between px-6 py-3">
          <span className="text-muted-foreground text-sm">Page {currentPage}</span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.offset === 0}
              onClick={() => onPageChange?.(Math.max(0, pagination.offset - pagination.limit))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.offset + pagination.limit >= pagination.total}
              onClick={() => onPageChange?.(pagination.offset + pagination.limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
