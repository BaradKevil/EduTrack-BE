export const generateToken = (user, statusCode, message, res) => {
    const token = user.generateToken();

    // Options shared by all cookie settings
    const isProd = process.env.NODE_ENV === "production";
    const cookieOptions = {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? "None" : "Lax",
        path: "/",
    };

    // Set expiry from env (e.g. "7d") — cookie expects milliseconds
    // Parse the same value the JWT uses so cookie and token expire together
    const expireMs = parseDuration(process.env.JWT_EXPIRE || "7d");
    if (expireMs) {
        cookieOptions.expires = new Date(Date.now() + expireMs);
    }

    res.cookie("token", token, cookieOptions);

    // Send back user object without the password field
    const { password, ...userData } = user._doc || user.toObject();

    res.status(statusCode).json({
        success: true,
        message,
        token,
        user: userData,
    });
};


// ── helper: converts "7d", "1h", "30m" etc to milliseconds ──
function parseDuration(str) {
    const match = str.match(/^(\d+)([dhms])$/);
    if (!match) return null;
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const map = { d: 86400000, h: 3600000, m: 60000, s: 1000 };
    return num * map[unit];
}
