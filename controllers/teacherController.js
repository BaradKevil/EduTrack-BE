import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import User from "../models/user.js";
import * as userServices from "../Services/userServices.js"; 
import * as projectService from "../Services/projectServices.js";
import * as notificationService from "../Services/notificationServices.js";
import { Project } from "../models/project.js";
import { Notification } from "../models/notification.js";
import { Panel } from "../models/panel.js";
import { Deadline } from "../models/deadline.js";
import * as fileServices  from "../Services/fileServices.js";
import * as requestServices from "../Services/requestServices.js";
import * as videoConferenceService from "../Services/videoConferenceService.js";
import { sendEmail } from "../Services/emailService.js";
import { generateRequestAcceptedTemplate, generateRequestRejectedTemplate } from "../utils/emailTemplates.js";

const buildTeacherSenderDetails = async (teacherId, panelId = null) => {
    const teacher = await User.findById(teacherId).select("name email role").lean();
    if (!teacher) {
        throw new ErrorHandler("Teacher not found", 404);
    }

    let panelName = null;
    if (panelId) {
        const panel = await Panel.findById(panelId).select("panelName").lean();
        panelName = panel?.panelName || null;
    } else {
        const panel = await Panel.findOne({ teachers: teacherId }).select("panelName").lean();
        panelName = panel?.panelName || null;
    }

    return {
        sender: {
            name: teacher.name || "Teacher",
            email: teacher.email || null,
            role: teacher.role || "Teacher",
            panelName,
        },
        senderLine: `Message from ${teacher.name || "Teacher"}${teacher.email ? ` (${teacher.email})` : ""}`,
    };
};


export const getTeacherDashboardStats = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    await projectService.cleanupOrphanProjects();
    await projectService.cleanupRejectedProjects();

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");
    const students = await User.find({
        role: "Student",
        panel: { $in: panelIds },
    }).select("_id project");

    const studentIds = students.map((student) => student._id);
    const activeProjectIds = students
        .map((student) => student.project)
        .filter(Boolean);

    const assignedStudentsCount = await User.countDocuments({
        role: "Student",
        panel: { $in: panelIds },
    });

    const totalPendingRequests = await Project.countDocuments({
        _id: { $in: activeProjectIds },
        status: "pending",
    });

    const completedProjects = await Project.countDocuments({
        _id: { $in: activeProjectIds },
        status: "completed",
    });

    const recentNotifications = await Notification.find({
        user: teacherId,
    })
    .sort({ createdAt: -1 })
    .limit(5);


    const dashboardStats = {
        assignedStudentsCount,
        totalPendingRequests,
        completedProjects,
        recentNotifications,
    };

    res.status(200).json({
        success: true,
        message: "Teacher dashboard stats fetched successfully",
        data: {dashboardStats},
    });
});


export const getRequests = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    const { panel, status } = req.query;
    await projectService.cleanupOrphanProjects();
    await projectService.cleanupRejectedProjects();

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");

    const students = await User.find({
        role: "Student",
        panel: { $in: panelIds },
    }).select("_id panel project");

    const studentIds = students.map((student) => student._id);
    const activeProjectIds = students
        .map((student) => student.project)
        .filter(Boolean);

    const filters = {
        _id: { $in: activeProjectIds },
        student: { $in: studentIds },
    };
    if (panel) {
        const isAllowedPanel = panelIds.some((id) => id.toString() === panel.toString());
        if (!isAllowedPanel) {
            return next(new ErrorHandler("Not authorized to view requests for this panel", 403));
        }
        const panelStudents = students.filter((student) => String(student.panel) === String(panel));
        const panelStudentIds = panelStudents.map((student) => student._id);
        const panelProjectIds = panelStudents
            .map((student) => student.project)
            .filter(Boolean);
        filters.student = { $in: panelStudentIds };
        filters._id = { $in: panelProjectIds };
    }
    if (status && status !== "all") filters.status = status;

    const {requests, total} = await requestServices.getAllRequests(filters);

    const updatedRequests = await Promise.all(
        requests.map(async (reqObj) => {
            const requestObj = reqObj.toObject() ? reqObj.toObject() : reqObj;
            if(requestObj?.student?._id) {
                const latestProject = await Project.findOne({
                    student: requestObj.student._id,
                })
                .sort({ createdAt: -1 })
                .lean();

                return {...requestObj, latestProject};
            }
            return requestObj;
        }));
        res.status(200).json({
            success: true,
            message: "Requests fetched successfully",
            data: {requests: updatedRequests, total},
        });
});


