import { asyncHandler } from "../middlewares/asyncHandler.js";
import { Notification } from "../models/notification.js";
import ErrorHandler from "../middlewares/error.js";
import * as notificationService from "../Services/notificationServices.js";
import { sendSevenDayDeadlineAlerts } from "../Services/deadlineServices.js";
import { inferSenderFromNotification } from "../utils/notificationSender.js";

export const getNotifications = asyncHandler(async (req, res, next) => {
    const userId = req.user._id;

    if (String(req.user?.role || "").toLowerCase() === "student") {
        await sendSevenDayDeadlineAlerts(userId);
    }

    const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 });

    const bulkOps = [];
    const enrichedNotifications = await Promise.all(
        notifications.map(async (doc) => {
            const notificationObj = doc.toObject();
            const inferred = await inferSenderFromNotification(notificationObj);
            if (!inferred) return notificationObj;

            const merged = {
                ...notificationObj,
                sender: {
                    ...(notificationObj.sender || {}),
                    ...(inferred.sender || {}),
                },
                senderLine: inferred.senderLine || notificationObj.senderLine || null,
            };

            const hasOriginalSender = Boolean(notificationObj?.sender?.name) || Boolean(notificationObj?.sender?.role);
            if (!hasOriginalSender || !notificationObj?.senderLine) {
                bulkOps.push({
                    updateOne: {
                        filter: { _id: doc._id },
                        update: { $set: { sender: merged.sender, senderLine: merged.senderLine } },
                    },
                });
            }

            return merged;
        })
    );

    if (bulkOps.length) {
        await Notification.bulkWrite(bulkOps, { ordered: false });
    }

    const unreadOnly = enrichedNotifications.filter((n) => !n.isRead);
    const readOnly = enrichedNotifications.filter((n) => n.isRead);
    const highPriorityMessages = enrichedNotifications.filter((n) => n.priority === "high");

    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const thisWeekNotifications = enrichedNotifications.filter((n) => {
        const created = new Date(n.createdAt);
        return created >= startOfWeek && created <= endOfWeek;
    });

    res.status(200).json({
        success: true,
        message: "Notification Fetched Successfully",
        data: {
            notifications: enrichedNotifications,
            unreadOnly: unreadOnly.length,
            readOnly: readOnly.length,
            highPriorityMessages: highPriorityMessages.length,
            thisWeekNotifications: thisWeekNotifications.length,
        },
    });
});

export const markAsRead = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await notificationService.markAsRead(id, userId);

    if (!notification) {
        return next(new ErrorHandler("Notification not found", 404));
    }

    res.status(200).json({
        success: true,
        message: "notification marked as read",
        data: { notification },
    });
});

export const markAllAsRead = asyncHandler(async (req, res, next) => {
    const userId = req.user.id;

    const result = await notificationService.markAllAsRead(userId);

    res.status(200).json({
        success: true,
        message: "All notification marked as read",
        data: {
            modifiedCount: result?.modifiedCount || 0,
        },
    });
});

export const deleteNotification = asyncHandler(async (req, res, next) => {
    const { id } = req.params;
    const userId = req.user.id;

    const notification = await notificationService.deleteNotification(id, userId);

    if (!notification) {
        return next(new ErrorHandler("Notification not found", 404));
    }

    res.status(200).json({
        success: true,
        message: "notification deleted successfully",
    });
});
