import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required:[true, "User is required"], 
    },
    message: {
        type: String,
        required: [true, "Notification message is required"],
        trim: true,
        maxLength: [1000, "Notification message cannot exceed 1000 characters"],
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    link: {
        type: String,
        default: null,
    },
    type: {
        type: String,
        enum: ["general", "request", "feedback", "approval", "rejection", "deadline", "meeting", "system", "delete", "upload", "communication", "other"],
        default: "general",
    },
    priority: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium",
    },
    sender: {
        name: {
            type: String,
            trim: true,
            default: null,
        },
        email: {
            type: String,
            trim: true,
            default: null,
        },
        role: {
            type: String,
            trim: true,
            default: null,
        },
        panelName: {
            type: String,
            trim: true,
            default: null,
        },
    },
    senderLine: {
        type: String,
        trim: true,
        default: null,
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
},
        {timestamps: true} 
);

//Indexing for better query performance
notificationSchema.index({ user: 1});
notificationSchema.index({ isRead: 1}); 

export const Notification = mongoose.models.notification || mongoose.model("Notification", notificationSchema); 

