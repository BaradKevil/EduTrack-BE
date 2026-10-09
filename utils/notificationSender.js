import User from "../models/user.js";
import { Panel } from "../models/panel.js";

const normalizeName = (value = "") => String(value || "").trim().replace(/[.,!?;:]+$/, "");

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const resolvePanelNameForUser = async (userDoc) => {
    if (!userDoc?.panel) return null;
    const panel = await Panel.findById(userDoc.panel).select("panelName").lean();
    return panel?.panelName || null;
};

const findUserBySender = async ({ name, email, role }) => {
    const normalizedRole = String(role || "").trim();
    if (!normalizedRole || !name) return null;

    const query = { role: normalizedRole };

    if (email) {
        query.email = String(email).trim().toLowerCase();
    } else {
        query.name = { $regex: new RegExp(`^${escapeRegExp(name)}$`, "i") };
    }

    return await User.findOne(query).select("name email panel").lean();
};

export const inferSenderFromNotification = async (notification) => {
    const message = String(notification?.message || "").trim();
    const sender = notification?.sender || {};
    const hasSender = Boolean(sender?.name) && Boolean(sender?.role);

    if (hasSender) {
        let resolvedPanelName = sender.panelName || null;

        if (!resolvedPanelName && ["Teacher", "Student"].includes(String(sender.role || "").trim())) {
            const matchedUser = await findUserBySender({
                name: sender.name,
                email: sender.email,
                role: sender.role,
            });
            resolvedPanelName = await resolvePanelNameForUser(matchedUser);
        }

        return {
            sender: {
                name: sender.name,
                email: sender.email || null,
                role: sender.role,
                panelName: resolvedPanelName || null,
            },
            senderLine:
                notification?.senderLine ||
                `Message from ${sender.name}${sender.email ? ` (${sender.email})` : ""}`,
        };
    }

    let inferredName = "";
    let inferredRole = "";
    let inferredEmail = "";
    let inferredPanelName = null;

    const fromPattern = message.match(/message from\s+(.+?)\s*\(([^)]+)\)/i);
    if (fromPattern) {
        inferredName = normalizeName(fromPattern[1]);
        inferredEmail = String(fromPattern[2] || "").trim();
    }

    const byPattern = message.match(/\bby\s+([a-zA-Z][\w .-]{1,80})/i);
    if (!inferredName && byPattern) {
        inferredName = normalizeName(byPattern[1]);
    }

    const trailingFromPattern = message.match(/\bfrom\s+([a-zA-Z][\w .-]{1,80})\.?$/i);
    if (!inferredName && trailingFromPattern) {
        inferredName = normalizeName(trailingFromPattern[1]);
    }

    const startsWithActorPattern = message.match(/^([a-zA-Z][\w .-]{1,80})\s+(submitted|uploaded|created|deleted)\b/i);
    if (!inferredName && startsWithActorPattern) {
        inferredName = normalizeName(startsWithActorPattern[1]);
    }

    if (/admin/i.test(message)) {
        inferredRole = "Admin";
        if (!inferredName) inferredName = "Admin";
    }

    if (!inferredRole && inferredName) {
        const exactNameRegex = new RegExp(`^${escapeRegExp(inferredName)}$`, "i");

        const teacher = await User.findOne({
            role: "Teacher",
            name: { $regex: exactNameRegex },
        }).select("name email panel").lean();

        if (teacher) {
            inferredRole = "Teacher";
            inferredName = teacher.name || inferredName;
            inferredEmail = teacher.email || inferredEmail;
            inferredPanelName = await resolvePanelNameForUser(teacher);
        } else {
            const admin = await User.findOne({
                role: "Admin",
                name: { $regex: exactNameRegex },
            }).select("name email").lean();

            if (admin) {
                inferredRole = "Admin";
                inferredName = admin.name || inferredName;
                inferredEmail = admin.email || inferredEmail;
            } else {
                const student = await User.findOne({
                    role: "Student",
                    name: { $regex: exactNameRegex },
                }).select("name email panel").lean();

                if (student) {
                    inferredRole = "Student";
                    inferredName = student.name || inferredName;
                    inferredEmail = student.email || inferredEmail;
                    inferredPanelName = await resolvePanelNameForUser(student);
                }
            }
        }
    }

    if (!inferredRole && ["approval", "rejection", "feedback"].includes(String(notification?.type || "").toLowerCase()) && inferredName) {
        inferredRole = "Teacher";
    }

    if (!inferredName) {
        return null;
    }

    const senderLine =
        notification?.senderLine ||
        `Message from ${inferredName}${inferredEmail ? ` (${inferredEmail})` : ""}`;

    return {
        sender: {
            name: inferredName,
            email: inferredEmail || null,
            role: inferredRole || null,
            panelName: inferredPanelName || null,
        },
        senderLine,
    };
};