export const acceptRequest = asyncHandler(async (req, res, next) => {
    const {requestId} = req.params;
    const teacherId = req.user._id;

    const request = await requestServices.acceptRequest({requestId, teacherId});
    if(!request) return next(new ErrorHandler("Request not found", 404));
    const studentId = request?.student?._id || request?.student;

    if (studentId) {
        try {
            const senderPayload = await buildTeacherSenderDetails(teacherId, request?.panel?._id || request?.panel || null);
            await notificationService.notifyUser(
                studentId,
                `Your project request has been accepted by ${req.user.name}.`,
                "approval",
                "/students/status",
                "low",
                senderPayload
            );

            const projectTitle = request?.title || request?.latestProject?.title || "Untitled Project";
            await notificationService.notifyAdmins(
                `${req.user.name} approved project proposal "${projectTitle}" for ${request?.student?.name || "a student"}.`,
                "approval",
                "/admin/projects",
                "medium",
                senderPayload
            );

            const panelId = request?.panel?._id || request?.panel;
            if (panelId) {
                const panel = await Panel.findById(panelId).select("teachers panelName").lean();
                const teacherIds = (panel?.teachers || []).map((id) => String(id));

                await Promise.all(
                    teacherIds.map((id) =>
                        notificationService.notifyUser(
                            id,
                            `${req.user.name} approved project proposal "${projectTitle}" for ${request?.student?.name || "a student"} in ${panel?.panelName || "the panel"}.`,
                            "approval",
                            "/teacher/pending",
                            "medium",
                            senderPayload
                        )
                    )
                );
            }
        } catch (notifyError) {
            console.error("Accept notification failed:", notifyError.message);
        }
    }

    try {
        const student = studentId ? await User.findById(studentId) : null;
        if (student?.email) {
            const message = generateRequestAcceptedTemplate(req.user.name);
            await sendEmail({
                to: student.email,
                subject: "EduTrack - Project Request Accepted",
                message,
            });
        }
    } catch (emailError) {
        console.error("Accept email failed:", emailError.message);
    }

    res.status(200).json({
        success: true,
        message: "Request accepted successfully",
        data: {request},
    });
});


export const rejectRequest = asyncHandler(async (req, res, next) => {
    const {requestId} = req.params;
    const teacherId = req.user._id;

    const request = await requestServices.rejectRequest({requestId, teacherId});
    if(!request) return next(new ErrorHandler("Request not found", 404));
    const studentId = request?.student?._id || request?.student;

    if (studentId) {
        try {
            const senderPayload = await buildTeacherSenderDetails(teacherId, request?.panel?._id || request?.panel || null);
            await notificationService.notifyUser(
                studentId,
                `Your project request has been rejected by ${req.user.name}.`,
                "rejection",
                "/students/status",
                "high",
                senderPayload
            );

            const projectTitle = request?.title || request?.latestProject?.title || "Untitled Project";
            await notificationService.notifyAdmins(
                `${req.user.name} rejected project proposal "${projectTitle}" for ${request?.student?.name || "a student"}.`,
                "rejection",
                "/admin/projects",
                "high",
                senderPayload
            );

            const panelId = request?.panel?._id || request?.panel;
            if (panelId) {
                const panel = await Panel.findById(panelId).select("teachers panelName").lean();
                const teacherIds = (panel?.teachers || []).map((id) => String(id));

                await Promise.all(
                    teacherIds.map((id) =>
                        notificationService.notifyUser(
                            id,
                            `${req.user.name} rejected project proposal "${projectTitle}" for ${request?.student?.name || "a student"} in ${panel?.panelName || "the panel"}.`,
                            "rejection",
                            "/teacher/pending",
                            "high",
                            senderPayload
                        )
                    )
                );
            }
        } catch (notifyError) {
            console.error("Reject notification failed:", notifyError.message);
        }
    }

    try {
        const student = studentId ? await User.findById(studentId) : null;
        if (student?.email) {
            const message = generateRequestRejectedTemplate(req.user.name);
            await sendEmail({
                to: student.email,
                subject: "EduTrack - Project Request Rejected",
                message,
            });
        }
    } catch (emailError) {
        console.error("Reject email failed:", emailError.message);
    }

    res.status(200).json({ 
        success: true,
        message: "Request rejected", 
        data: {request},
    });
});


