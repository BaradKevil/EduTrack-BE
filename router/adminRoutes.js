import express from "express";
import { 
    createStudent,
    bulkCreateStudents,
    updateStudent,
    deleteStudent,
    createTeacher,
    bulkCreateTeachers,
    updateTeacher,
    deleteTeacher,
    getAllUsers,
    createPanel,
    getAllPanels,
    deletePanel,
    getAllTeachers,
    getAllTeachersCount,
    getDashboardStats,
    getAllProjects,
    sendFeedbackToPanel,
    sendFeedbackToStudent,
} from "../controllers/adminController.js";
import { isAuthenticated ,isAuthorized} from "../middlewares/authMiddlewares.js"; 
import { getUnassignedStudents, getPanelStudents, assignStudentsToPanel, removeStudentFromPanel } from "../controllers/adminController.js";
import { upload, handleUploadError } from "../middlewares/upload.js";


const router = express.Router();

router.get("/dashboard-stats", isAuthenticated, isAuthorized("Admin"), getDashboardStats);

//student management routes
router.post("/create-student", isAuthenticated, isAuthorized("Admin"), createStudent); 
router.post(
    "/bulk-create-students",
    isAuthenticated,
    isAuthorized("Admin"),
    upload.single("file"),
    handleUploadError,
    bulkCreateStudents
);
router.put("/update-student/:id", isAuthenticated, isAuthorized("Admin"), updateStudent); 
router.delete("/delete-student/:id", isAuthenticated, isAuthorized("Admin"), deleteStudent);

//teacher management routes
router.post("/create-teacher", isAuthenticated, isAuthorized("Admin"), createTeacher); 
router.post(
    "/bulk-create-teachers",
    isAuthenticated,
    isAuthorized("Admin"),
    upload.single("file"),
    handleUploadError,
    bulkCreateTeachers
);
router.put("/update-teacher/:id", isAuthenticated, isAuthorized("Admin"), updateTeacher); 
router.delete("/delete-teacher/:id", isAuthenticated, isAuthorized("Admin"), deleteTeacher);

// Panel management routes
router.post("/create-panel", isAuthenticated, isAuthorized("Admin"), createPanel);
router.get("/panels", isAuthenticated, isAuthorized("Admin"), getAllPanels);
router.delete("/delete-panel/:id", isAuthenticated, isAuthorized("Admin"), deletePanel);
router.get("/teachers", isAuthenticated, isAuthorized("Admin"), getAllTeachers);
router.get("/teachers/all", isAuthenticated, isAuthorized("Admin"), getAllTeachersCount);

router.get("/students/unassigned", isAuthenticated, isAuthorized("Admin"), getUnassignedStudents);
router.get("/panels/:panelId/students", isAuthenticated, isAuthorized("Admin"), getPanelStudents);
router.post("/assign-students", isAuthenticated, isAuthorized("Admin"), assignStudentsToPanel);
router.delete("/panels/:panelId/students/:studentId", isAuthenticated, isAuthorized("Admin"), removeStudentFromPanel);

//Project Management Routes
router.get("/projects", isAuthenticated, isAuthorized("Admin"), getAllProjects); 

router.post("/feedback/panel/:panelId", isAuthenticated, isAuthorized("Admin"), sendFeedbackToPanel);
router.post("/feedback/student/:studentId", isAuthenticated, isAuthorized("Admin"), sendFeedbackToStudent);

router.get("/users", isAuthenticated, isAuthorized("Admin"), getAllUsers);

export default router;  
