import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import { Deadline } from "../models/deadline.js";
import { Project } from "../models/project.js";
import { getProjectById } from "../Services/projectServices.js";
import { Panel } from "../models/panel.js";
import User from "../models/user.js";
import * as notificationService from "../Services/notificationServices.js";
import { sendSevenDayDeadlineAlerts } from "../Services/deadlineServices.js";


const formatDueLabel = (date) =>
    new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
    }).format(date);

const ensureTeacherCanManageProject = async (project, teacherId) => {
    const panelId = project.panel?._id || project.panel || project.student?.panel || null;
    if (!panelId) {
        throw new ErrorHandler("Project is not assigned to any panel", 400);
    }

    const canManage = await Panel.exists({
        _id: panelId,
        teachers: teacherId,
    });

    if (!canManage) {
        throw new ErrorHandler("You can set deadlines only for students assigned to your panel", 403);
    }

    return panelId;
};

const saveProjectDeadline = async ({ project, req, name, dueDateObj, description }) => {
    const panelId = await ensureTeacherCanManageProject(project, req.user._id);
    const studentId = project.student?._id || project.student;
    const student = studentId
        ? await User.findById(studentId).select("name email").lean()
        : null;

    const deadlineName = name || project.title || student?.name || "Project Deadline";
    const existingDeadline = await Deadline.findOne({ project: project._id }).lean();

    const deadline = await Deadline.findOneAndUpdate(
        { project: project._id },
        {
            name: deadlineName,
            dueDate: dueDateObj,
            description: description || "",
            createdBy: req.user._id,
            project: project._id,
            sevenDayAlertSentAt: null,
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await deadline.populate([{ path: "createdBy", select: "name email" }]);

    await Project.findByIdAndUpdate(
        project._id,
        { deadline: dueDateObj },
        { new: true, runValidators: true }
    );

    const dueLabel = formatDueLabel(dueDateObj);
    const projectTitle = project.title || "Untitled Project";
    const sender = {
        name: req.user?.name || "Teacher",
        email: req.user?.email || null,
        role: req.user?.role || "Teacher",
        panelName: null,
    };
    const senderLine = `Message from ${sender.name}${sender.email ? ` (${sender.email})` : ""}`;
    const isUpdate = Boolean(existingDeadline);

    await notificationService.notifyAdmins(
        `${req.user.name} ${isUpdate ? "updated" : "set"} deadline ${dueLabel} for project "${projectTitle}" (${student?.name || "Student"}).`,
        "deadline",
        "/admin/deadlines",
        "medium",
        { sender, senderLine }
    );

    if (studentId) {
        await notificationService.notifyUser(
            studentId,
            `Deadline ${isUpdate ? "updated" : "set"}: ${dueLabel} for your project "${projectTitle}".`,
            "deadline",
            "/student",
            "high",
            { sender, senderLine }
        );
    }

    const panel = await Panel.findById(panelId).select("teachers panelName").lean();
    const teacherIds = (panel?.teachers || []).map((teacherId) => String(teacherId));

    await Promise.all(
        teacherIds.map((teacherId) =>
            notificationService.notifyUser(
                teacherId,
                `${req.user.name} ${isUpdate ? "updated" : "set"} deadline ${dueLabel} for "${projectTitle}" (${student?.name || "Student"}).`,
                "deadline",
                "/teacher/deadlines",
                "medium",
                {
                    sender: {
                        ...sender,
                        panelName: panel?.panelName || null,
                    },
                    senderLine,
                }
            )
        )
    );

    return { deadline, isUpdate };
};

export const createDeadline = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const { name, dueDate, description } = req.body;

    if (!dueDate) {
        return next(new ErrorHandler("Due date is required", 400));
    }
    
    const project = await getProjectById(id);
    if (!project) {
        return next(new ErrorHandler("Project not found", 404));
    }

    const dueDateObj = new Date(dueDate);
    if (Number.isNaN(dueDateObj.getTime())) {
        return next(new ErrorHandler("Invalid due date", 400));
    }

    const { deadline } = await saveProjectDeadline({
        project,
        req,
        name,
        dueDateObj,
        description,
    });

    return res.status(201).json({
        success: true,
        message: "Deadline saved successfully",
        data: { deadline },
    });

});

export const createDeadlineForAllAssignedStudents = asyncHandler(async (req, res, next) => {
    const { dueDate, description } = req.body || {};

    if (!dueDate) {
        return next(new ErrorHandler("Due date is required", 400));
    }

    const dueDateObj = new Date(dueDate);
    if (Number.isNaN(dueDateObj.getTime())) {
        return next(new ErrorHandler("Invalid due date", 400));
    }

    const panelIds = await Panel.find({ teachers: req.user._id }).distinct("_id");
    if (!panelIds.length) {
        return next(new ErrorHandler("You are not assigned to any panel", 400));
    }

    const assignedStudents = await User.find({
        role: "Student",
        panel: { $in: panelIds },
        project: { $ne: null },
    })
        .select("name email panel project")
        .populate({
            path: "project",
            populate: {
                path: "panel",
                select: "panelName",
            },
        })
        .lean();

    const projects = assignedStudents
        .filter((student) => student?.project?._id)
        .filter((student) => String(student.project?.status || "").toLowerCase() === "approved")
        .map((student) => ({
            ...student.project,
            student: {
                _id: student._id,
                name: student.name,
                email: student.email,
                panel: student.panel,
            },
            panel: student.project?.panel || student.panel,
        }));

    if (!projects.length) {
        return next(new ErrorHandler("No approved assigned students found", 404));
    }

    const results = await Promise.all(
        projects.map((project) =>
            saveProjectDeadline({
                project,
                req,
                name: project.student?.name || project.title || "Project Deadline",
                dueDateObj,
                description,
            })
        )
    );

    return res.status(201).json({
        success: true,
        message: `Deadline saved for ${results.length} assigned student${results.length > 1 ? "s" : ""}`,
        data: {
            count: results.length,
            deadlines: results.map((result) => result.deadline),
        },
    });
});

export const getDeadlineProjects = asyncHandler(async (req, res, next) => {
    const projects = await Project.find({ student: { $ne: null } })
        .populate("student", "name email panel")
        .populate("panel", "panelName")
        .sort({ updatedAt: -1 })
        .lean();

    res.status(200).json({
        success: true,
        message: "Deadline projects fetched successfully",
        data: { projects },
    });
});

export const triggerStudentDeadlineAlerts = asyncHandler(async (req, res, next) => {
    await sendSevenDayDeadlineAlerts(req.user?._id);

    res.status(200).json({
        success: true,
        message: "Deadline alerts checked",
    });
});
