import { Deadline } from "../models/deadline.js";
import { Project } from "../models/project.js";
import * as notificationService from "./notificationServices.js";

const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
};

const endOfDay = (date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
};

const toObjectIdString = (value) => (value ? String(value) : "");

export const sendSevenDayDeadlineAlerts = async (studentId = null) => {
    const now = new Date();
    const today = startOfDay(now);
    const sevenDaysLater = endOfDay(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

    const deadlines = await Deadline.find({
        dueDate: { $gte: today, $lte: sevenDaysLater },
        $or: [{ sevenDayAlertSentAt: { $exists: false } }, { sevenDayAlertSentAt: null }],
        project: { $ne: null },
    })
        .populate({
            path: "project",
            select: "title student",
            populate: { path: "student", select: "name email" },
        })
        .lean();

    const targetStudentId = toObjectIdString(studentId);
    const updates = [];

    for (const deadline of deadlines) {
        const project = deadline?.project;
        const projectStudent = project?.student;
        const recipientId = projectStudent?._id || projectStudent;

        if (!recipientId) continue;

        if (targetStudentId && toObjectIdString(recipientId) !== targetStudentId) {
            continue;
        }

        const dueLabel = new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit",
        }).format(new Date(deadline.dueDate));

        await notificationService.notifyUser(
            recipientId,
            `Reminder: your project "${project?.title || "Untitled Project"}" deadline is near (${dueLabel}).`,
            "deadline",
            "/student",
            "high"
        );

        updates.push(deadline._id);
    }

    if (updates.length) {
        await Deadline.updateMany(
            { _id: { $in: updates } },
            { $set: { sevenDayAlertSentAt: new Date() } }
        );
    }

    return updates.length;
};

export const syncProjectDeadlineField = async (projectId, dueDate) => {
    return await Project.findByIdAndUpdate(
        projectId,
        { deadline: dueDate },
        { new: true, runValidators: true }
    );
};
