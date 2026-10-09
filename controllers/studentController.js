import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import User from "../models/user.js";
import * as userServices from "../Services/userServices.js"; 
import * as projectService from "../Services/projectServices.js";
import * as notificationService from "../Services/notificationServices.js";
import { Project } from "../models/project.js";
import { Panel } from "../models/panel.js";
import { Notification } from "../models/notification.js";
import { Deadline } from "../models/deadline.js";
import * as fileServices  from "../Services/fileServices.js";
import { sendSevenDayDeadlineAlerts } from "../Services/deadlineServices.js";
import * as videoConferenceService from "../Services/videoConferenceService.js";
import { VideoConference } from "../models/videoConference.js";
import { inferSenderFromNotification } from "../utils/notificationSender.js";
import fs from "fs";


export const getStudentProject = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;

    await projectService.cleanupOrphanProjects();

    const project = await projectService.getProjectByStudent(studentId); 

    if(!project){
        return res.status(404).json({
            success: true,
            data: {project: null},
            message: "No project found for this student",
        });
    }
    res.status(200).json({          
            success: true,
            data: {project},
    });
});


export const submitProposal = asyncHandler(async(req,res,next) => {
    const { title, description } = req.body;
    const studentId = req.user._id;
    const student = await User.findById(studentId).select("panel");

    if (!student?.panel) {
        return next(new ErrorHandler("You are not assigned to any panel.", 400));
    }

    const assignedPanel = await Panel.findById(student.panel).select("_id panelName teachers").lean();
    if (!assignedPanel) {
        await User.findByIdAndUpdate(studentId, { $set: { panel: null } }, { new: true });
        return next(new ErrorHandler("You are not assigned to any panel.", 400));
    }

    const existingProject = await projectService.getProjectByStudent(studentId);

    if (existingProject) {
        const currentStatus = String(existingProject.status || "").toLowerCase();

        if (currentStatus === "pending" || currentStatus === "approved") {
            return next(
                new ErrorHandler(
                    "You already have an active proposal. You can submit a new proposal only after rejection or completion.",
                    400
                )
            );
        }

        if (
            currentStatus !== "rejected" &&
            currentStatus !== "completed"
        ) {
            return next(
                new ErrorHandler(
                    "You cannot submit a new proposal right now. New proposal is allowed only when previous one is rejected or completed.",
                    400
                )
            );
        }
    }

    if(existingProject && String(existingProject.status || "").toLowerCase() === "rejected"){
        await Project.findByIdAndDelete(existingProject._id);
    }

    const projectData = {
        student: studentId,
        panel: student.panel,
        title,
        description,
    };
    const project = await projectService.createProject(projectData);

    await User.findByIdAndUpdate(studentId, {                 
        $set: { project: project._id }
    }, { new: true });

    try {
        await notificationService.notifyAdmins(
            `${req.user.name} submitted a new project proposal: "${project.title}"`,
            "request",
            "/admin/projects",
            "medium"
        );

        const panelTeacherIds = (assignedPanel?.teachers || []).map((id) => String(id));
        if (panelTeacherIds.length > 0) {
            await Promise.all(
                panelTeacherIds.map((teacherId) =>
                    notificationService.notifyUser(
                        teacherId,
                        `${req.user.name} submitted a new project proposal "${project.title}" in ${assignedPanel?.panelName || "your panel"}.`,
                        "request",
                        "/teacher/pending",
                        "medium"
                    )
                )
            );
        }

        await notificationService.notifyUser(
            studentId,
            `Your project proposal "${project.title}" was submitted successfully and sent to admin and panel teachers.`,
            "request",
            "/student/notifications",
            "low"
        );
    } catch (notifyError) {
        console.error("Admin proposal notification failed:", notifyError.message);
    }

    res.status(201).json({
        success: true,
        message: "Project proposal submitted successfully", 
        data: {project},
    });
});


