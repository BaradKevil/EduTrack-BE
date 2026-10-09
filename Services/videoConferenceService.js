import { VideoConference } from "../models/videoConference.js";

const sanitizeRoomPart = (value = "") =>
    String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);

export const buildMeetingUrl = (roomId) => {
    const baseUrl = String(process.env.VIDEO_CONFERENCE_BASE_URL || "https://meet.jit.si").replace(/\/+$/, "");
    return `${baseUrl}/${roomId}`;
};

export const buildRoomId = ({ panelName, teacherName, studentName, callType }) => {
    const parts = [
        "edutrack",
        sanitizeRoomPart(panelName) || "panel",
        sanitizeRoomPart(teacherName) || "teacher",
        callType === "conference" ? "conference" : sanitizeRoomPart(studentName) || "student",
        Date.now().toString(36),
    ];

    return parts.filter(Boolean).join("-");
};

export const createSession = async ({
    teacherId,
    panelId,
    projectId = null,
    callType,
    title,
    roomId,
    studentIds = [],
}) => {
    const meetingUrl = buildMeetingUrl(roomId);

    return await VideoConference.create({
        teacher: teacherId,
        panel: panelId,
        project: projectId,
        callType,
        roomId,
        meetingUrl,
        title,
        participants: studentIds.map((studentId) => ({
            student: studentId,
            inviteStatus: "pending",
        })),
    });
};

export const getTeacherSessions = async (teacherId, limit = 10) =>
    await VideoConference.find({ teacher: teacherId })
        .populate("participants.student", "name email")
        .populate("project", "title")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

export const getStudentSessions = async (studentId) =>
    await VideoConference.find({
        "participants.student": studentId,
    })
        .populate("teacher", "name email")
        .populate("project", "title")
        .sort({ createdAt: -1 })
        .lean();

export const respondToSessionInvite = async ({ sessionId, studentId, inviteStatus }) =>
    await VideoConference.findOneAndUpdate(
        {
            _id: sessionId,
            "participants.student": studentId,
        },
        {
            $set: {
                "participants.$.inviteStatus": inviteStatus,
                "participants.$.respondedAt": new Date(),
            },
        },
        { new: true }
    )
        .populate("teacher", "name email")
        .populate("project", "title")
        .lean();

export const markStudentJoined = async ({ sessionId, studentId }) =>
    await VideoConference.findOneAndUpdate(
        {
            _id: sessionId,
            "participants.student": studentId,
        },
        {
            $set: {
                "participants.$.inviteStatus": "accepted",
                "participants.$.respondedAt": new Date(),
                "participants.$.joinedAt": new Date(),
            },
        },
        { new: true }
    ).lean();
