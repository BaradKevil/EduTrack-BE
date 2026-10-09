import express from 'express';
import { createDeadline, createDeadlineForAllAssignedStudents, triggerStudentDeadlineAlerts } from '../controllers/deadlineController.js';
import { isAuthenticated ,isAuthorized} from "../middlewares/authMiddlewares.js"; 

const router = express.Router();

router.post("/create-deadline/:id", isAuthenticated, isAuthorized("Teacher"), createDeadline);
router.post("/create-deadline-for-all", isAuthenticated, isAuthorized("Teacher"), createDeadlineForAllAssignedStudents);
router.post("/trigger-alerts", isAuthenticated, isAuthorized("Student"), triggerStudentDeadlineAlerts);


export default router;
