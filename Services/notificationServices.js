import { Notification } from "../models/notification.js";
import User from "../models/user.js";

export const createNotification = async (notificationData) => {
    const notification = new Notification(notificationData);
    return await notification.save();
};


export const notifyUser = async(
    userId,
    message,
    type="general",
    link=null,
    priority="low",
    metadata = {}
) => {
    const sender = metadata?.sender || null;
    const senderLine = metadata?.senderLine || null;

    return await createNotification({
        user: userId,
        message,
        type,
        priority,
        link,
        sender,
        senderLine,
        metadata: metadata?.metadata || null,
    });
};


export const notifyAdmins = async (
    message,
    type = "general",
    link = null,
    priority = "low",
    metadata = {}
) => {
    const admins = await User.find({ role: "Admin" }).select("_id").lean();
    if (!admins.length) return [];

    const sender = metadata?.sender || null;
    const senderLine = metadata?.senderLine || null;

    const payload = admins.map((admin) => ({
        user: admin._id,
        message,
        type,
        priority,
        link,
        sender,
        senderLine,
        metadata: metadata?.metadata || null,
    }));

    return await Notification.insertMany(payload);
};


export const markAsRead = async (notificationId, userId) => {
    return await Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { isRead: true },
        { new: true }
    );
};


export const markAllAsRead = async (userId) => {
    return await Notification.updateMany(
        { user : userId, isRead: false },
        { $set: { isRead: true } }
    );
};


export const deleteNotification = async (notificationId, userId) => {
    return await Notification.findOneAndDelete(
        { _id: notificationId, user: userId }
    );
};
