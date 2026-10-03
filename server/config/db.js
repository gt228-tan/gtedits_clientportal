const mongoose = require('mongoose');

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return mongoose.connection;
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    throw err;
  }
};

// Expose the native driver Db instance for GridFSBucket
function getDb() {
  const state = mongoose.connection.readyState;
  if (state !== 1) throw new Error('MongoDB not connected (readyState=' + state + ')');
  return mongoose.connection.db;
}

module.exports = connectDB;
module.exports.getDb = getDb;