export const getAssignedStudents = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    await projectService.cleanupOrphanProjects();
    await projectService.cleanupRejectedProjects();

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");
    const students = await User.find({
        role: "Student",
        panel: { $in: panelIds },
        project: { $ne: null },
    })
        .populate({
            path: "panel",
            select: "panelName",
        })
        .populate({
            path: "project",
            populate: {
                path: "panel",
                select: "panelName",
            },
        })
        .sort({ createdAt: -1 })
        .lean();

    const projectIds = students
        .map((student) => student?.project?._id)
        .filter(Boolean);

    const deadlines = await Deadline.find({ project: { $in: projectIds } })
        .select("project updatedAt")
        .lean();

    const deadlineByProject = new Map(
        deadlines.map((deadline) => [String(deadline.project), deadline])
    );

    const enrichedStudents = students.map((student) => {
        const project = student?.project;
        if (!project?._id) return student;

        const matchedDeadline = deadlineByProject.get(String(project._id));

        return {
            ...student,
            project: {
                ...project,
                panel: project.panel || student.panel || null,
                deadlineSetAt: matchedDeadline?.updatedAt || null,
            },
        };
    });

    const total = await User.countDocuments({
        role: "Student",
        panel: { $in: panelIds },
        project: { $ne: null },
    });

    res.status(200).json({
        success: true,
        message: "Assigned students fetched successfully",
        data: { students: enrichedStudents, total },
    });
});


export const getTeacherFeedback = asyncHandler(async (req, res, next) => {
    const { projectId } = req.params;
    const teacherId = req.user._id;
    const project = await projectService.getProjectById(projectId);

    if (!project) return next(new ErrorHandler("Project not found", 404));

    let projectPanelId = project.panel;
    if (!projectPanelId) {
        const student = await User.findById(project.student?._id || project.student).select("panel").lean();
        projectPanelId = student?.panel || null;
        if (projectPanelId) {
            project.panel = projectPanelId;
            await project.save();
        }
    }
    if (!projectPanelId) return next(new ErrorHandler("Project is not assigned to any panel", 400));

    const canManageProject = await Panel.exists({
        _id: projectPanelId,
        teachers: teacherId,
    });
    if (!canManageProject) {
        return next(new ErrorHandler("Not authorized to view feedback for this project", 403));
    }

    const feedback = [...(project.feedback || [])]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
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
        message: "Feedback fetched successfully",
        data: { feedback },
    });
});


export const markComplete = asyncHandler(async (req, res, next) => {
    const {projectId} = req.params;
    const teacherId = req.user._id;
    const project = await projectService.getProjectById(projectId);

    if(!project) return next(new ErrorHandler("Project not found", 404));
    let projectPanelId = project.panel;
    if (!projectPanelId) {
        const student = await User.findById(project.student?._id || project.student).select("panel").lean();
        projectPanelId = student?.panel || null;
        if (projectPanelId) {
            project.panel = projectPanelId;
            await project.save();
        }
    }
    if (!projectPanelId) return next(new ErrorHandler("Project is not assigned to any panel", 400));

    const canManageProject = await Panel.exists({
        _id: projectPanelId,
        teachers: teacherId,
    });
    if (!canManageProject) {
        return next(new ErrorHandler("Not authorized to mark this project as complete", 403));
    }

    const updatedProject = await projectService.markComplete(projectId);
    const senderPayload = await buildTeacherSenderDetails(teacherId, projectPanelId);

    await notificationService.notifyUser(
        project.student._id,
        `Your project "${project.title}" has been marked as complete by ${req.user.name}.`,
        "general",
        "/students/status",
        "low",
        senderPayload
    );

    res.status(200).json({
        success: true,
        message: "Project marked as completed",
        data: { project: updatedProject },
    });
});


