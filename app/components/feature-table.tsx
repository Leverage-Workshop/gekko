'use client'

import { useState } from 'react'
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equalsString,
  filterFn_includesString,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import type { FeatureRow } from '@/lib/features/featureList'
import { FeatureDetailDialog } from './feature-detail-dialog'
import { statusTone } from './feature-status'

/**
 * Features tab: the harness's own `feature_list.json` as a TanStack Table v9
 * grid with per-column sorting and per-column filtering, each row opening a
 * detail dialog with the untruncated description. The engine is
 * headless — every element below is this component's markup on DESIGN.md
 * tokens (hairline chrome, uppercase label headers, status tones borrowed from
 * the eval verdicts).
 *
 * v9 notes, since v8 examples do not transfer: features are registered
 * explicitly via `tableFeatures` (row-model slot after its feature), the hook
 * is `useTable` rather than `useReactTable`, and header/cell rendering goes
 * through `table.FlexRender`. State stays INTERNAL — `useTable` without a
 * selector subscribes to every registered slice, so a sort click or a filter
 * keystroke re-renders on its own; no controlled React state is needed here.
 */

const tableChrome = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    includesString: filterFn_includesString,
    equalsString: filterFn_equalsString,
  },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
})

const helper = createColumnHelper<typeof tableChrome, FeatureRow>()

/**
 * Grid descriptions are one scannable line; the row's dialog carries the rest.
 * Filtering still runs against the FULL description — truncating the cell must
 * not narrow what a search can find.
 */
const DESCRIPTION_LIMIT = 100

function truncate(text: string): string {
  return text.length > DESCRIPTION_LIMIT
    ? `${text.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`
    : text
}

const columns = helper.columns([
  helper.accessor('id', {
    header: 'ID',
    sortFn: 'alphanumeric',
    filterFn: 'includesString',
    cell: (info) => (
      <span className="font-bold tracking-tight text-bmw-blue">{info.getValue()}</span>
    ),
  }),
  helper.accessor('name', {
    header: 'Feature',
    sortFn: 'text',
    filterFn: 'includesString',
    cell: (info) => <span className="font-bold text-ink">{info.getValue()}</span>,
  }),
  helper.accessor('status', {
    header: 'Status',
    sortFn: 'text',
    filterFn: 'equalsString',
    cell: (info) => {
      const status = info.getValue()
      return (
        <span
          className={`whitespace-nowrap font-bold uppercase tracking-[1.5px] ${statusTone(status)}`}
        >
          {status}
        </span>
      )
    },
  }),
  helper.accessor((row) => row.dependencies.join(', '), {
    id: 'dependencies',
    header: 'Depends On',
    enableSorting: false,
    filterFn: 'includesString',
    cell: (info) => {
      const deps = info.getValue()
      return deps ? (
        <span className="font-light text-body">{deps}</span>
      ) : (
        <span className="font-light text-muted">—</span>
      )
    },
  }),
  helper.accessor('description', {
    header: 'Description',
    enableSorting: false,
    filterFn: 'includesString',
    cell: (info) => (
      <p className="font-light leading-relaxed text-body">{truncate(info.getValue())}</p>
    ),
  }),
])

/** Per-column column widths — the description must not shove the rest out. */
const COLUMN_WIDTH: Record<string, string> = {
  id: 'w-28',
  name: 'w-72',
  status: 'w-36',
  dependencies: 'w-48',
  description: 'w-auto',
}

const FILTER_PLACEHOLDER: Record<string, string> = {
  id: 'feat-0…',
  name: 'Search…',
  dependencies: 'feat-0…',
  description: 'Search…',
}

const inputClass =
  'h-8 w-full rounded-none border border-hairline bg-surface-card px-2 text-xs font-light text-ink outline-none transition-colors placeholder:text-muted focus:border-ink'

/** Sort indicator: the active direction, or a dot on a sortable idle column. */
function sortGlyph(direction: false | 'asc' | 'desc'): string {
  if (direction === 'asc') return '▲'
  if (direction === 'desc') return '▼'
  return '·'
}

export function FeatureTable({ rows }: { rows: FeatureRow[] }) {
  const [selected, setSelected] = useState<FeatureRow | null>(null)
  const table = useTable({
    features: tableChrome,
    columns,
    data: rows,
    initialState: {
      // Feature order, oldest first — the sequence the harness works in.
      sorting: [{ id: 'id', desc: false }],
      // The tab opens on the work that is left; Clear Filters drops even this.
      columnFilters: [{ id: 'status', value: 'not-started' }],
    },
    // A clicked column always carries a direction (asc ⇄ desc), never cycling
    // back to unsorted, which reads as "my click did nothing".
    enableSortingRemoval: false,
  })

  const visible = table.getRowModel().rows
  const statuses = [...new Set(rows.map((row) => row.status))].sort()
  const filtered = table.state.columnFilters.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
          <span className="text-ink">{visible.length}</span> of {rows.length} features
        </p>
        {filtered && (
          <button
            // `true` = the feature's blank state. The bare call would reset to
            // initialState, i.e. straight back to the not-started filter.
            onClick={() => table.resetColumnFilters(true)}
            className="border border-hairline px-3 py-1.5 text-xs font-bold uppercase tracking-[1.5px] text-body transition-colors hover:border-ink hover:text-ink"
          >
            Clear Filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto border border-hairline bg-surface-card">
        <table className="w-full border-collapse text-left">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} className="border-b border-hairline">
                {group.headers.map((header) => {
                  const column = header.column
                  const sorted = column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={`align-top px-4 py-3 ${COLUMN_WIDTH[column.id] ?? ''}`}
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      {header.isPlaceholder ? null : column.getCanSort() ? (
                        <button
                          onClick={column.getToggleSortingHandler()}
                          className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[1.5px] transition-colors ${
                            sorted ? 'text-ink' : 'text-muted hover:text-body'
                          }`}
                        >
                          <table.FlexRender header={header} />
                          <span aria-hidden="true" className={sorted ? 'text-bmw-blue' : ''}>
                            {sortGlyph(sorted)}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
                          <table.FlexRender header={header} />
                        </span>
                      )}

                      {column.getCanFilter() && (
                        <div className="mt-2">
                          {column.id === 'status' ? (
                            <select
                              value={(column.getFilterValue() as string) ?? ''}
                              onChange={(event) =>
                                column.setFilterValue(event.target.value || undefined)
                              }
                              aria-label="Filter by status"
                              className={inputClass}
                            >
                              <option value="">All</option>
                              {statuses.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={(column.getFilterValue() as string) ?? ''}
                              onChange={(event) =>
                                column.setFilterValue(event.target.value || undefined)
                              }
                              placeholder={FILTER_PLACEHOLDER[column.id] ?? 'Filter…'}
                              aria-label={`Filter by ${column.id}`}
                              className={inputClass}
                            />
                          )}
                        </div>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-6 text-sm font-light text-muted"
                >
                  No features match these filters.
                </td>
              </tr>
            )}
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelected(row.original)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelected(row.original)
                  }
                }}
                tabIndex={0}
                aria-label={`Open ${row.original.id} details`}
                className="cursor-pointer border-b border-hairline-strong align-top outline-none transition-colors hover:bg-surface-soft focus:bg-surface-soft"
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm">
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FeatureDetailDialog feature={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
