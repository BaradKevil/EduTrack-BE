import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema({
            panelId :{
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: [true, "Panel ID is required for feedback"],
            },
            type: {
                type: String,
                enum: ["general", "positive", "negative"], 
                default: "general",
            },
            title: {
                type: String,
                required: [true, "Feedback title is required"],
                trim: true,
            },
            message: {
                type: String,
                required: [true, "Feedback message is required"],
                maxLength: [1000, "Feedback message cannot exceed 1000 characters"], 
                trim: true,
            },
            
}, { timestamps : true }
);

const projectSchema = new mongoose.Schema({
    student: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required:[true, "Student is required"],
    },
    panel:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Panel",
        default: null,
    },
    title: {
        type: String,
        required: [true, "Project title is required"],
        trim: true,
        maxLength: [200, "Project title cannot exceed 200 characters"],
    },
    description: {
        type: String,
        required: [true, "Project description is required"],
        trim: true,
        maxLength: [2000, "Project description cannot exceed 2000 characters"], 
    },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "completed"], 
        default: "pending",
    },
    files: [
        {
            fileType: {
                type: String,
                required: [true, "File type is required"],
            },
            fileUrl: {
                type: String,
                required: [true, "File URL is required"],
            },
            originalName: {
                type: String,
                required: [true, "Original file name is required"],
            },
            normalizedName: {
                type: String,
                default: "",
            },
            uploadedAt: {
                type: Date,
                default: Date.now,
            },
        }
    ],

    feedback: [feedbackSchema],

    deadline: {
        type: Date 
    },
},
        {timestamps: true} 
);

//Indexing for better query performance
projectSchema.index({ student: 1});
projectSchema.index({ supervisor: 1});
projectSchema.index({ status: 1});
projectSchema.index({ createdAt: -1});



export const Project = mongoose.models.project || mongoose.model("Project", projectSchema); 