export const uploadFiles = asyncHandler(async(req,res,next) => {
    const{projectId} = req.params;
    const studentId = req.user._id;
    const project = await projectService.getProjectById(projectId); 
    const student = await User.findById(studentId).select("panel name").lean();

    const projectStudentId = project?.student?._id || project?.student;

    if(!project || projectStudentId.toString() !== studentId.toString()){
        return next(new ErrorHandler("Project not found or you are not authorized to upload file for this project", 404));
    }

    const currentStatus = String(project?.status || "").toLowerCase();
    if (currentStatus === "completed") {
        return next(new ErrorHandler("Project is completed. File uploads and modifications are locked.", 400));
    }

    if(!req.files || req.files.length === 0){
        return next(new ErrorHandler("No files uploaded", 400));
    }

    let updatedProject;
    try {
        updatedProject = await projectService.addFilesToProject(projectId, req.files);
    } catch (error) {
        // Prevent orphan files on disk when validation fails after multer writes files.
        (req.files || []).forEach((file) => {
            if (file?.path && fs.existsSync(file.path)) {
                try {
                    fs.unlinkSync(file.path);
                } catch {
                    // Keep original validation error as response.
                }
            }
        });
        return next(error);
    }

    const uploadedCount = Array.isArray(req.files) ? req.files.length : 0;
    const panelId = project?.panel || student?.panel;

    try {
        await notificationService.notifyAdmins(
            `${req.user.name || "Student"} uploaded ${uploadedCount} file${uploadedCount === 1 ? "" : "s"} for project "${project.title}".`,
            "upload",
            "/admin/projects",
            "medium"
        );
    } catch (notifyError) {
        console.error("Admin upload notification failed:", notifyError.message);
    }

    if (panelId) {
        try {
            const panel = await Panel.findById(panelId).select("teachers panelName").lean();
            const teacherIds = (panel?.teachers || []).map((id) => String(id));

            await Promise.all(
                teacherIds.map((teacherId) =>
                    notificationService.notifyUser(
                        teacherId,
                        `${req.user.name || "Student"} uploaded ${uploadedCount} file${uploadedCount === 1 ? "" : "s"} to project "${project.title}".`,
                        "upload",
                        "/teacher/files",
                        "low"
                    )
                )
            );
        } catch (notifyError) {
            console.error("Panel upload notification failed:", notifyError.message);
        }
    }

    res.status(200).json({
        success: true,
        message: "Files uploaded successfully",
        data: {project: updatedProject},
    }); 
});


export const getPanelDetails = asyncHandler(async(req,res,next) => {
    const studentId = req.user._id;

    const student = await User.findById(studentId)
        .select("panel")
        .populate({
            path: "panel",
            populate: {
                path: "teachers",
                select: "name email department expertise",
            },
        });

    res.status(200).json({
        success: true,
        data: { panel: student?.panel || null },
    });
});


export const getDashboardStats = asyncHandler(async(req,res,next) => {
    const studentId = req.user._id;

    await sendSevenDayDeadlineAlerts(studentId);

    await projectService.cleanupOrphanProjects();

    const student = await User.findById(studentId)
    .select("panel")
    .populate("panel", "panelName")
    .lean();

    const project = await Project.findOne({student : studentId})
    .populate("panel", "panelName")
    .populate("feedback.panelId", "name role")
    .sort({ createdAt: -1 })
    .lean();
    

    const now = new Date();
    
    let upcomingDeadlines = [];
    if (project?._id) {
        upcomingDeadlines = await Deadline.find({
            project: project._id,
            dueDate: {$gte : now},
        })
        .select("name dueDate description")
        .sort({ dueDate: 1 })
        .limit(5)
        .lean();
    }

    const topNotificationsRaw = await Notification.find({user : studentId})
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

    const topNotifications = await Promise.all(
        topNotificationsRaw.map(async (notification) => {
            const inferred = await inferSenderFromNotification(notification);
            if (!inferred) return notification;

            return {
                ...notification,
                sender: {
                    ...(notification.sender || {}),
                    ...(inferred.sender || {}),
                },
                senderLine: inferred.senderLine || notification.senderLine || null,
            };
        })
    );

    const feedbackNotifications = project?.feedback && project.feedback.length > 0 
        ? [...project.feedback]
            .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0,5)
            .map((feedback) => {
                const role = String(feedback?.panelId?.role || "").toLowerCase();
                const senderName = feedback?.panelId?.name || "Unknown";
                const senderLabel = role === "admin"
                    ? `Admin (${senderName})`
                    : `Panel (${senderName})`;

                return {
                    ...feedback,
                    senderRole: role || "teacher",
                    senderName,
                    senderLabel,
                };
            })
        : [];

    const panelName = project?.panel?.panelName || student?.panel?.panelName || null;
    const normalizedProject = project
        ? {
            ...project,
            panel: project.panel || student?.panel || null,
        }
        : null;

    res.status(200).json({
        success:true,
        message:"Dashboard stats fetched successfully",
        data: {
            projects: normalizedProject,
            upcomingDeadlines,
            topNotifications,
            feedbackNotifications: feedbackNotifications,
            feedbackList: feedbackNotifications,
            panelName
        },
    });
});


