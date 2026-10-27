import mongoose from 'mongoose';

// tiny key/value store for site settings (e.g. the private-folder PIN hash)
const schema = new mongoose.Schema(
  { key: { type: String, required: true, unique: true }, value: mongoose.Schema.Types.Mixed },
  { timestamps: true }
);

export const Setting = mongoose.model('Setting', schema);
