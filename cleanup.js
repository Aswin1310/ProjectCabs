// Cleanup stale rides and driver status
var rideResult = db.rides.updateMany(
    { rideStatus: { $in: ['pending', 'accepted', 'started'] } },
    { $set: { rideStatus: 'cancelled' } }
);
print('Stale rides cancelled: ' + rideResult.modifiedCount);

var driverResult = db.drivers.updateMany({}, { $set: { isOnline: false } });
print('Drivers reset to offline: ' + driverResult.modifiedCount);

var pendingCheck = db.rides.countDocuments({ rideStatus: 'pending' });
print('Remaining pending rides: ' + pendingCheck);
var startedCheck = db.rides.countDocuments({ rideStatus: 'started' });
print('Remaining started rides: ' + startedCheck);