export const getFeedback = asyncHandler(async(req,res,next) => {
    const { projectId } = req.params;
    const studentId = req.user._id;

    let project;
    try {
        project = await projectService.getProjectById(projectId);
    } catch (err) {
        return next(new ErrorHandler("Project not found", 404));
    }

    if(!project || project.student._id.toString() !== studentId.toString()){
        return next(new ErrorHandler("Not authorized to view feedback for this project", 403));
    }

    const sortedFeedback = [...project.feedback]
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((f) => ({
        _id: f._id,
        title: f.title,
        message: f.message,
        type: f.type,
        createdAt: f.createdAt,
        panelName: f.panelId?.name,
        panelEmail: f.panelId?.email,
    }));

    res.status(200).json({
        success: true,
        data: { feedback: sortedFeedback },
    });
});


export const downloadFile = asyncHandler(async(req,res,next) => {
    const {projectId, fileId} = req.params;
    const studentId = req.user._id;

    const project = await projectService.getProjectById(projectId);
    if(!project) return next(new ErrorHandler("Project not found", 404));

    if(project.student._id.toString() !== studentId.toString()){
        return next(new ErrorHandler("Not authorized to download files for this project", 403)); 
    }

    const file = project.files.id(fileId);
    if(!file) return next(new ErrorHandler("File not found", 404));

    fileServices.streamDownload(file.fileUrl, res, file.originalName);
});


export const sendNotificationToAdmins = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;
    const { message, priority = "medium" } = req.body || {};

    const cleanedMessage = String(message || "").trim();
    const allowedPriorities = ["low", "medium", "high"];

    if (!cleanedMessage) {
        return next(new ErrorHandler("Message is required", 400));
    }

    if (!allowedPriorities.includes(String(priority).toLowerCase())) {
        return next(new ErrorHandler("Invalid priority value", 400));
    }

    const student = await User.findById(studentId).select("name email").lean();
    if (!student) {
        return next(new ErrorHandler("Student not found", 404));
    }

    const senderDetails = {
        name: student.name || "Student",
        email: student.email || "",
        role: "Student",
        panelName: null,
    };
    const senderLine = `Message from ${senderDetails.name} (${senderDetails.email})`;

    await notificationService.notifyAdmins(
        cleanedMessage,
        "communication",
        "/admin",
        String(priority).toLowerCase(),
        { sender: senderDetails, senderLine }
    );

    await notificationService.notifyUser(
        studentId,
        `Your message to admin was sent successfully.`,
        "communication",
        "/student/notifications",
        "low"
    );

    res.status(201).json({
        success: true,
        message: "Notification sent to admins successfully",
    });
});


export const sendNotificationToPanel = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;
    const { message, priority = "medium" } = req.body || {};

    const cleanedMessage = String(message || "").trim();
    const allowedPriorities = ["low", "medium", "high"];

    if (!cleanedMessage) {
        return next(new ErrorHandler("Message is required", 400));
    }

    if (!allowedPriorities.includes(String(priority).toLowerCase())) {
        return next(new ErrorHandler("Invalid priority value", 400));
    }

    const student = await User.findById(studentId).select("name email panel").lean();
    if (!student) {
        return next(new ErrorHandler("Student not found", 404));
    }

    if (!student.panel) {
        return next(new ErrorHandler("You are not assigned to any panel", 400));
    }

    const panel = await Panel.findById(student.panel).select("panelName teachers").lean();
    if (!panel || !Array.isArray(panel.teachers) || panel.teachers.length === 0) {
        return next(new ErrorHandler("No teachers found in your assigned panel", 404));
    }

    const senderDetails = {
        name: student.name || "Student",
        email: student.email || "",
        role: "Student",
        panelName: panel.panelName || null,
    };
    const senderLine = `Message from ${senderDetails.name} (${senderDetails.email})`;

    await Promise.all(
        panel.teachers.map((teacherId) =>
            notificationService.notifyUser(
                teacherId,
                cleanedMessage,
                "communication",
                "/teacher",
                String(priority).toLowerCase(),
                { sender: senderDetails, senderLine }
            )
        )
    );

    await notificationService.notifyUser(
        studentId,
        `Your message to ${panel.panelName} was sent successfully.`,
        "communication",
        "/student/notifications",
        "low"
    );

    res.status(201).json({
        success: true,
        message: "Notification sent to panel teachers successfully",
    });
});