export const addFeedback = asyncHandler(async (req, res, next) => {
    const {projectId} = req.params;
    const teacherId = req.user._id;
    const { message, title, type } = req.body;

    const project = await projectService.getProjectById(projectId);
    if(!project) return next(new ErrorHandler("Project not found", 404));
    let projectPanelId = project.panel;
    if (!projectPanelId) {
        const student = await User.findById(project.student?._id || project.student).select("panel").lean();
        projectPanelId = student?.panel || null;
        if (projectPanelId) {
            project.panel = projectPanelId;
            await project.save();
        }
    }
    if (!projectPanelId) return next(new ErrorHandler("Project is not assigned to any panel", 400));

    const canManageProject = await Panel.exists({
        _id: projectPanelId,
        teachers: teacherId,
    });
    if (!canManageProject) {
        return next(new ErrorHandler("Not authorized to add feedback to this project", 403));
    }
    if(!message || !title) {
        return next(new ErrorHandler("Feedback message and title are required", 400));
    };

    const {project : updatedProject, latestFeedback} = await projectService.addFeedback(
        projectId,
        teacherId,
        message,
        title,
        type
    );
    const senderPayload = await buildTeacherSenderDetails(teacherId, projectPanelId);

    await notificationService.notifyUser(
        project.student._id,
        `You have received new feedback on your project "${project.title}" from ${req.user.name}.`,
        "feedback",
        `/student/feedback`,
        type === "positive" ? "low" : type === "negative" ? "high" : "medium",
        senderPayload
    );

    res.status(200).json({
        success: true,
        message: "Feedback posted successfully",
        data: { project: updatedProject, feedback: latestFeedback },
    });
});


export const getFiles = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    await projectService.cleanupOrphanProjects();
    await projectService.cleanupRejectedProjects();

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");
    const students = await User.find({
        role: "Student",
        panel: { $in: panelIds },
        project: { $ne: null },
    })
        .select("_id name email panel project")
        .lean();

    const activeProjectIds = students
        .map((student) => student.project)
        .filter(Boolean);

    const projects = await Project.find({ _id: { $in: activeProjectIds } })
        .populate("student", "name email panel")
        .sort({ createdAt: -1 })
        .lean();

    const allFiles = projects.flatMap((project) =>
        (project.files || []).map((file) => ({
            ...(typeof file?.toObject === "function" ? file.toObject() : file),
            projectId: project._id,
            projectTitle: project.title,
            projectStatus: project.status,
            projectUpdatedAt: project.updatedAt,
            projectPanel: project.panel || project.student?.panel || null,
            studentName: project.student?.name || "Unknown Student",
            studentEmail: project.student?.email || "Unknown Email",
        }))
    );

    res.status(200).json({
        success: true,
        message: "Files fetched successfully",
        data: { files: allFiles },
    });
});


export const downloadFile = asyncHandler(async(req,res,next) => {
    const {projectId, fileId} = req.params;
    const teacherId = req.user._id;

    const project = await projectService.getProjectById(projectId);
    if(!project) return next(new ErrorHandler("Project not found", 404));
    if (!project.panel) {
        const student = await User.findById(project.student?._id || project.student).select("panel").lean();
        if (student?.panel) {
            project.panel = student.panel;
            await project.save();
        }
    }
    if (!project.panel) {
        return next(new ErrorHandler("Project is not assigned to any panel", 400));
    }

    const projectPanelId = project.panel?._id || project.panel;
    const canAccessProject = await Panel.exists({
        _id: projectPanelId,
        teachers: teacherId,
    });
    if(!canAccessProject){
        return next(new ErrorHandler("Not authorized to download files for this project", 403)); 
    }

    const file = project.files.id(fileId);
    if(!file) return next(new ErrorHandler("File not found", 404));

    fileServices.streamDownload(file.fileUrl, res, file.originalName);
});


