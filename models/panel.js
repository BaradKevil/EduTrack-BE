import mongoose from "mongoose";

const panelSchema = new mongoose.Schema(
    {
    panelName: {
        type: String,
        required: [true, "Panel name is required"],
        unique: true,
        trim: true,
    },
    teachers: {
        type: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        ],
        validate: {
        validator: function (arr) {
            return arr.length === 3;
        },
        message: "A panel must have exactly 3 teachers",
        },
    },
    department: {
        type: String,
        trim: true,
        default: null,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    
    },
    { timestamps: true }
);

export const Panel =
    mongoose.models.Panel || mongoose.model("Panel", panelSchema);