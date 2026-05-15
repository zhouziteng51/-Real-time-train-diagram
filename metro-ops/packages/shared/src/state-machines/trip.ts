import type { TripEventKind, TripStatus } from "../domain/trip.js";

export const TRIP_TRANSITIONS: Readonly<Record<TripStatus, readonly TripStatus[]>> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ARRIVING_TERMINAL", "CANCELLED"],
  ARRIVING_TERMINAL: ["ARCHIVED"],
  ARCHIVED: [],
  CANCELLED: [],
};

export const TRIP_EVENT_TO_TARGET: Readonly<Record<TripEventKind, TripStatus | null>> = {
  START: "ACTIVE",
  DEPART_ORIGIN: "ACTIVE",
  ENTER_TERMINAL_APPROACH: "ARRIVING_TERMINAL",
  ARRIVE_TERMINAL: "ARRIVING_TERMINAL",
  ARCHIVE: "ARCHIVED",
  CANCEL: "CANCELLED",
};

export class IllegalTripTransition extends Error {
  readonly from: TripStatus;
  readonly to: TripStatus;
  readonly event: TripEventKind;
  constructor(from: TripStatus, to: TripStatus, event: TripEventKind) {
    super(`illegal trip transition: ${from} --(${event})--> ${to}`);
    this.name = "IllegalTripTransition";
    this.from = from;
    this.to = to;
    this.event = event;
  }
}

export function canTransitionTrip(from: TripStatus, to: TripStatus): boolean {
  return TRIP_TRANSITIONS[from].includes(to);
}

export function nextTripStatus(from: TripStatus, event: TripEventKind): TripStatus {
  const to = TRIP_EVENT_TO_TARGET[event];
  if (to === null || to === undefined) {
    throw new IllegalTripTransition(from, from, event);
  }
  if (from === to) return from;
  if (!canTransitionTrip(from, to)) {
    throw new IllegalTripTransition(from, to, event);
  }
  return to;
}
