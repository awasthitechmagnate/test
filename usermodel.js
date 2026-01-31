const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Role = require("./Role");

const UserSchema = new mongoose.Schema({
  projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
  llm_projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "LLM" }],
  bing_projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Bing" }],
  youtube_projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Youtube" }],
  localRank_projects: [
    { type: mongoose.Schema.Types.ObjectId, ref: "LocalRank" },
  ],
  aimode_projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "AiMode" }],
  appRank_projects: [{ type: mongoose.Schema.Types.ObjectId, ref: "AppRank" }],

  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  contact: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isDelete: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    default: "user",
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
  access: { type: Array },
});

UserSchema.pre("save", function (next) {
  this.updated_at = Date.now();
  next();
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("User", UserSchema);
