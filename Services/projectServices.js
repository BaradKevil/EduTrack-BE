import ErrorHandler from "../middlewares/error.js";
import {Project} from "../models/project.js";
import { Panel } from "../models/panel.js";
import User from "../models/user.js";
import { Deadline } from "../models/deadline.js";
import fs from "fs";

const normalizeFileNameKey = (name = "") => {
    const normalized = String(name).trim().toLowerCase();
    const lastDotIndex = normalized.lastIndexOf(".");
    const withoutExtension =
        lastDotIndex > 0 ? normalized.slice(0, lastDotIndex) : normalized;
    return withoutExtension.replace(/\s+/g, " ");
};

const removeProjectsWithAssets = async (projects) => {
    const projectIds = projects.map((project) => project._id);

    for (const project of projects) {
        for (const file of project.files || []) {
            const filePath = file?.fileUrl;
            if (filePath && fs.existsSync(filePath)) {
                try {
                    fs.unlinkSync(filePath);
                } catch {
                    // Continue cleanup even if a file cannot be removed.
                }
            }
        }
    }

    if (projectIds.length > 0) {
        await Deadline.deleteMany({ project: { $in: projectIds } });
        await Project.deleteMany({ _id: { $in: projectIds } });
    }
};

export const cleanupOrphanProjects = async () => {
    const validPanelIds = await Panel.distinct("_id");

    const orphanStudents = await User.find({
        role: "Student",
        $or: [
            { panel: null },
            { panel: { $exists: false } },
            { panel: { $nin: validPanelIds } },
        ],
    }).select("_id");

    const orphanStudentIds = orphanStudents.map((student) => student._id);
    if (orphanStudentIds.length === 0) {
        return;
    }

    const orphanProjects = await Project.find({
        student: { $in: orphanStudentIds },
    }).select("_id files");

    if (orphanProjects.length > 0) {
        await removeProjectsWithAssets(orphanProjects);
    }

    await User.updateMany(
        { _id: { $in: orphanStudentIds } },
        { $set: { project: null } }
    );
};

export const cleanupRejectedProjects = async () => {
    const rejectedProjects = await Project.find({ status: "rejected" }).select("_id files student");
    if (rejectedProjects.length === 0) {
        return;
    }

    const rejectedProjectIds = rejectedProjects.map((project) => project._id);

    await removeProjectsWithAssets(rejectedProjects);

    await User.updateMany(
        { project: { $in: rejectedProjectIds } },
        { $set: { project: null } }
    );
};

export const getProjectByStudent = async (studentId) => {

    await cleanupOrphanProjects();

    const student = await User.findById(studentId).select("project").lean();
    if (student?.project) {
        const linkedProject = await Project.findById(student.project);
        if (linkedProject) return linkedProject;
    }

    const latestProject = await Project.findOne({ student: studentId }).sort({ createdAt: -1 });
    if (latestProject) {
        await User.findByIdAndUpdate(studentId, { $set: { project: latestProject._id } });
    }
    return latestProject;
}


export const createProject = async (projectData) => {
    const project = new Project(projectData);
    await project.save();
    return  project;
}


export const getProjectById = async (id) => {

    const project = await Project.findById(id)
    .populate("student", "name email")
    .populate("feedback.panelId", "name email");
    if(!project){
        throw new ErrorHandler("Project not found", 404);
    }
    return project;
};


