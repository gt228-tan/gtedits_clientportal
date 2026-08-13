const { GridFSBucket } = require('mongodb');
const { getDb } = require('./db');

const BUCKET_NAME = 'deliverables';

/**
 * Returns a GridFSBucket instance using the active Mongoose connection.
 * Call this only AFTER connectDB() has resolved.
 */
function getDeliverablesBucket() {
  const db = getDb();
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
}

module.exports = { getDeliverablesBucket };
