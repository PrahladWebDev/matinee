import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },          // display name (renamable)
    dirName: { type: String, required: true },                   // real directory name on disk
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    path: { type: String, required: true, unique: true },        // relative to MEDIA_ROOT, posix style
    // private folder: its videos (and every sub-folder's) stay off Home, search and random shuffle;
    // they can only be played by opening the folder directly
    isPrivate: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Folder = mongoose.model('Folder', schema);
