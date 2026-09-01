"use client";

import { FlyingDiamond } from "@/components/flying-diamond";
import { useDiamondRewardStore } from "@/stores/diamond-reward-store";

// Mounted once in app/[locale]/layout.tsx, alongside <Header/> — renders
// every queued diamond-reward flight (see stores/diamond-reward-store.ts)
// regardless of which page/component triggered it.
export function DiamondRewardOverlay() {
  const flights = useDiamondRewardStore((s) => s.flights);
  const removeFlight = useDiamondRewardStore((s) => s.removeFlight);

  return (
    <>
      {flights.map((flight) => (
        <FlyingDiamond
          key={flight.id}
          from={flight.from}
          amount={flight.amount}
          onDone={() => removeFlight(flight.id)}
        />
      ))}
    </>
  );
}
