import express from "express";
import { 
    getStudentProject,
    getPanelDetails,
    submitProposal,
    uploadFiles,
    getFeedback,
    getDashboardStats,
    downloadFile,
    sendNotificationToAdmins,
    sendNotificationToPanel,
    getStudentVideoConferenceOverview,
    respondToVideoConferenceInvite,
    joinAcceptedVideoConference,
} from "../controllers/studentController.js";
import { isAuthenticated ,isAuthorized} from "../middlewares/authMiddlewares.js"; 
import {upload, handleUploadError} from "../middlewares/upload.js";

const router = express.Router();

//student management routes
router.get("/panel", isAuthenticated, isAuthorized("Student"), getPanelDetails);
router.post("/project", isAuthenticated, isAuthorized("Student"), getStudentProject); 
router.post("/project-proposal", isAuthenticated, isAuthorized("Student"), submitProposal); 
router.post("/panel", isAuthenticated, isAuthorized("Student"), submitProposal);
router.post("/upload/:projectId", isAuthenticated, isAuthorized("Student"),
            upload.array("files",10),
            handleUploadError,
            uploadFiles);
router.get("/feedback/:projectId", isAuthenticated, isAuthorized("Student"), getFeedback);
router.get("/fetch-dashboard-stats", isAuthenticated, isAuthorized("Student"), getDashboardStats);
router.get("/download/:projectId/:fileId", isAuthenticated, isAuthorized("Student"),downloadFile);
router.post("/notify/admin", isAuthenticated, isAuthorized("Student"), sendNotificationToAdmins);
router.post("/notify/panel", isAuthenticated, isAuthorized("Student"), sendNotificationToPanel);
router.get("/video-conference", isAuthenticated, isAuthorized("Student"), getStudentVideoConferenceOverview);
router.post("/video-conference/:sessionId/respond", isAuthenticated, isAuthorized("Student"), respondToVideoConferenceInvite);
router.get("/video-conference/:sessionId/join", isAuthenticated, isAuthorized("Student"), joinAcceptedVideoConference);

export default router; 
