"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";
import { FleetGrid } from "@/components/spatial/FleetGrid";
import { useWeb3Auth } from "@/hooks/useWeb3Auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { GracefulDegradationDashboard } from "@/components/dashboard/GracefulDegradationDashboard";

const GridMapSkeleton = () => (
  <div className="w-full h-[500px] rounded-xl bg-muted animate-pulse flex items-center justify-center border border-border">
    <span className="text-sm text-muted-foreground">Loading Grid Map...</span>
  </div>
);

const LiveDataViewSkeleton = () => (
  <div className="w-full h-[200px] rounded-xl bg-muted animate-pulse flex items-center justify-center border border-border">
    <span className="text-sm text-muted-foreground">Loading Live Telemetry...</span>
  </div>
);

const TariffEditorSkeleton = () => (
  <div className="w-full h-[300px] rounded-xl bg-muted animate-pulse flex items-center justify-center border border-border">
    <span className="text-sm text-muted-foreground">Loading Tariff Configuration...</span>
  </div>
);

const TxModalSkeleton = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-pulse">
    <div className="w-full max-w-md h-[300px] rounded-xl border border-border bg-background p-6 space-y-4 shadow-2xl" />
  </div>
);

const GridMap = dynamic(
  () => import("@/components/spatial/GridMap").then((m) => m.GridMap),
  {
    ssr: false,
    loading: () => <GridMapSkeleton />,
  }
);

const LiveDataView = dynamic(
  () => import("@/components/spatial/LiveDataView").then((m) => m.LiveDataView),
  {
    ssr: false,
    loading: () => <LiveDataViewSkeleton />,
  }
);

const TariffEditor = dynamic(
  () => import("@/components/tariffs/TariffEditor").then((m) => m.TariffEditor),
  {
    loading: () => <TariffEditorSkeleton />,
  }
);

// We define TxModal here as well to satisfy the requirements, in case it gets used.
const TxModal = dynamic(
  () => import("@/components/wallet/TxModal").then((m) => m.TxModal),
  {
    ssr: false,
    loading: () => <TxModalSkeleton />,
  }
);

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
            <ThemeToggle />
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
        <SloMonitoringPanel />

        <section>
          <GracefulDegradationDashboard />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Grid Network</h2>
          <Suspense fallback={<GridMapSkeleton />}>
            <GridMap />
          </Suspense>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Fleet Overview</h2>
          <FleetGrid />
        </section>

        <DisasterRecoveryPanel />

        <section>
          <h2 className="text-lg font-semibold mb-4">Live Telemetry</h2>
          <Suspense fallback={<LiveDataViewSkeleton />}>
            <LiveDataView />
          </Suspense>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Runtime Configuration</h2>
          <RuntimeConfigAuditPanel />
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Tariff Configuration</h2>
          <Suspense fallback={<TariffEditorSkeleton />}>
            <TariffEditor />
          </Suspense>
        </section>

        <Suspense fallback={null}>
          <TxModal
            open={false}
            onClose={() => {}}
            onConfirm={async () => {}}
            operation=""
            resourceFee=""
            balance=""
          />
        </Suspense>
      </main>

      <footer className="border-t border-border py-4 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} Utility Protocol. All rights reserved.
      </footer>
    </div>
  );
}
