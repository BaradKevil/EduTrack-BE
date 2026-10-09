import express from 'express';
import {
    getTeacherDashboardStats,
    getRequests,
    acceptRequest,
    rejectRequest,
    getTeacherFeedback,
    addFeedback,
    markComplete,
    getAssignedStudents,
    getFiles,
    downloadFile,
    getNotificationRecipients,
    sendNotificationToAdmins,
    sendNotificationToAssignedStudent,
    sendNotificationToAllAssignedStudents,
    getVideoConferenceOverview,
    startVideoConferenceWithStudent,
    startVideoConferenceForAllStudents,
} from "../controllers/teacherController.js";
import { isAuthenticated, isAuthorized } from "../middlewares/authMiddlewares.js";

const router = express.Router();

router.get("/fetch-dashboard-stats", isAuthenticated, isAuthorized("Teacher"), getTeacherDashboardStats);
router.get("/requests", isAuthenticated, isAuthorized("Teacher"), getRequests);
router.put("/requests/:requestId/accept", isAuthenticated, isAuthorized("Teacher"), acceptRequest);
router.put("/requests/:requestId/reject", isAuthenticated, isAuthorized("Teacher"), rejectRequest);

router.get("/feedback/:projectId", isAuthenticated, isAuthorized("Teacher"), getTeacherFeedback);
router.post("/feedback/:projectId", isAuthenticated, isAuthorized("Teacher"), addFeedback);
router.post("/mark-complete/:projectId", isAuthenticated, isAuthorized("Teacher"),markComplete);

router.get("/download/:projectId/:fileId", isAuthenticated, isAuthorized("Teacher"), downloadFile);
router.get("/files", isAuthenticated, isAuthorized("Teacher"), getFiles);

router.get("/assigned-students", isAuthenticated, isAuthorized("Teacher"), getAssignedStudents);
router.get("/notification-recipients", isAuthenticated, isAuthorized("Teacher"), getNotificationRecipients);
router.post("/notify/admin", isAuthenticated, isAuthorized("Teacher"), sendNotificationToAdmins);
router.post("/notify/student/:studentId", isAuthenticated, isAuthorized("Teacher"), sendNotificationToAssignedStudent);
router.post("/notify/students/all", isAuthenticated, isAuthorized("Teacher"), sendNotificationToAllAssignedStudents);
router.get("/video-conference", isAuthenticated, isAuthorized("Teacher"), getVideoConferenceOverview);
router.post("/video-conference/student/:studentId", isAuthenticated, isAuthorized("Teacher"), startVideoConferenceWithStudent);
router.post("/video-conference/students/all", isAuthenticated, isAuthorized("Teacher"), startVideoConferenceForAllStudents);

export default router;