export const getNotificationRecipients = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");
    if (!panelIds.length) {
        return res.status(200).json({
            success: true,
            message: "No assigned students found",
            data: { students: [] },
        });
    }

    const students = await User.find({
        role: "Student",
        panel: { $in: panelIds },
    })
        .select("_id name email panel")
        .sort({ name: 1 })
        .lean();

    res.status(200).json({
        success: true,
        message: "Notification recipients fetched successfully",
        data: { students },
    });
});


export const sendNotificationToAdmins = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    const { message, priority = "medium" } = req.body || {};

    const cleanedMessage = String(message || "").trim();
    const allowedPriorities = ["low", "medium", "high"];

    if (!cleanedMessage) {
        return next(new ErrorHandler("Message is required", 400));
    }

    if (!allowedPriorities.includes(String(priority).toLowerCase())) {
        return next(new ErrorHandler("Invalid priority value", 400));
    }

    const teacher = await User.findById(teacherId).select("name email").lean();
    if (!teacher) {
        return next(new ErrorHandler("Teacher not found", 404));
    }

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");
    const primaryPanel = panelIds.length
        ? await Panel.findById(panelIds[0]).select("panelName").lean()
        : null;

    const senderDetails = {
        name: teacher.name || "Teacher",
        email: teacher.email || "",
        role: "Teacher",
        panelName: primaryPanel?.panelName || null,
    };
    const senderLine = `Message from ${senderDetails.name} (${senderDetails.email})`;

    const created = await notificationService.notifyAdmins(
        cleanedMessage,
        "communication",
        "/admin",
        String(priority).toLowerCase(),
        { sender: senderDetails, senderLine }
    );

    await notificationService.notifyUser(
        teacherId,
        "Your message to admins was sent successfully.",
        "communication",
        "/teacher/notifications",
        "low"
    );

    res.status(201).json({
        success: true,
        message: "Notification sent to admins successfully",
        data: { receivers: Array.isArray(created) ? created.length : 0 },
    });
});


export const sendNotificationToAssignedStudent = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    const { studentId } = req.params;
    const { message, priority = "medium" } = req.body || {};

    const cleanedMessage = String(message || "").trim();
    const allowedPriorities = ["low", "medium", "high"];

    if (!cleanedMessage) {
        return next(new ErrorHandler("Message is required", 400));
    }

    if (!allowedPriorities.includes(String(priority).toLowerCase())) {
        return next(new ErrorHandler("Invalid priority value", 400));
    }

    const teacher = await User.findById(teacherId).select("name email").lean();
    if (!teacher) {
        return next(new ErrorHandler("Teacher not found", 404));
    }

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");
    if (!panelIds.length) {
        return next(new ErrorHandler("You are not assigned to any panel", 400));
    }
    const primaryPanel = await Panel.findById(panelIds[0]).select("panelName").lean();

    const student = await User.findOne({
        _id: studentId,
        role: "Student",
        panel: { $in: panelIds },
    })
        .select("_id name email")
        .lean();

    if (!student) {
        return next(new ErrorHandler("Student not found in your assigned panel", 404));
    }

    const senderDetails = {
        name: teacher.name || "Teacher",
        email: teacher.email || "",
        role: "Teacher",
        panelName: primaryPanel?.panelName || null,
    };
    const senderLine = `Message from ${senderDetails.name} (${senderDetails.email})`;

    await notificationService.notifyUser(
        student._id,
        cleanedMessage,
        "communication",
        "/student/notifications",
        String(priority).toLowerCase(),
        { sender: senderDetails, senderLine }
    );

    await notificationService.notifyUser(
        teacherId,
        `Your message to ${student.name} was sent successfully.`,
        "communication",
        "/teacher/notifications",
        "low"
    );

    res.status(201).json({
        success: true,
        message: "Notification sent to student successfully",
        data: { receiver: student._id },
    });
});


