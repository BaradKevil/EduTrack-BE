import Jwt from "jsonwebtoken";
import { asyncHandler } from "../middlewares/asyncHandler.js";
import ErrorHandler from "./error.js";
import User from "../models/user.js"

export const isAuthenticated = asyncHandler(async (req, res, next) => {
    const bearer = req.headers.authorization;
    const bearerToken =
        bearer && bearer.startsWith("Bearer ")
            ? bearer.split(" ")[1]
            : null;
    const token = req.cookies.token || bearerToken;

    if (!token) {
        return next(new ErrorHandler("Please login to access", 401));
    }

    const decoded = Jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id)
        .select("-resetPasswordToken -resetPasswordExpire");

    if (!user) {
        return next(new ErrorHandler("User not found", 404));
    }

    req.user = user;
    next(); 
});


export const isAuthorized = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return next(
                new ErrorHandler(`Role: ${req.user.role} is not allowed to access this resource`, 403)
            );
        }
        next();
    };
};
