const { apiRequest } = require("../../utils/api");
const { dateOf, statusLabel, timeOf } = require("../../utils/format");

Page({
  data: {
    trip: null,
    events: [],
    tripStatus: "--",
    statusClass: "pill-gray",
    departureTime: "--",
    arrivalTime: "--",
  },

  async onLoad(query) {
    if (!query.id) return;
    const detail = await apiRequest(`/api/trips/${query.id}`);
    const events = detail.events.map((event) => ({
      ...event,
      occurredAtTime: event.occurredAt.slice(11, 19),
    }));
    this.setData({
      trip: detail.trip,
      events,
      tripStatus: statusLabel(detail.trip.status),
      statusClass: this.statusClassOf(detail.trip.status),
      departureTime: timeOf(detail.trip.plannedDepartureAt),
      arrivalTime: timeOf(detail.trip.plannedArrivalAt),
      departureDate: dateOf(detail.trip.plannedDepartureAt),
    });
  },

  statusClassOf(status) {
    switch (status) {
      case "ACTIVE":
        return "pill-green";
      case "ARRIVING_TERMINAL":
        return "pill-amber";
      case "ARCHIVED":
        return "pill-gray";
      default:
        return "pill-primary";
    }
  },
});
