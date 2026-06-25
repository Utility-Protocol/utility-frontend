"use client";

interface Column<T> {
  key: string;
  header: string;
  /** If true, this column is hidden in compact (< 600px) mode via CSS */
  secondary?: boolean;
  render: (row: T) => React.ReactNode;
}

interface DataGridProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
}

/**
 * CSS Container-query-driven Data Grid.
 *
 * Column visibility, row density, and font sizing are all driven by
 * @container queries in containers.css. The component renders ALL
 * columns into the DOM and lets CSS hide secondary columns when the
 * container is compact (< 600px).
 */
export function DataGrid<T extends { id: string }>({
  columns,
  rows,
}: DataGridProps<T>) {
  return (
    <div className="container-data-grid data-grid-responsive border border-border rounded-xl bg-background overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`data-grid-cell-${col.secondary ? "secondary" : "primary"} text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="data-grid-row border-b border-border hover:bg-accent/30 transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`data-grid-cell-${col.secondary ? "secondary" : "primary"} px-4`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            No data available
          </div>
        )}
      </div>
    </div>
  );
}
