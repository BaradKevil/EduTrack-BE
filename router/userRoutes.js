import express from "express";
import { 
    registerUser,
    login,
    logout,
    getUser,
    forgotPassword,
    resetPassword  
} from "../controllers/authController.js";
import multer from "multer";
import { isAuthenticated } from "../middlewares/authMiddlewares.js"; 

const router = express.Router();

// Public routes (no authentication required)
router.post("/signup", registerUser);
router.post("/register", registerUser);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.put("/password/reset/:token", resetPassword);

// Protected routes (authentication required)
router.get("/me", isAuthenticated, getUser);
router.get("/logout", isAuthenticated, logout);

export default router;