const serializeStudentVideoConference = (session, studentId) => {
    const participant = (session?.participants || []).find(
        (entry) => String(entry?.student?._id || entry?.student) === String(studentId)
    );

    return {
        _id: session._id,
        callType: session.callType,
        title: session.title,
        status: session.status,
        meetingUrl: session.meetingUrl,
        roomId: session.roomId,
        startedAt: session.startedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        expiresAt: session.expiresAt,
        teacher: session.teacher || null,
        project: session.project || null,
        inviteStatus: participant?.inviteStatus || "pending",
        respondedAt: participant?.respondedAt || null,
        joinedAt: participant?.joinedAt || null,
    };
};

export const getStudentVideoConferenceOverview = asyncHandler(async (req, res) => {
    const studentId = req.user._id;
    const sessions = await videoConferenceService.getStudentSessions(studentId);
    const normalizedSessions = sessions.map((session) => serializeStudentVideoConference(session, studentId));
    const pendingRequestsCount = normalizedSessions.filter((session) => session.inviteStatus === "pending").length;

    res.status(200).json({
        success: true,
        message: "Student video conference details fetched successfully",
        data: {
            sessions: normalizedSessions,
            pendingRequestsCount,
        },
    });
});

export const respondToVideoConferenceInvite = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;
    const { sessionId } = req.params;
    const { action } = req.body || {};
    const normalizedAction = String(action || "").trim().toLowerCase();

    if (!["accept", "reject"].includes(normalizedAction)) {
        return next(new ErrorHandler("Action must be accept or reject", 400));
    }

    const inviteStatus = normalizedAction === "accept" ? "accepted" : "rejected";
    const session = await videoConferenceService.respondToSessionInvite({
        sessionId,
        studentId,
        inviteStatus,
    });

    if (!session) {
        return next(new ErrorHandler("Video conference request not found", 404));
    }

    const normalizedSession = serializeStudentVideoConference(session, studentId);
    const teacherId = session.teacher?._id || session.teacher;
    const teacherName = session.teacher?.name || "Teacher";
    const projectTitle = session.project?.title || "project discussion";
    const actionText = normalizedAction === "accept" ? "accepted" : "rejected";

    await notificationService.notifyUser(
        teacherId,
        `${req.user.name} ${actionText} your video conference request for "${projectTitle}".`,
        "meeting",
        "/teacher/video-conference",
        normalizedAction === "accept" ? "low" : "medium"
    );

    await notificationService.notifyAdmins(
        `${req.user.name} ${actionText} ${teacherName}'s video conference request for "${projectTitle}".`,
        "meeting",
        "/admin",
        normalizedAction === "accept" ? "low" : "medium"
    );

    await notificationService.notifyUser(
        studentId,
        normalizedAction === "accept"
            ? `You accepted ${teacherName}'s video conference request for "${projectTitle}".`
            : `You rejected ${teacherName}'s video conference request for "${projectTitle}".`,
        "meeting",
        "/student/notifications",
        normalizedAction === "accept" ? "low" : "medium"
    );

    res.status(200).json({
        success: true,
        message:
            normalizedAction === "accept"
                ? "Video conference request accepted successfully"
                : "Video conference request rejected successfully",
        data: {
            session: normalizedSession,
            meetingUrl: normalizedAction === "accept" ? session.meetingUrl : null,
        },
    });
});

export const joinAcceptedVideoConference = asyncHandler(async (req, res, next) => {
    const studentId = req.user._id;
    const { sessionId } = req.params;

    const session = await VideoConference.findOne({
        _id: sessionId,
        "participants.student": studentId,
    })
        .populate("teacher", "name email")
        .populate("project", "title")
        .lean();

    if (!session) {
        return next(new ErrorHandler("Video conference not found", 404));
    }

    const participant = (session.participants || []).find(
        (entry) => String(entry?.student) === String(studentId)
    );

    if (!participant || participant.inviteStatus !== "accepted") {
        return next(new ErrorHandler("Please accept the video conference request first", 400));
    }

    await videoConferenceService.markStudentJoined({ sessionId, studentId });

    res.status(200).json({
        success: true,
        message: "Video conference ready to join",
        data: {
            meetingUrl: session.meetingUrl,
        },
    });
});