export const sendNotificationToAllAssignedStudents = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    const { message, priority = "medium" } = req.body || {};

    const cleanedMessage = String(message || "").trim();
    const allowedPriorities = ["low", "medium", "high"];

    if (!cleanedMessage) {
        return next(new ErrorHandler("Message is required", 400));
    }

    if (!allowedPriorities.includes(String(priority).toLowerCase())) {
        return next(new ErrorHandler("Invalid priority value", 400));
    }

    const teacher = await User.findById(teacherId).select("name email").lean();
    if (!teacher) {
        return next(new ErrorHandler("Teacher not found", 404));
    }

    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");
    if (!panelIds.length) {
        return next(new ErrorHandler("You are not assigned to any panel", 400));
    }
    const primaryPanel = await Panel.findById(panelIds[0]).select("panelName").lean();

    const students = await User.find({
        role: "Student",
        panel: { $in: panelIds },
    })
        .select("_id")
        .lean();

    if (!students.length) {
        return next(new ErrorHandler("No assigned students found", 404));
    }

    const senderDetails = {
        name: teacher.name || "Teacher",
        email: teacher.email || "",
        role: "Teacher",
        panelName: primaryPanel?.panelName || null,
    };
    const senderLine = `Message from ${senderDetails.name} (${senderDetails.email})`;

    await Promise.all(
        students.map((student) =>
            notificationService.notifyUser(
                student._id,
                cleanedMessage,
                "communication",
                "/student/notifications",
                String(priority).toLowerCase(),
                { sender: senderDetails, senderLine }
            )
        )
    );

    await notificationService.notifyUser(
        teacherId,
        `Your message was sent to ${students.length} assigned student${students.length > 1 ? "s" : ""}.`,
        "communication",
        "/teacher/notifications",
        "low"
    );

    res.status(201).json({
        success: true,
        message: "Notification sent to all assigned students successfully",
        data: { receivers: students.length },
    });
});

const getTeacherConferenceStudents = async (teacherId) => {
    const panelIds = await Panel.find({ teachers: teacherId }).distinct("_id");

    if (!panelIds.length) {
        return { panelIds: [], students: [] };
    }

    const students = await User.find({
        role: "Student",
        panel: { $in: panelIds },
        project: { $ne: null },
    })
        .populate({
            path: "panel",
            select: "panelName",
        })
        .populate({
            path: "project",
            select: "title status panel updatedAt",
            populate: {
                path: "panel",
                select: "panelName",
            },
        })
        .sort({ name: 1 })
        .lean();

    return { panelIds, students };
};

const buildTeacherCallSender = async (teacherId) => {
    const teacher = await User.findById(teacherId).select("name email").lean();
    if (!teacher) {
        throw new ErrorHandler("Teacher not found", 404);
    }

    const panel = await Panel.findOne({ teachers: teacherId }).select("_id panelName").lean();
    if (!panel) {
        throw new ErrorHandler("You are not assigned to any panel", 400);
    }

    return {
        teacher,
        panel,
        senderDetails: {
            name: teacher.name || "Teacher",
            email: teacher.email || "",
            role: "Teacher",
            panelName: panel.panelName || null,
        },
    };
};

export const getVideoConferenceOverview = asyncHandler(async (req, res) => {
    const teacherId = req.user._id;
    const { students } = await getTeacherConferenceStudents(teacherId);
    const sessions = await videoConferenceService.getTeacherSessions(teacherId, 8);

    res.status(200).json({
        success: true,
        message: "Video conference overview fetched successfully",
        data: {
            students,
            sessions,
        },
    });
});

