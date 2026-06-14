"use client";

import { GridMap } from "@/components/spatial/GridMap";
import { FleetGrid } from "@/components/spatial/FleetGrid";
import { LiveDataView } from "@/components/spatial/LiveDataView";
import { TariffEditor } from "@/components/tariffs/TariffEditor";
import { useWeb3Auth } from "@/hooks/useWeb3Auth";

export default function Home() {
  const { account, isConnected, connect, disconnect } = useWeb3Auth();

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3 max-w-7xl mx-auto w-full">
          <h1 className="text-xl font-bold tracking-tight">
            Utility Protocol
          </h1>
          <nav className="flex items-center gap-4">
            {isConnected ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground truncate max-w-[160px]">
                  {account?.address?.slice(0, 6)}...{account?.address?.slice(-4)}
                </span>
                <button
                  onClick={disconnect}
                  className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connect}
                className="rounded-lg bg-foreground text-background px-4 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Connect Wallet
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold mb-4">Grid Network</h2>
          <GridMap />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Fleet Overview</h2>
          <FleetGrid />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Live Telemetry</h2>
          <LiveDataView />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Tariff Configuration</h2>
          <TariffEditor />
        </section>
      </main>

      <footer className="border-t border-border py-4 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Utility Protocol. All rights reserved.
      </footer>
    </div>
  );
}
