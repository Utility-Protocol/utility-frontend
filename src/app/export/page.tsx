"use client";

import { useState } from "react";
import { ExportDialog } from "@/components/panels/ExportDialog";

/**
 * Standalone host page for the bulk export dialog. Kept separate from the main
 * dashboard so the export flow can be driven and verified end to end.
 */
export default function ExportPage() {
  const [open, setOpen] = useState(false);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-xl font-bold tracking-tight">Resource Data Export</h1>
      <p className="max-w-md text-center text-sm text-muted-foreground">
        Export filtered resource-consumption data as CSV, GeoJSON or a zipped
        shapefile. Large queries are streamed in chunks and written straight to
        disk.
      </p>
      <button
        onClick={() => setOpen(true)}
        data-testid="open-export"
        className="rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
      >
        Open Export
      </button>
      <ExportDialog open={open} onClose={() => setOpen(false)} />
    </main>
  );
}
