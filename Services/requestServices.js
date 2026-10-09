
import { Project } from "../models/project.js";
import { Panel } from "../models/panel.js";
import ErrorHandler from "../middlewares/error.js";
import User from "../models/user.js";
import { Deadline } from "../models/deadline.js";
import fs from "fs";

export const getAllRequests = async(filters) => {
    const query = { ...filters };
    
    const requests = await Project.find(query)
        .populate("student", "name email")
        .populate("panel", "panelName")
        .sort({ createdAt: -1 });

    const total = await Project.countDocuments(query);

    return { requests, total };
};


export const acceptRequest = async({requestId, teacherId}) => {
    const project = await Project.findById(requestId);
    
    if(!project) {
        throw new ErrorHandler("Project request not found", 404);
    }

    if(project.status !== "pending") {
        throw new ErrorHandler("Request has already been processed", 400);
    }

    if(project.panel) {
        const panel = await Panel.findById(project.panel).lean();
        const isTeacherInPanel = (panel?.teachers || []).some((id) => String(id) === String(teacherId));
        if(!panel || !isTeacherInPanel) {
            throw new ErrorHandler("Not authorized to approve this request", 403);
        }
    }

    project.status = "approved";
    await project.save();

    await project.populate([
        { path: "student", select: "name email" },
        { path: "panel", select: "panelName" },
    ]);

    return project;
};


export const rejectRequest = async({requestId, teacherId}) => {
    const project = await Project.findById(requestId)
        .populate("student", "name email")
        .populate("panel", "panelName teachers");
    
    if(!project) {
        throw new ErrorHandler("Project request not found", 404);
    }

    if(project.status !== "pending") {
        throw new ErrorHandler("Request has already been processed", 400);
    }

    if(project.panel) {
        const panel = await Panel.findById(project.panel).lean();
        const isTeacherInPanel = (panel?.teachers || []).some((id) => String(id) === String(teacherId));
        if(!panel || !isTeacherInPanel) {
            throw new ErrorHandler("Not authorized to reject this request", 403);
        }
    }

    const responsePayload = {
        _id: requestId,
        student: project.student,
        panel: project.panel,
        title: project.title,
        status: "rejected",
    };

    for (const file of project.files || []) {
        const filePath = file?.fileUrl;
        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch {
                // Keep processing even when single file cleanup fails.
            }
        }
    }

    await Deadline.deleteMany({ project: project._id });
    await Project.findByIdAndDelete(project._id);
    await User.findByIdAndUpdate(project.student?._id || project.student, { $set: { project: null } });

    return responsePayload;
};
