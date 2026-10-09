import mongoose from "mongoose";

const deadlineSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Deadline title is required"],
        trim: true,
        maxLength: [100, "Deadline title cannot exceed 100 characters"],
    },
    dueDate: {
        type: Date,
        required: [true, "Deadline due date is required"],
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Deadline creator is required"],
    },
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Project", 
        default: null,
    },
    description: {
        type: String,
        trim: true,
        maxLength: [1000, "Deadline description cannot exceed 1000 characters"], 
    },
    sevenDayAlertSentAt: {
        type: Date,
        default: null,
    },
},
        {timestamps: true} 
);

//Indexing for better query performance
deadlineSchema.index({ project: 1}); 
deadlineSchema.index({ dueDate: 1});
deadlineSchema.index({ createdBy: 1});

export const Deadline = mongoose.models.deadline || mongoose.model("Deadline", deadlineSchema); 