export const addFilesToProject = async (projectId, files) => {
    const project = await Project.findById(projectId)

    if(!project){
        throw new ErrorHandler("Project not found", 404);
    }

    const currentStatus = String(project.status || "").toLowerCase();
    if (currentStatus === "completed") {
        throw new ErrorHandler("Completed projects are locked. You can no longer upload or modify files.", 400);
    }

    if (!project.panel) {
        const student = await User.findById(project.student).select("panel").lean();
        if (student?.panel) {
            project.panel = student.panel;
        }
    }

    const incomingNames = files.map((file) => file.originalname);
    const incomingNameKeys = incomingNames.map((name) => normalizeFileNameKey(name));

    const duplicateNamesInRequest = [];
    const seenIncoming = new Set();
    incomingNameKeys.forEach((key, index) => {
        if (!key) return;
        if (seenIncoming.has(key)) {
            duplicateNamesInRequest.push(incomingNames[index]);
        } else {
            seenIncoming.add(key);
        }
    });

    if (duplicateNamesInRequest.length > 0) {
        throw new ErrorHandler(
            `Already has same file name: ${[...new Set(duplicateNamesInRequest)].join(", ")}. Change file name.`,
            400
        );
    }

    const existingProjects = await Project.find({ "files.0": { $exists: true } })
        .select("files.originalName files.normalizedName")
        .lean();

    const existingNameMap = new Map();
    for (const existingProject of existingProjects) {
        for (const file of existingProject.files || []) {
            const key = file?.normalizedName || normalizeFileNameKey(file?.originalName);
            if (!key) continue;
            if (!existingNameMap.has(key)) {
                existingNameMap.set(key, file?.originalName || key);
            }
        }
    }

    const conflictingNames = [];
    incomingNameKeys.forEach((key, index) => {
        if (!key) return;
        if (existingNameMap.has(key)) {
            conflictingNames.push(incomingNames[index] || existingNameMap.get(key));
        }
    });

    if (conflictingNames.length > 0) {
        throw new ErrorHandler(
            `Already has same file name: ${[...new Set(conflictingNames)].join(", ")}. Change file name.`,
            400
        );
    }

    const fileMetadata = files.map((file) => ({
        fileType: file.mimetype,
        fileUrl: file.path,
        originalName: file.originalname, 
        normalizedName: normalizeFileNameKey(file.originalname),
        uploadedAt: new Date(), 
    }));

    project.files.push(...fileMetadata);
    await project.save();

    return project;
}; 


export const getAllProjects = async () => {
    await cleanupOrphanProjects();
    await cleanupRejectedProjects();

    const students = await User.find({ role: "Student", project: { $ne: null } })
        .select("project")
        .lean();

    const activeProjectIds = students
        .map((student) => student.project)
        .filter(Boolean);

    if (activeProjectIds.length === 0) {
        return [];
    }

    const projects = await Project.find({ _id: { $in: activeProjectIds } })
        .populate({
            path: "student",
            select: "name email panel",
            populate: {
                path: "panel",
                select: "panelName teachers",
                populate: {
                    path: "teachers",
                    select: "name",
                },
            },
        })
        .populate({
            path: "panel",
            select: "panelName teachers",
            populate: {
                path: "teachers",
                select: "name",
            },
        })
        .populate("feedback.panelId", "name email")
        .sort({ createdAt: -1 })
        .lean();

    // Some legacy records keep panel on student only. Normalize so UI always gets a panel object.
    return projects.map((project) => ({
        ...project,
        panel: project.panel || project.student?.panel || null,
    }));
}


export const markComplete = async (projectId) => {
    const project = await Project.findById(projectId);
    if (!project) {
        throw new ErrorHandler("Project not found", 404);
    }

    const currentStatus = String(project.status || "").toLowerCase();
    if (currentStatus !== "approved") {
        throw new ErrorHandler("Only approved projects can be marked as completed", 400);
    }

    project.status = "completed";
    await project.save();

    return await Project.findById(projectId)
        .populate("student", "name email")
        .populate("panel", "panelName");
};


export const addFeedback = async (
    projectId, 
    panelId,
    message,
    title,
    type
) => {
    const project = await Project.findById(projectId);

    if(!project){
        throw new ErrorHandler("Project not found", 404);
    }

    project.feedback.push({
        panelId,
        message,
        title,
        type,
    });

    await project.save();
    const latestFeedback = project.feedback[project.feedback.length - 1];

    return {project, latestFeedback};

}


export const getProjectByPanel = async (panelId) => {
    const projects = await Project.find({ panel: panelId })
        .populate("student", "name email")
        .populate("panel", "panelName")
        .populate("feedback.panelId", "name email")
        .sort({ createdAt: -1 })
        .lean();
    return projects;
}


