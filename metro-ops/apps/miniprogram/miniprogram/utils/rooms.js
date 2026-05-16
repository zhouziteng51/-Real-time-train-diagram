function globalRoom() {
  return "network:global";
}

function tripRoom(tripId) {
  return `trip:${tripId}`;
}

module.exports = {
  globalRoom,
  tripRoom,
};
