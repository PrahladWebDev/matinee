import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    relPath: { type: String, required: true, unique: true },     // relative to MEDIA_ROOT
    filename: String,
    size: { type: Number, default: 0 },
    mimeType: { type: String, default: 'video/mp4' },
    duration: { type: Number, default: 0 },
    hasThumb: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Video = mongoose.model('Video', schema);