export const startVideoConferenceWithStudent = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    const { studentId } = req.params;
    const { teacher, panel, senderDetails } = await buildTeacherCallSender(teacherId);

    const student = await User.findOne({
        _id: studentId,
        role: "Student",
        panel: panel._id,
        project: { $ne: null },
    })
        .populate("project", "title")
        .lean();

    if (!student) {
        return next(new ErrorHandler("Student not found in your panel", 404));
    }

    const roomId = videoConferenceService.buildRoomId({
        panelName: panel.panelName,
        teacherName: teacher.name,
        studentName: student.name,
        callType: "individual",
    });

    const session = await videoConferenceService.createSession({
        teacherId,
        panelId: panel._id,
        projectId: student.project?._id || null,
        callType: "individual",
        title: `${student.project?.title || "Project discussion"} - ${student.name}`,
        roomId,
        studentIds: [student._id],
    });

    const inviteMessage = `${panel.panelName} (${teacher.name}) wants to video call in individual conference for "${student.project?.title || "your project"}".`;
    const metadata = {
        metadata: {
            videoCall: {
                sessionId: session._id,
                roomId: session.roomId,
                meetingUrl: session.meetingUrl,
                callType: session.callType,
                projectTitle: student.project?.title || null,
                panelName: panel.panelName,
                teacherName: teacher.name,
            },
        },
        sender: senderDetails,
        senderLine: `Video call invitation from ${teacher.name} (${teacher.email})`,
    };

    await notificationService.notifyUser(
        student._id,
        inviteMessage,
        "meeting",
        "/student/notifications",
        "high",
        metadata
    );

    await notificationService.notifyUser(
        teacherId,
        `Video call invitation sent to ${student.name}.`,
        "meeting",
        "/teacher/video-conference",
        "low",
        {
            metadata: {
                videoCall: {
                    sessionId: session._id,
                    roomId: session.roomId,
                    meetingUrl: session.meetingUrl,
                    callType: session.callType,
                    projectTitle: student.project?.title || null,
                    panelName: panel.panelName,
                    teacherName: teacher.name,
                },
            },
        }
    );

    res.status(201).json({
        success: true,
        message: "Individual video call invitation sent successfully",
        data: { session },
    });
});

export const startVideoConferenceForAllStudents = asyncHandler(async (req, res, next) => {
    const teacherId = req.user._id;
    const { teacher, panel, senderDetails } = await buildTeacherCallSender(teacherId);
    const { students } = await getTeacherConferenceStudents(teacherId);

    if (!students.length) {
        return next(new ErrorHandler("No assigned students with projects found", 404));
    }

    const roomId = videoConferenceService.buildRoomId({
        panelName: panel.panelName,
        teacherName: teacher.name,
        callType: "conference",
    });

    const session = await videoConferenceService.createSession({
        teacherId,
        panelId: panel._id,
        callType: "conference",
        title: `${panel.panelName} conference call`,
        roomId,
        studentIds: students.map((student) => student._id),
    });

    await Promise.all(
        students.map((student) =>
            notificationService.notifyUser(
                student._id,
                `${panel.panelName} (${teacher.name}) wants to video call in conference call.`,
                "meeting",
                "/student/notifications",
                "high",
                {
                    metadata: {
                        videoCall: {
                            sessionId: session._id,
                            roomId: session.roomId,
                            meetingUrl: session.meetingUrl,
                            callType: session.callType,
                            panelName: panel.panelName,
                            teacherName: teacher.name,
                        },
                    },
                    sender: senderDetails,
                    senderLine: `Conference call invitation from ${teacher.name} (${teacher.email})`,
                }
            )
        )
    );

    await notificationService.notifyUser(
        teacherId,
        `Conference call invitation sent to ${students.length} student${students.length > 1 ? "s" : ""}.`,
        "meeting",
        "/teacher/video-conference",
        "low",
        {
            metadata: {
                videoCall: {
                    sessionId: session._id,
                    roomId: session.roomId,
                    meetingUrl: session.meetingUrl,
                    callType: session.callType,
                    panelName: panel.panelName,
                    teacherName: teacher.name,
                },
            },
        }
    );

    res.status(201).json({
        success: true,
        message: "Conference call invitation sent successfully",
        data: { session, receivers: students.length },
    });
});
