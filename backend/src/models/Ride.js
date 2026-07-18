import mongoose from 'mongoose';

const rideSchema = new mongoose.Schema(
  {
    passengerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Driver',
    },
    pickup: {
      type: String,
      required: true,
    },
    destination: {
      type: String,
      required: true,
    },
    pickupCoordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    destinationCoordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    distance: {
      type: Number, // In Kilometers
      required: true,
    },
    duration: {
      type: Number, // In Minutes
      required: true,
    },
    fare: {
      type: Number,
      required: true,
    },
    cabType: {
      type: String,
      enum: ['4 Seater', '5 Seater', '6 Seater', '7 Seater', 'Mini', 'Sedan', 'SUV', 'Auto'],
      required: true,
    },
    rideType: {
      type: String,
      enum: ['daily', 'outstation', 'rentals'],
      default: 'daily',
    },
    rideStatus: {
      type: String,
      enum: ['pending', 'accepted', 'started', 'completed', 'cancelled'],
      default: 'pending',
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
    },
    declinedDrivers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Driver',
      }
    ],
  },
  {
    timestamps: true,
  }
);

rideSchema.index({ pickupCoordinates: '2dsphere' });

export const Ride = mongoose.model('Ride', rideSchema);
