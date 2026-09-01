import { create } from "zustand";

export interface DiamondFlight {
  id: number;
  from: { x: number; y: number };
  amount: number;
}

let nextFlightId = 0;

interface DiamondRewardState {
  flights: DiamondFlight[];
  addFlight: (from: { x: number; y: number }, amount?: number) => void;
  removeFlight: (id: number) => void;
}

// Queues components/flying-diamond.tsx animations triggered from anywhere
// in the app (the lesson wizard's theory/quiz steps, the preschool balloon
// game, ...) — rendered once by components/diamond-reward-overlay.tsx,
// mounted in the root layout so a flight survives whichever page triggered
// it and still renders even when the header itself is hidden (see
// components/header.tsx's fullscreen-preschool-lesson early return —
// FlyingDiamond falls back to a fixed corner target in that case). No
// persist middleware: a flight mid-animation on reload isn't worth
// resuming.
export const useDiamondRewardStore = create<DiamondRewardState>((set) => ({
  flights: [],
  addFlight: (from, amount = 1) =>
    set((state) => ({ flights: [...state.flights, { id: nextFlightId++, from, amount }] })),
  removeFlight: (id) => set((state) => ({ flights: state.flights.filter((flight) => flight.id !== id) })),
}));
