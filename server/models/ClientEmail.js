const mongoose = require('mongoose');

const ClientEmailSchema = new mongoose.Schema({
  clientId:     { type: String, required: true, index: true }, // e.g. "-OzwW7f9cFHnbGbQUQON"
  clientName:   { type: String, default: '', index: true },    // e.g. "TanishqMehta"
  contactEmail: { type: String, required: true, trim: true },  // e.g. "tanishqmehta@gmail.com"
}, { timestamps: true });

module.exports = mongoose.model('ClientEmail', ClientEmailSchema);
