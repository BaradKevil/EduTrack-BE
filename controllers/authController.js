import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "../middlewares/error.js";
import User from "../models/user.js";
import { generateToken } from "../utils/generateToken.js";
import { generateForgotPasswordEmailTemplate, generatePasswordResetSuccessTemplate } from "../utils/emailTemplates.js";
import crypto from "crypto";
import { sendEmail } from "../services/emailService.js";

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Student self-signup only
export const registerUser = asyncHandler(async (req, res, next) => {
    const { name, email, department, password, confirmPassword } = req.body;

    if (!name || !email || !department || !password || !confirmPassword) {
        return next(new ErrorHandler("Please fill all fields", 400));
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedDepartment = String(department).trim().toLowerCase();
    const trimmedName = String(name).trim();

    if (!trimmedName) {
        return next(new ErrorHandler("Name is required", 400));
    }

    if (normalizedDepartment !== "computer") {
        return next(new ErrorHandler("Department must be Computer", 400));
    }

    if (String(password).length < 8) {
        return next(new ErrorHandler("Password must be at least 8 characters", 400));
    }

    if (password !== confirmPassword) {
        return next(new ErrorHandler("Passwords do not match", 400));
    }

    const escapedEmail = escapeRegex(normalizedEmail);
    const user = await User.findOne({ email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } })
        .select("name role");
    if (user) {
        return next(
            new ErrorHandler(
                `Email already registered as ${user.role}: ${user.name}`,
                400
            )
        );
    }

    await User.create({
        name: trimmedName,
        email: normalizedEmail,
        password,
        role: "Student",
        department: "Computer",
    });

    res.status(201).json({
        success: true,
        message: "Student registered successfully",
    });
});

//login user
export const login = asyncHandler(async (req, res, next) => {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
        return next(new ErrorHandler("Please fill all fields", 400));
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = String(role).trim().toLowerCase().replace(/\s+/g, "");
    const escapedEmail = normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const user = await User.findOne({ email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } }).select("+password");
    if (!user) {
        return next(new ErrorHandler("Invalid email, password or role", 401));
    }

    if (String(user.role).toLowerCase().replace(/\s+/g, "") !== normalizedRole) {
        return next(new ErrorHandler("Invalid email, password or role", 401));
    }

    const isPasswordMatched = await user.comparePassword(password);
    if (!isPasswordMatched) {
        return next(new ErrorHandler("Invalid email, password or role", 401)); 
    }
    generateToken(user, 200, "Login successful", res);
});


//logout user
export const logout = asyncHandler(async (req, res, next) => {
    res.cookie("token", "", {
        httpOnly: true,
        expires: new Date(0),
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        path: "/",
    });

    res.status(200).json({
        success: true,
        message: "Logged out successfully",
    });
});


//get user
export const getUser = asyncHandler(async (req, res, next) => {
    const user = req.user;
    res.status(200).json({
        success: true,
        user,
    });
});

//forgot password
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
        throw new ErrorHandler("Please provide email address", 400);
    }

    const user = await User.findOne({ email });
    if (!user) {
        throw new ErrorHandler("User not found with this email", 404);
    }

    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = (process.env.FRONTEND_URL || req.get("origin") || "").replace(/\/$/, "");
    const resetPasswordUrl = `${frontendUrl}/reset-password?token=${resetToken}`;
    const message = generateForgotPasswordEmailTemplate(resetPasswordUrl);

    try {
        await sendEmail({
            to: user.email,
            subject: "Password Reset Request - EduTrack",
            message,
        });
    } catch (emailError) {
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save({ validateBeforeSave: false });
        throw new ErrorHandler("Email could not be sent. Please try again later.", 500);
    }

    return res.status(200).json({
        success: true,
        message: `Password reset email sent to ${user.email} successfully`,
    });
});


export const resetPassword = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
        throw new ErrorHandler("Please provide password and confirmPassword", 400);
    }

    if (password !== confirmPassword) {
        throw new ErrorHandler("Passwords do not match", 400);
    }

    if (password.length < 8) {
        throw new ErrorHandler("Password must be at least 8 characters", 400);
    }

    const resetPasswordToken = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
        throw new ErrorHandler("Invalid or expired reset token", 400);
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    // Send a best-effort confirmation email. Password reset should remain successful
    // even if email delivery fails.
    try {
        await sendEmail({
            to: user.email,
            subject: "EduTrack - Password Reset Successful",
            message: generatePasswordResetSuccessTemplate(user.name),
        });
    } catch (emailError) {
        console.error("Password reset success email failed:", emailError.message);
    }

    return res.status(200).json({
        success: true,
        message: "Password reset successful. Please login with your new password.",
    });
});
