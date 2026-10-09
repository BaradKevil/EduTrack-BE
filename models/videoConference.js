import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        inviteStatus: {
            type: String,
            enum: ["pending", "accepted", "rejected"],
            default: "pending",
        },
        respondedAt: {
            type: Date,
            default: null,
        },
        joinedAt: {
            type: Date,
            default: null,
        },
    },
    { _id: false }
);

const videoConferenceSchema = new mongoose.Schema(
    {
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        panel: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Panel",
            required: true,
        },
        project: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project",
            default: null,
        },
        callType: {
            type: String,
            enum: ["individual", "conference"],
            required: true,
        },
        roomId: {
            type: String,
            required: true,
            trim: true,
        },
        meetingUrl: {
            type: String,
            required: true,
            trim: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        participants: {
            type: [participantSchema],
            default: [],
        },
        status: {
            type: String,
            enum: ["active", "completed", "cancelled"],
            default: "active",
        },
        startedAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 1000 * 60 * 60 * 4),
        },
    },
    { timestamps: true }
);

videoConferenceSchema.index({ teacher: 1, status: 1, createdAt: -1 });
videoConferenceSchema.index({ "participants.student": 1, status: 1, createdAt: -1 });

export const VideoConference =
    mongoose.models.VideoConference || mongoose.model("VideoConference", videoConferenceSchema);
